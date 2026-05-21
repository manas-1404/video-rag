import os
from google import genai
from google.genai import types
from pydantic import BaseModel

_client = genai.Client(vertexai=True, api_key=os.environ["GEMINI_API_KEY"])


class FrameAnalysis(BaseModel):
    ocr_text: list[str]
    scene_description: str

FRAME_ANALYSIS_PROMPT = """Analyze this video frame carefully.

Return ONLY valid JSON (no markdown, no explanation) with exactly these two fields:
{
  "ocr_text": ["array", "of", "all", "text", "strings", "visible", "in", "this", "frame"],
  "scene_description": "A detailed natural language description of everything happening in this frame: gestures, pointing actions, visible diagrams, drawings, speaker activity, body language, and any important visual context."
}

If no text is visible, return an empty array for ocr_text."""


def analyze_frame(image_path: str) -> dict:
    """Run Gemini 2.5 Flash on a single frame. Returns {ocr_text, scene_description}."""
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    from pathlib import Path
    ext = Path(image_path).suffix.lower()
    mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"

    response = _client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime),
            FRAME_ANALYSIS_PROMPT,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=FrameAnalysis,
            temperature=0,
        ),
    )

    parsed: FrameAnalysis | None = response.parsed
    if parsed is None:
        return {"ocr_text": [], "scene_description": ""}
    return {"ocr_text": parsed.ocr_text, "scene_description": parsed.scene_description}


def embed_text(text: str) -> list[float]:
    """Embed a text string using Gemini embedding model."""
    model = "gemini-embedding-001"
    print(f"[gemini] embed_text using model: {model}", flush=True)
    result = _client.models.embed_content(
        model=model,
        contents=text,
    )
    return result.embeddings[0].values
