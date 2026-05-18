import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { genAI, pinecone } from "@/lib/genai";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  if (!videoId) return Response.json({ error: "Missing videoId" }, { status: 400 });

  const [video] = await db
    .select({ id: videos.id, title: videos.title, status: videos.status })
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, session.user.id)));

  if (!video) return Response.json({ error: "Not found" }, { status: 404 });
  if (video.status !== "READY") return Response.json({ suggestions: [] });

  try {
    // Sample a few chunks from transcript and scenes to understand video content
    const embeddingResult = await genAI.models.embedContent({
      model: "gemini-embedding-001",
      contents: "main topics and key content of this video",
    });
    const vector = embeddingResult.embeddings![0].values!;

    const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);

    const [transcriptHits, sceneHits] = await Promise.all([
      index.query({
        vector,
        topK: 4,
        filter: { video_id: { $eq: videoId } },
        includeMetadata: true,
        namespace: "transcript",
      }),
      index.query({
        vector,
        topK: 3,
        filter: { video_id: { $eq: videoId } },
        includeMetadata: true,
        namespace: "scenes",
      }),
    ]);

    const transcriptSamples = transcriptHits.matches
      .map((m) => m.metadata?.sentence as string)
      .filter(Boolean)
      .join("\n");

    const sceneSamples = sceneHits.matches
      .map((m) => m.metadata?.sentence as string)
      .filter(Boolean)
      .join("\n");

    const prompt = `You are helping a user explore a video titled "${video.title}".

Here are some sample transcript excerpts from the video:
${transcriptSamples || "(none)"}

Here are some sample visual scene descriptions from the video:
${sceneSamples || "(none)"}

Based on this content, generate exactly 4 short, specific questions a user would naturally want to ask about this video.
- Each question should be specific to the actual content above, not generic
- Mix question types: one about spoken content, one about visuals/slides, one about a specific topic mentioned, one broader summary
- Keep each question under 12 words
- Return ONLY a JSON array of 4 strings, nothing else. Example: ["Q1", "Q2", "Q3", "Q4"]`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });

    const raw = response.text?.trim() ?? "[]";
    const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const suggestions = JSON.parse(cleaned);

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return Response.json({ suggestions: [] });
    }

    return Response.json({ suggestions: suggestions.slice(0, 4) });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
