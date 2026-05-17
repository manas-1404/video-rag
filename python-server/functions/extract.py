"""
Inngest function: extract-frames-and-audio
Trigger: video/uploaded
Emits:  extraction/complete
"""

import os
import glob
import tempfile
import inngest
from lib import db, storage
from lib.inngest_client import client


@client.create_function(
    fn_id="extract-frames-and-audio",
    trigger=inngest.TriggerEvent(event="video/uploaded"),
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
        audio_path, frame_paths = await ctx.step.run(
            "run-ffmpeg",
            lambda: _run_ffmpeg(video_path),
        )

        audio_url = await ctx.step.run(
            "upload-audio",
            lambda: storage.upload_file(audio_path, f"videos/{video_id}/audio.wav"),
        )

        db.update_video_audio_url(video_id, audio_url)

        frame_urls: list[str] = await ctx.step.run(
            "upload-frames",
            lambda: _upload_frames(video_id, frame_paths),
        )

        await ctx.step.send_event(
            "emit-extraction-complete",
            inngest.Event(
                name="extraction/complete",
                data={
                    "videoId": video_id,
                    "audioUrl": audio_url,
                    "frameUrls": frame_urls,
                },
            ),
        )
    finally:
        _cleanup(video_path, audio_path)


def _run_ffmpeg(video_path: str) -> tuple[str, list[str]]:
    import ffmpeg

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
    return audio_path, frame_paths


def _upload_frames(video_id: str, frame_paths: list[str]) -> list[str]:
    urls = []
    for i, path in enumerate(frame_paths):
        url = storage.upload_file(path, f"videos/{video_id}/frames/{i:04d}.jpg")
        urls.append(url)
    return urls


def _cleanup(*paths):
    import os
    for p in paths:
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass
