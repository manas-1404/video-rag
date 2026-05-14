"""
Inngest function: process-visual
Trigger: extraction/complete
Emits:  visual/complete

Iterates over extracted frames in batches of 10, calls Gemini 2.0 Flash
per frame for OCR + scene description, writes to Postgres.
"""

import os
import tempfile
import inngest
from lib import db, storage
from lib.inngest_client import client
from lib.gemini_client import analyze_frame

BATCH_SIZE = 10


@client.create_function(
    fn_id="process-visual",
    trigger=inngest.TriggerEvent(event="extraction/complete"),
)
async def process_visual(ctx: inngest.Context, step: inngest.Step) -> None:
    video_id: str = ctx.event.data["videoId"]
    frame_urls: list[str] = ctx.event.data["frameUrls"]

    batches = [
        frame_urls[i : i + BATCH_SIZE]
        for i in range(0, len(frame_urls), BATCH_SIZE)
    ]

    for batch_idx, batch in enumerate(batches):
        await step.run(
            f"process-frame-batch-{batch_idx}",
            lambda b=batch, bi=batch_idx: _process_batch(video_id, b, bi),
        )

    await step.send_event(
        "emit-visual-complete",
        inngest.Event(name="visual/complete", data={"videoId": video_id}),
    )


def _process_batch(video_id: str, frame_urls: list[str], batch_idx: int):
    for i, url in enumerate(frame_urls):
        # Frame index determines timestamp: frames are 1 frame/sec, 1-indexed
        frame_number = batch_idx * BATCH_SIZE + i + 1
        timestamp_ms = (frame_number - 1) * 1000

        local_path = storage.download_to_temp(url, ".jpg")
        try:
            result = analyze_frame(local_path)
            ocr_text: list[str] = result.get("ocr_text", [])
            scene_description: str = result.get("scene_description", "")

            if ocr_text:
                db.insert_ocr_frame(video_id, timestamp_ms, ocr_text)
            if scene_description:
                db.insert_scene_frame(video_id, timestamp_ms, scene_description)
        finally:
            if os.path.exists(local_path):
                os.remove(local_path)
