"""
Inngest function: process-visual
Trigger: extraction/complete
Emits:  visual/complete

Step 1 — deduplicate-frames:
  Downloads all frames, computes full-frame pHash for each in parallel.
  Groups frames into unique visual states using Hamming distance.
  Frames within PHASH_SKIP_THRESHOLD bits of an existing state are merged
  into that state's timestamp list rather than triggering a new Gemini call.
  Returns the de-duped list so batch steps only process truly unique frames.

Steps 2+ — process-frame-batch-N:
  For each unique frame, calls Gemini for OCR + scene description,
  then batch-writes to Postgres and Pinecone with all associated timestamps.
"""

import os
import uuid
import hashlib
import inngest
import imagehash
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed
from lib import db, storage
from lib.inngest_client import client
from lib.gemini_client import analyze_frame, embed_text
from lib.pinecone_client import get_index

BATCH_SIZE = 10
DEDUP_WORKERS = 20
PHASH_SKIP_THRESHOLD = 8


@client.create_function(
    fn_id="process-visual",
    trigger=inngest.TriggerEvent(event="extraction/complete"),
)
async def process_visual(ctx: inngest.Context) -> None:
    video_id: str = ctx.event.data["videoId"]
    frame_urls: list[str] = ctx.event.data["frameUrls"]

    unique_frames = await ctx.step.run(
        "deduplicate-frames",
        lambda: _deduplicate_frames(frame_urls),
    )

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


def _deduplicate_frames(frame_urls: list[str]) -> list[dict]:
    """
    Returns list of {"url": str, "timestamps_ms": [int, ...]} — one per unique visual state.
    Frames whose pHash is within PHASH_SKIP_THRESHOLD of an existing state are not returned
    as separate entries; their timestamps are folded into the matching state instead.
    """
    def compute_hash(i: int, url: str) -> tuple[int, str, object]:
        timestamp_ms = i * 1000
        local_path = storage.download_to_temp(url, ".jpg")
        try:
            h = imagehash.phash(Image.open(local_path))
            return (timestamp_ms, url, h)
        finally:
            if os.path.exists(local_path):
                os.remove(local_path)

    ordered: list[tuple[int, str, object] | None] = [None] * len(frame_urls)
    with ThreadPoolExecutor(max_workers=DEDUP_WORKERS) as executor:
        futures = {executor.submit(compute_hash, i, url): i for i, url in enumerate(frame_urls)}
        for future in as_completed(futures):
            idx = futures[future]
            try:
                ordered[idx] = future.result()
            except Exception as e:
                print(f"[visual] pHash failed for frame {idx}: {e}", flush=True)

    # Sequential dedup in temporal order so earlier occurrences are canonical
    seen: list[tuple[object, dict]] = []  # [(phash, frame_entry), ...]

    for item in ordered:
        if item is None:
            continue
        timestamp_ms, url, h = item
        matched = None
        for existing_hash, entry in seen:
            if (h - existing_hash) <= PHASH_SKIP_THRESHOLD:
                matched = entry
                break
        if matched is not None:
            matched["timestamps_ms"].append(timestamp_ms)
        else:
            entry = {"url": url, "timestamps_ms": [timestamp_ms]}
            seen.append((h, entry))

    unique_frames = [entry for _, entry in seen]
    skipped = len(frame_urls) - len(unique_frames)
    print(
        f"[visual] deduplicated {len(frame_urls)} frames → {len(unique_frames)} unique ({skipped} skipped, threshold={PHASH_SKIP_THRESHOLD})",
        flush=True,
    )
    return unique_frames


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
        rows = []
        for timestamps_ms, desc in scene_map.values():
            for ts in timestamps_ms:
                rows.append((ts, desc))
        db.insert_scene_frames_batch(video_id, rows)

    def write_ocr():
        rows = []
        for timestamps_ms, ocr in ocr_map.values():
            for ts in timestamps_ms:
                rows.append((ts, ocr))
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
