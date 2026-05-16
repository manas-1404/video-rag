import os
import time
from pinecone import Pinecone, ServerlessSpec

_pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "videorag")

_index = None


def get_index():
    global _index
    if _index is None:
        existing = [i.name for i in _pc.list_indexes()]
        if INDEX_NAME not in existing:
            _pc.create_index(
                name=INDEX_NAME,
                dimension=3072,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )
            # Wait until index is ready (max 90s)
            for _ in range(30):
                status = _pc.describe_index(INDEX_NAME).status
                print(f"[pinecone] index state: {status.state}, ready: {status.ready}", flush=True)
                if status.ready:
                    break
                time.sleep(3)

        _index = _pc.Index(INDEX_NAME)
    return _index


def upsert_vector(
    vector_id: str,
    embedding: list[float],
    video_id: str,
    sentence: str,
    start_ms: int,
    end_ms: int,
):
    index = get_index()
    index.upsert(
        vectors=[
            {
                "id": vector_id,
                "values": embedding,
                "metadata": {
                    "video_id": video_id,
                    "sentence": sentence,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                },
            }
        ]
    )
