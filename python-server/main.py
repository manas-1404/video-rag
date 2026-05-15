import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Debug: print which required vars are present or missing
required = [
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
    "GEMINI_API_KEY",
    "PINECONE_API_KEY",
    "DATABASE_URL",
    "BLOB_READ_WRITE_TOKEN",
]
for var in required:
    val = os.environ.get(var)
    print(f"[startup] {var}: {'SET' if val else 'MISSING'}", file=sys.stderr)

import inngest.fast_api
from fastapi import FastAPI
from lib.inngest_client import client
from functions import extract_frames_and_audio, process_asr, process_visual, mark_ready

app = FastAPI(title="VideoRAG Python Server")

inngest.fast_api.serve(
    app,
    client,
    [extract_frames_and_audio, process_asr, process_visual, mark_ready],
)


@app.get("/health")
def health():
    return {"status": "ok"}
