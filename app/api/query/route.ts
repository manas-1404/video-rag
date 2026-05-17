import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos, asrChunks, ocrFrames, sceneFrames } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { Pinecone } from "@pinecone-database/pinecone";
import { z } from "zod";

if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
if (!process.env.PINECONE_API_KEY) throw new Error("PINECONE_API_KEY is not set");

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const bodySchema = z.object({
  videoId: z.string().uuid(),
  question: z.string().min(1).max(1000),
});

type Candidate = {
  transcriptText: string;
  startMs: number;
  endMs: number;
  ocrText: string[];
  sceneDescription: string;
};

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { videoId, question } = parsed.data;

  // Verify the video belongs to the user and is READY
  const [video] = await db
    .select({ id: videos.id, status: videos.status })
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, session.user.id)));

  if (!video) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (video.status !== "READY") {
    return Response.json({ error: "Video not ready" }, { status: 409 });
  }

  // Step 1: Embed the query — must match gemini-embedding-001 used by Python server
  const embeddingResult = await genAI.models.embedContent({
    model: "gemini-embedding-001",
    contents: question,
  });
  const queryVector = embeddingResult.embeddings![0].values!;

  // Step 2: Search Pinecone for top 3 transcript chunks
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
  const searchResult = await index.query({
    vector: queryVector,
    topK: 3,
    filter: { video_id: { $eq: videoId } },
    includeMetadata: true,
  });

  if (searchResult.matches.length === 0) {
    return Response.json({ error: "No matches found" }, { status: 404 });
  }

  // Step 3: For each candidate, fetch ASR chunk + OCR + scene from Postgres
  const candidates: Candidate[] = await Promise.all(
    searchResult.matches.map(async (match) => {
      const sentence = (match.metadata?.sentence as string) ?? "";
      const startMs = (match.metadata?.start_ms as number) ?? 0;
      const endMs = (match.metadata?.end_ms as number) ?? 0;

      const frameTimestampMs = Math.round(startMs / 1000) * 1000;

      const [ocrRow] = await db
        .select({ ocrText: ocrFrames.ocrText })
        .from(ocrFrames)
        .where(
          and(
            eq(ocrFrames.videoId, videoId),
            eq(ocrFrames.timestampMs, frameTimestampMs)
          )
        );

      const [sceneRow] = await db
        .select({ description: sceneFrames.description })
        .from(sceneFrames)
        .where(
          and(
            eq(sceneFrames.videoId, videoId),
            eq(sceneFrames.timestampMs, frameTimestampMs)
          )
        );

      return {
        transcriptText: sentence,
        startMs,
        endMs,
        ocrText: ocrRow?.ocrText ?? [],
        sceneDescription: sceneRow?.description ?? "",
      };
    })
  );

  // Step 4: Agent reasoning with Gemini 2.0 Flash

  const candidateContext = candidates
    .map(
      (c, i) => `Candidate ${i + 1} (${c.startMs}ms – ${c.endMs}ms):
Transcript: ${c.transcriptText}
OCR text on screen: ${c.ocrText.length > 0 ? c.ocrText.join(" | ") : "(none)"}
Visual scene: ${c.sceneDescription || "(none)"}`
    )
    .join("\n\n");

  const agentPrompt = `You are analyzing a video to answer the user's question.

Question: "${question}"

Here are 3 candidate moments from the video:

${candidateContext}

Based on all three knowledge sources (transcript, on-screen text, visual scene), identify which candidate best answers the question.

Return ONLY valid JSON with this exact structure:
{
  "best_candidate_index": 0,
  "timestamp_ms": 0,
  "explanation": "why this moment best answers the question",
  "strongest_signal": "transcript"
}

Rules:
- best_candidate_index: 0, 1, or 2 (zero-based)
- timestamp_ms: the start_ms of the best candidate
- strongest_signal: one of "transcript", "ocr", or "scene"`;

  const agentResult = await genAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents: agentPrompt,
  });
  const agentText = agentResult.text!.trim();

  let agentJson: {
    best_candidate_index: number;
    timestamp_ms: number;
    explanation: string;
    strongest_signal: "transcript" | "ocr" | "scene";
  };

  try {
    const cleaned = agentText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    agentJson = JSON.parse(cleaned);
  } catch {
    return Response.json({ error: "Agent response parse failed" }, { status: 500 });
  }

  // Step 5: Build response
  const bestIdx = Math.max(0, Math.min(2, agentJson.best_candidate_index));

  return Response.json({
    primaryTimestampMs: agentJson.timestamp_ms ?? candidates[bestIdx].startMs,
    explanation: agentJson.explanation,
    candidates: candidates.map((c, i) => ({
      transcriptText: c.transcriptText,
      startMs: c.startMs,
      endMs: c.endMs,
      ocrText: c.ocrText,
      sceneDescription: c.sceneDescription,
      strongestSignal:
        i === bestIdx ? agentJson.strongest_signal : "transcript",
      isBest: i === bestIdx,
    })),
  });
}
