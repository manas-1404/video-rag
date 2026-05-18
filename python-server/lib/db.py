import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

DATABASE_URL = os.environ["DATABASE_URL"]


@contextmanager
def get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_video_status(video_id: str, status: str, error_message: str | None = None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE videos
                SET status = %s,
                    error_message = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (status, error_message, video_id),
            )


def insert_asr_chunk(
    video_id: str,
    text: str,
    start_ms: int,
    end_ms: int,
    word_timestamps: list,
    pinecone_id: str,
) -> str:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO asr_chunks (video_id, text, start_ms, end_ms, word_timestamps, pinecone_id)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                RETURNING id
                """,
                (
                    video_id,
                    text,
                    start_ms,
                    end_ms,
                    psycopg2.extras.Json(word_timestamps),
                    pinecone_id,
                ),
            )
            return cur.fetchone()[0]


def insert_ocr_frame(video_id: str, timestamp_ms: int, ocr_text: list[str]):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ocr_frames (video_id, timestamp_ms, ocr_text)
                VALUES (%s, %s, %s::jsonb)
                ON CONFLICT DO NOTHING
                """,
                (video_id, timestamp_ms, psycopg2.extras.Json(ocr_text)),
            )


def insert_scene_frame(video_id: str, timestamp_ms: int, description: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO scene_frames (video_id, timestamp_ms, description)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (video_id, timestamp_ms, description),
            )


def insert_ocr_frames_batch(video_id: str, frames: list[tuple[int, list[str]]]):
    if not frames:
        return
    with get_conn() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO ocr_frames (video_id, timestamp_ms, ocr_text)
                VALUES %s
                ON CONFLICT DO NOTHING
                """,
                [(video_id, ts, psycopg2.extras.Json(ocr)) for ts, ocr in frames],
            )


def insert_scene_frames_batch(video_id: str, frames: list[tuple[int, str]]):
    if not frames:
        return
    with get_conn() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO scene_frames (video_id, timestamp_ms, description)
                VALUES %s
                ON CONFLICT DO NOTHING
                """,
                [(video_id, ts, desc) for ts, desc in frames],
            )


def update_video_audio_url(video_id: str, audio_url: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE videos SET audio_url = %s, updated_at = NOW() WHERE id = %s",
                (audio_url, video_id),
            )
