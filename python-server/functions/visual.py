"""
Inngest function: process-visual
Trigger: extraction/complete
Emits:  visual/complete

Iterates over extracted frames in batches of 10, calls Gemini per frame for
OCR + scene description. Deduplicates by content hash within each batch,
then batch-writes to Postgres and Pinecone in parallel.
"""

import os
import uuid
import hashlib
import inngest
from concurrent.futures import ThreadPoolExecutor, as_completed
from lib import db, storage
from lib.inngest_client import client
from lib.gemini_client import analyze_frame, embed_text
from lib.pinecone_client import upsert_vector, get_index

BATCH_SIZE = 10


@client.create_function(
    fn_id="process-visual",
    trigger=inngest.TriggerEvent(event="extraction/complete"),
)
async def process_visual(ctx: inngest.Context) -> None:
    video_id: str = ctx.event.data["videoId"]
    frame_urls: list[str] = ctx.event.data["frameUrls"]

    batches = [
        frame_urls[i : i + BATCH_SIZE]
        for i in range(0, len(frame_urls), BATCH_SIZE)
    ]

    for batch_idx, batch in enumerate(batches):
        await ctx.step.run(
            f"process-frame-batch-{batch_idx}",
            lambda b=batch, bi=batch_idx: _process_batch(video_id, b, bi),
        )

    await ctx.step.send_event(
        "emit-visual-complete",
        inngest.Event(name="visual/complete", data={"videoId": video_id}),
    )


def _process_batch(video_id: str, frame_urls: list[str], batch_idx: int):
    # ── Phase 1: parallel Gemini calls, no writes ────────────────────────────
    def analyze(i: int, url: str) -> tuple[int, list[str], str]:
        frame_number = batch_idx * BATCH_SIZE + i + 1
        timestamp_ms = (frame_number - 1) * 1000
        local_path = storage.download_to_temp(url, ".jpg")
        try:
            result = analyze_frame(local_path)
            return (
                timestamp_ms,
                result.get("ocr_text", []),
                result.get("scene_description", ""),
            )
        finally:
            if os.path.exists(local_path):
                os.remove(local_path)

    raw_results: list[tuple[int, list[str], str]] = []
    with ThreadPoolExecutor(max_workers=BATCH_SIZE) as executor:
        futures = {executor.submit(analyze, i, url): i for i, url in enumerate(frame_urls)}
        for future in as_completed(futures):
            raw_results.append(future.result())

    # ── Phase 2: deduplicate by content hash ────────────────────────────────
    # key = md5 of content only (no timestamp) → value = (timestamp_ms, content)
    scene_map: dict[str, tuple[int, str]] = {}
    ocr_map: dict[str, tuple[int, list[str]]] = {}

    for timestamp_ms, ocr_text, scene_description in raw_results:
        if scene_description:
            h = hashlib.md5(scene_description.encode()).hexdigest()
            if h not in scene_map:
                scene_map[h] = (timestamp_ms, scene_description)

        if ocr_text:
            h = hashlib.md5("|".join(sorted(ocr_text)).encode()).hexdigest()
            if h not in ocr_map:
                ocr_map[h] = (timestamp_ms, ocr_text)

    # ── Phase 3: parallel batch writes ──────────────────────────────────────
    def write_scenes():
        db.insert_scene_frames_batch(video_id, list(scene_map.values()))

    def write_ocr():
        db.insert_ocr_frames_batch(video_id, list(ocr_map.values()))

    def write_pinecone():
        if not scene_map:
            return
        vectors = []
        for timestamp_ms, scene_description in scene_map.values():
            embedding = embed_text(scene_description)
            vectors.append({
                "id": str(uuid.uuid4()),
                "values": embedding,
                "metadata": {
                    "video_id": video_id,
                    "sentence": scene_description,
                    "start_ms": timestamp_ms,
                    "end_ms": timestamp_ms,
                },
            })
        get_index().upsert(vectors=vectors, namespace="scenes")

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(write_scenes),
            executor.submit(write_ocr),
            executor.submit(write_pinecone),
        ]
        for future in as_completed(futures):
            future.result()
