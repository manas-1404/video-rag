import os
from dotenv import load_dotenv

load_dotenv()

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
