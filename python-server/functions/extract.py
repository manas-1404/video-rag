"""
Inngest function: extract-frames-and-audio
Trigger: video/uploaded
Invokes: process_asr + process_visual in parallel via ctx.group.parallel
Effect: marks video READY after both complete

pHash dedup runs before upload — only unique frames are uploaded to S3.
Duplicate frames have their timestamps folded into the matching unique frame's
timestamps_ms list so no timestamp is lost in the knowledge base.
"""

import os
import glob
import tempfile
import inngest
import imagehash
from PIL import Image
from lib import db, storage
from lib.inngest_client import client

PHASH_SKIP_THRESHOLD = 8


@client.create_function(
    fn_id="extract-frames-and-audio",
    trigger=inngest.TriggerEvent(event="video/uploaded"),
    concurrency=[inngest.Concurrency(limit=1)],
)
async def extract_frames_and_audio(ctx: inngest.Context) -> None:
    video_id: str = ctx.event.data["videoId"]
    blob_url: str = ctx.event.data["blobUrl"]

    await ctx.step.run("update-status-extracting", lambda: db.update_video_status(video_id, "EXTRACTING"))

    video_path = await ctx.step.run(
        "download-video",
        lambda: storage.download_to_temp(blob_url, ".mp4"),
    )

    audio_path: str | None = None
    try:
        audio_path, frame_paths, duration_seconds = await ctx.step.run(
            "run-ffmpeg",
            lambda: _run_ffmpeg(video_path),
        )

        audio_url = await ctx.step.run(
            "upload-audio",
            lambda: storage.upload_file(audio_path, f"videos/{video_id}/audio.wav"),
        )

        db.update_video_audio_url(video_id, audio_url, duration_seconds)

        unique_frames: list[dict] = await ctx.step.run(
            "dedup-and-upload-frames",
            lambda: _dedup_and_upload_frames(video_id, frame_paths),
        )

        from .asr import process_asr
        from .visual import process_visual

        await ctx.group.parallel((
            lambda: ctx.step.invoke(
                "run-asr",
                function=process_asr,
                data={"videoId": video_id, "audioUrl": audio_url},
            ),
            lambda: ctx.step.invoke(
                "run-visual",
                function=process_visual,
                data={"videoId": video_id, "frameUrls": unique_frames},
            ),
        ))

        await ctx.step.run(
            "set-status-ready",
            lambda: db.update_video_status(video_id, "READY"),
        )
    finally:
        _cleanup(video_path, audio_path)


def _run_ffmpeg(video_path: str) -> tuple[str, list[str], int]:
    import ffmpeg

    probe = ffmpeg.probe(video_path)
    duration_seconds = int(float(probe["format"]["duration"]))

    tmpdir = tempfile.mkdtemp()
    audio_path = os.path.join(tmpdir, "audio.wav")
    frames_pattern = os.path.join(tmpdir, "frame_%04d.jpg")

    # Extract mono 16 kHz WAV for Whisper
    (
        ffmpeg.input(video_path)
        .audio.output(audio_path, ar=16000, ac=1)
        .overwrite_output()
        .run(quiet=True)
    )

    # Extract one frame per second
    (
        ffmpeg.input(video_path)
        .filter("fps", fps=1)
        .output(frames_pattern, qscale=2)
        .overwrite_output()
        .run(quiet=True)
    )

    frame_paths = sorted(glob.glob(os.path.join(tmpdir, "frame_*.jpg")))
    return audio_path, frame_paths, duration_seconds


def _dedup_and_upload_frames(video_id: str, frame_paths: list[str]) -> list[dict]:
    seen: list[tuple[object, dict]] = []  # [(phash, entry), ...]

    for i, path in enumerate(frame_paths):
        timestamp_ms = i * 1000
        with Image.open(path) as img:
            h = imagehash.phash(img)

        matched = None
        for existing_hash, entry in seen:
            if (h - existing_hash) <= PHASH_SKIP_THRESHOLD:
                matched = entry
                break

        if matched is not None:
            matched["timestamps_ms"].append(timestamp_ms)
            os.remove(path)
        else:
            url = storage.upload_file(path, f"videos/{video_id}/frames/{i:04d}.jpg")
            entry = {"url": url, "timestamps_ms": [timestamp_ms]}
            seen.append((h, entry))
            os.remove(path)  # free disk/mem after upload

    unique_frames = [entry for _, entry in seen]
    skipped = len(frame_paths) - len(unique_frames)
    print(f"[extract] {len(frame_paths)} frames → {len(unique_frames)} unique ({skipped} skipped, threshold={PHASH_SKIP_THRESHOLD})", flush=True)
    return unique_frames


def _cleanup(*paths):
    import os
    for p in paths:
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass
