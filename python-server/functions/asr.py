"""
Inngest function: process-asr
Trigger: extraction/complete
Emits:  asr/complete

Groups Whisper words into ~25s chunks with 6s overlap, using pause gaps
as natural split boundaries. Writes to Postgres + Pinecone.
"""

import os
import uuid
import inngest
from faster_whisper import WhisperModel
from lib import db, storage
from lib.inngest_client import client
from lib.gemini_client import embed_text
from lib.pinecone_client import upsert_vector

_model: WhisperModel | None = None

PAUSE_GAP_SEC = 0.4
TARGET_CHUNK_SEC = 25.0
OVERLAP_SEC = 6.0


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model


@client.create_function(
    fn_id="process-asr",
    trigger=inngest.TriggerEvent(event="extraction/complete"),
)
async def process_asr(ctx: inngest.Context) -> None:
    video_id: str = ctx.event.data["videoId"]
    audio_url: str = ctx.event.data["audioUrl"]

    await ctx.step.run("update-status-processing", lambda: db.update_video_status(video_id, "PROCESSING"))

    audio_path = await ctx.step.run(
        "download-audio",
        lambda: storage.download_to_temp(audio_url, ".wav"),
    )

    words = await ctx.step.run("transcribe", lambda: _transcribe(audio_path))

    chunks = _group_into_chunks(words)

    await ctx.step.run(
        "embed-and-store-chunks",
        lambda: _embed_and_store(video_id, chunks),
    )

    await ctx.step.send_event(
        "emit-asr-complete",
        inngest.Event(name="asr/complete", data={"videoId": video_id}),
    )


def _transcribe(audio_path: str) -> list[dict]:
    model = _get_model()
    segments, _ = model.transcribe(audio_path, word_timestamps=True)
    words = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                words.append(
                    {"word": w.word, "start": w.start, "end": w.end}
                )
    return words


def _group_into_chunks(words: list[dict]) -> list[dict]:
    """
    Accumulate words into ~25s chunks, snapping splits to natural pause gaps.
    Each successive chunk starts OVERLAP_SEC before the previous one ended.
    """
    if not words:
        return []

    chunks = []
    i = 0

    while i < len(words):
        chunk_start_time = words[i]["start"]
        target_end_time = chunk_start_time + TARGET_CHUNK_SEC

        # Find the last word index that starts before the target end
        j = i
        while j + 1 < len(words) and words[j + 1]["start"] < target_end_time:
            j += 1

        # Snap forward (up to 3s) to the next natural pause so we don't cut mid-sentence
        snap_limit = words[j]["end"] + 3.0
        k = j
        while k + 1 < len(words) and words[k + 1]["start"] <= snap_limit:
            if words[k + 1]["start"] - words[k]["end"] >= PAUSE_GAP_SEC:
                j = k
                break
            k += 1

        chunks.append(_make_chunk(words[i: j + 1]))

        if j + 1 >= len(words):
            break

        # If remaining new content is shorter than the overlap window, skip overlap
        # so the tail chunk contains only new content (not diluted by the previous chunk).
        remaining_duration = words[-1]["end"] - words[j + 1]["start"]
        if remaining_duration < OVERLAP_SEC:
            i = j + 1
            continue

        # Next chunk starts OVERLAP_SEC before this chunk ended
        overlap_start_time = words[j]["end"] - OVERLAP_SEC
        next_i = j + 1
        for idx in range(i, j + 1):
            if words[idx]["start"] >= overlap_start_time:
                next_i = idx
                break

        # Always advance to avoid an infinite loop on very short audio
        if next_i <= i:
            next_i = j + 1

        i = next_i

    return chunks


def _make_chunk(words: list[dict]) -> dict:
    text = " ".join(w["word"].strip() for w in words).strip()
    return {
        "text": text,
        "start_ms": int(words[0]["start"] * 1000),
        "end_ms": int(words[-1]["end"] * 1000),
        "word_timestamps": [
            {"word": w["word"], "start_ms": int(w["start"] * 1000), "end_ms": int(w["end"] * 1000)}
            for w in words
        ],
    }


def _embed_and_store(video_id: str, chunks: list[dict]):
    for chunk in chunks:
        embedding = embed_text(chunk["text"])

        vector_id = str(uuid.uuid4())

        upsert_vector(
            vector_id=vector_id,
            embedding=embedding,
            video_id=video_id,
            sentence=chunk["text"],
            start_ms=chunk["start_ms"],
            end_ms=chunk["end_ms"],
            namespace="transcript",
        )

        db.insert_asr_chunk(
            video_id=video_id,
            text=chunk["text"],
            start_ms=chunk["start_ms"],
            end_ms=chunk["end_ms"],
            word_timestamps=chunk["word_timestamps"],
            pinecone_id=vector_id,
        )
