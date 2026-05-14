"""
Inngest function: process-asr
Trigger: extraction/complete
Emits:  asr/complete

Groups Whisper words into sentence chunks, builds sliding-window context
embeddings, writes to Postgres + Pinecone.
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
CONTEXT_WINDOW_SEC = 3.0


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model


@client.create_function(
    fn_id="process-asr",
    trigger=inngest.TriggerEvent(event="extraction/complete"),
)
async def process_asr(ctx: inngest.Context, step: inngest.Step) -> None:
    video_id: str = ctx.event.data["videoId"]
    audio_url: str = ctx.event.data["audioUrl"]

    await step.run("update-status-processing", lambda: db.update_video_status(video_id, "PROCESSING"))

    audio_path = await step.run(
        "download-audio",
        lambda: storage.download_to_temp(audio_url, ".wav"),
    )

    words = await step.run("transcribe", lambda: _transcribe(audio_path))

    chunks = _group_into_chunks(words)

    await step.run(
        "embed-and-store-chunks",
        lambda: _embed_and_store(video_id, chunks, words),
    )

    await step.send_event(
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
    """Group words into sentence chunks by detecting pause gaps."""
    if not words:
        return []

    chunks = []
    current: list[dict] = [words[0]]

    for w in words[1:]:
        gap = w["start"] - current[-1]["end"]
        if gap >= PAUSE_GAP_SEC:
            chunks.append(_make_chunk(current))
            current = [w]
        else:
            current.append(w)

    if current:
        chunks.append(_make_chunk(current))

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


def _build_context_string(chunk: dict, all_words: list[dict]) -> str:
    """Sliding window: grab words ±3s around this chunk's center."""
    center_sec = (chunk["start_ms"] + chunk["end_ms"]) / 2 / 1000
    lo = center_sec - CONTEXT_WINDOW_SEC
    hi = center_sec + CONTEXT_WINDOW_SEC

    context_words = [
        w["word"].strip()
        for w in all_words
        if w["start"] >= lo and w["end"] <= hi
    ]
    return " ".join(context_words).strip() or chunk["text"]


def _embed_and_store(video_id: str, chunks: list[dict], all_words: list[dict]):
    for chunk in chunks:
        context_str = _build_context_string(chunk, all_words)
        embedding = embed_text(context_str)

        vector_id = str(uuid.uuid4())

        upsert_vector(
            vector_id=vector_id,
            embedding=embedding,
            video_id=video_id,
            sentence=chunk["text"],
            start_ms=chunk["start_ms"],
            end_ms=chunk["end_ms"],
        )

        db.insert_asr_chunk(
            video_id=video_id,
            text=chunk["text"],
            start_ms=chunk["start_ms"],
            end_ms=chunk["end_ms"],
            word_timestamps=chunk["word_timestamps"],
            pinecone_id=vector_id,
        )
