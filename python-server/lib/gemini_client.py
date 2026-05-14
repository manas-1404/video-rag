import os
import base64
import json
import google.generativeai as genai
from pathlib import Path

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

_flash = genai.GenerativeModel("gemini-2.0-flash")
_embedding_model = "models/text-embedding-004"

FRAME_ANALYSIS_PROMPT = """Analyze this video frame carefully.

Return ONLY valid JSON (no markdown, no explanation) with exactly these two fields:
{
  "ocr_text": ["array", "of", "all", "text", "strings", "visible", "in", "this", "frame"],
  "scene_description": "A detailed natural language description of everything happening in this frame: gestures, pointing actions, visible diagrams, drawings, speaker activity, body language, and any important visual context."
}

If no text is visible, return an empty array for ocr_text."""


def analyze_frame(image_path: str) -> dict:
    """Run Gemini 2.0 Flash on a single frame. Returns {ocr_text, scene_description}."""
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    ext = Path(image_path).suffix.lower()
    mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"

    response = _flash.generate_content(
        [
            {"mime_type": mime, "data": image_data},
            FRAME_ANALYSIS_PROMPT,
        ]
    )

    text = response.text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def embed_text(text: str) -> list[float]:
    """Embed a text string using Gemini text-embedding-004."""
    result = genai.embed_content(model=_embedding_model, content=text)
    return result["embedding"]
