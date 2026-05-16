"""Helpers for uploading/downloading files via Railway S3-compatible bucket."""

import os
import tempfile
import boto3
from pathlib import Path

BUCKET_NAME = os.environ["BUCKET_NAME"]

_s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["BUCKET_ENDPOINT_URL"],
    aws_access_key_id=os.environ["BUCKET_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["BUCKET_SECRET_ACCESS_KEY"],
    region_name=os.environ.get("BUCKET_REGION", "auto"),
)


def download_to_temp(key: str, suffix: str) -> str:
    """Download an object from the bucket to a temp file. Caller must delete."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.close()
    _s3.download_file(BUCKET_NAME, key, tmp.name)
    return tmp.name


def upload_file(local_path: str, key: str) -> str:
    """Upload a local file to the bucket and return the object key."""
    _s3.upload_file(
        local_path,
        BUCKET_NAME,
        key,
        ExtraArgs={"ContentType": _content_type(local_path)},
    )
    return key


def _content_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {
        ".wav": "audio/wav",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".mp4": "video/mp4",
    }.get(ext, "application/octet-stream")
