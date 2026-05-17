import os
import sys
from dotenv import load_dotenv
import boto3
import inngest.fast_api
from fastapi import FastAPI
from lib.inngest_client import client
from functions import extract_frames_and_audio, process_asr, process_visual, mark_ready
from lib.gemini_client import _client

load_dotenv()

required = [
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
    "GEMINI_API_KEY",
    "PINECONE_API_KEY",
    "DATABASE_URL",
    "BUCKET_NAME",
    "BUCKET_ENDPOINT_URL",
    "BUCKET_ACCESS_KEY_ID",
    "BUCKET_SECRET_ACCESS_KEY",
]
for var in required:
    val = os.environ.get(var)
    print(f"[startup] {var}: {'SET' if val else 'MISSING'}", file=sys.stderr)

response = _client.models.generate_content(model="gemini-2.5-flash", contents="tell me a short story in 2 line")
print(response)
print(f"[startup] Gemini API check: — {response.text.strip()}", file=sys.stderr)

def _configure_bucket_cors():
    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ["BUCKET_ENDPOINT_URL"],
        aws_access_key_id=os.environ["BUCKET_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["BUCKET_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("BUCKET_REGION", "auto"),
    )
    s3.put_bucket_cors(
        Bucket=os.environ["BUCKET_NAME"],
        CORSConfiguration={
            "CORSRules": [
                {
                    "AllowedHeaders": ["*"],
                    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
                    "AllowedOrigins": ["*"],
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3000,
                }
            ]
        },
    )
    print("[startup] Bucket CORS configured", file=sys.stderr)

try:
    _configure_bucket_cors()
except Exception as e:
    print(f"[startup] CORS config failed: {e}", file=sys.stderr)

app = FastAPI(title="VideoRAG Python Server")

inngest.fast_api.serve(
    app,
    client,
    [extract_frames_and_audio, process_asr, process_visual, mark_ready],
)


@app.get("/health")
def health():
    return {"status": "ok"}
