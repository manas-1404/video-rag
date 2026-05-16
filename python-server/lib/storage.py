"""Helpers for downloading from and uploading to Vercel Blob."""

import os
import requests
import tempfile
from pathlib import Path

BLOB_READ_WRITE_TOKEN = os.environ["BLOB_READ_WRITE_TOKEN"]

VERCEL_BLOB_API = "https://blob.vercel-storage.com"


def download_to_temp(url: str, suffix: str) -> str:
    """Download a file from a URL to a named temp file. Caller must delete."""
    resp = requests.get(url, stream=True, timeout=300)
    resp.raise_for_status()

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    for chunk in resp.iter_content(chunk_size=8192):
        tmp.write(chunk)
    tmp.close()
    return tmp.name


def upload_file(local_path: str, blob_pathname: str) -> str:
    """Upload a local file to Vercel Blob and return the public URL."""
    with open(local_path, "rb") as f:
        resp = requests.put(
            f"{VERCEL_BLOB_API}/{blob_pathname}",
            data=f,
            headers={
                "authorization": f"Bearer {BLOB_READ_WRITE_TOKEN}",
                "content-type": _content_type(local_path),
                "x-api-version": "7",
                "cache-control": "public, max-age=31536000",
            },
            timeout=300,
        )
    resp.raise_for_status()
    return resp.json()["url"]


def _content_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {
        ".wav": "audio/wav",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".mp4": "video/mp4",
    }.get(ext, "application/octet-stream")
