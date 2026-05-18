"""
Inngest function: process-visual
Invoked by: extract-frames-and-audio (via ctx.step.invoke)

Receives pre-deduplicated frames: list of {"url": str, "timestamps_ms": [int, ...]}
Each entry is a unique visual state; timestamps_ms lists all seconds where it appeared.

For each unique frame: calls Gemini for OCR + scene description,
then batch-writes to Postgres and Pinecone with all associated timestamps.
"""

import os
import uuid
import hashlib
import inngest
from concurrent.futures import ThreadPoolExecutor, as_completed
from lib import db, storage
from lib.inngest_client import client
from lib.gemini_client import analyze_frame, embed_text
from lib.pinecone_client import get_index

BATCH_SIZE = 10


@client.create_function(
    fn_id="process-visual",
    trigger=inngest.TriggerEvent(event="extraction/complete"),
)
async def process_visual(ctx: inngest.Context) -> None:
    video_id: str = ctx.event.data["videoId"]
    unique_frames: list[dict] = ctx.event.data["frameUrls"]

    batches = [
        unique_frames[i : i + BATCH_SIZE]
        for i in range(0, len(unique_frames), BATCH_SIZE)
    ]

    for batch_idx, batch in enumerate(batches):
        await ctx.step.run(
            f"process-frame-batch-{batch_idx}",
            lambda b=batch: _process_batch(video_id, b),
        )

    await ctx.step.send_event(
        "emit-visual-complete",
        inngest.Event(name="visual/complete", data={"videoId": video_id}),
    )



def _process_batch(video_id: str, frames: list[dict]):
    """
    frames: list of {"url": str, "timestamps_ms": [int, ...]}

    Phase 1: parallel Gemini analysis — one call per unique frame
    Phase 2: content-hash dedup within batch (catches Gemini returning identical text for near-dupes)
    Phase 3: parallel batch writes to scene_frames DB, ocr_frames DB, and Pinecone
             Each unique content is written once per timestamp in timestamps_ms.
    """
    # ── Phase 1: parallel Gemini calls ───────────────────────────────────────
    def analyze(frame: dict) -> tuple[list[int], list[str], str]:
        local_path = storage.download_to_temp(frame["url"], ".jpg")
        try:
            result = analyze_frame(local_path)
            return (
                frame["timestamps_ms"],
                result.get("ocr_text", []),
                result.get("scene_description", ""),
            )
        finally:
            if os.path.exists(local_path):
                os.remove(local_path)

    raw_results: list[tuple[list[int], list[str], str]] = []
    with ThreadPoolExecutor(max_workers=BATCH_SIZE) as executor:
        futures = {executor.submit(analyze, frame): frame for frame in frames}
        for future in as_completed(futures):
            raw_results.append(future.result())

    # ── Phase 2: content-hash dedup ──────────────────────────────────────────
    # key = md5 of content → value = (timestamps_ms_list, content)
    scene_map: dict[str, tuple[list[int], str]] = {}
    ocr_map: dict[str, tuple[list[int], list[str]]] = {}

    for timestamps_ms, ocr_text, scene_description in raw_results:
        if scene_description:
            h = hashlib.md5(scene_description.encode()).hexdigest()
            if h not in scene_map:
                scene_map[h] = (timestamps_ms, scene_description)

        if ocr_text:
            h = hashlib.md5("|".join(sorted(ocr_text)).encode()).hexdigest()
            if h not in ocr_map:
                ocr_map[h] = (timestamps_ms, ocr_text)

    # ── Phase 3: parallel batch writes ───────────────────────────────────────
    def write_scenes():
        rows = [(timestamps_ms[0], desc) for timestamps_ms, desc in scene_map.values()]
        db.insert_scene_frames_batch(video_id, rows)

    def write_ocr():
        rows = [(timestamps_ms[0], ocr) for timestamps_ms, ocr in ocr_map.values()]
        db.insert_ocr_frames_batch(video_id, rows)

    def write_pinecone():
        if not scene_map:
            return
        vectors = []
        for timestamps_ms, scene_description in scene_map.values():
            embedding = embed_text(scene_description)
            vectors.append({
                "id": str(uuid.uuid4()),
                "values": embedding,
                "metadata": {
                    "video_id": video_id,
                    "sentence": scene_description,
                    "start_ms": timestamps_ms[0],
                    "end_ms": timestamps_ms[0],
                },
            })
        get_index().upsert(vectors=vectors, namespace="scenes")

    with ThreadPoolExecutor(max_workers=3) as executor:
        batch_futures = [
            executor.submit(write_scenes),
            executor.submit(write_ocr),
            executor.submit(write_pinecone),
        ]
        for future in as_completed(batch_futures):
            future.result()
