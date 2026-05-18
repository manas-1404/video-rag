import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos, ocrFrames } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { Type } from "@google/genai";
import { z } from "zod";
import { genAI, pinecone } from "@/lib/genai";

const bodySchema = z.object({
  videoId: z.string().uuid(),
  question: z.string().min(1).max(1000),
  // last 5 turns = up to 10 messages (user + assistant alternating)
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(10)
    .optional(),
});

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "search_transcript",
        description:
          "Search the spoken audio transcript of the video. Use this when the question is about what someone said, spoke, or narrated.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "Natural language search query for the transcript",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search_ocr",
        description:
          "Search text visible on screen — slides, whiteboards, captions, overlays, titles. Use this when the question is about written or displayed text.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "Keywords or phrase to search for in on-screen text",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search_scene",
        description:
          "Search visual scene descriptions — what is happening visually, who is visible, objects, setting, actions. Use this when the question is about visual content.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "Natural language description of the visual to search for",
            },
          },
          required: ["query"],
        },
      },
    ],
  },
];

type ToolResult = {
  timestampMs: number;
  text: string;
  source: "transcript" | "ocr" | "scene";
};

async function embedQuery(question: string): Promise<number[]> {
  const result = await genAI.models.embedContent({
    model: "gemini-embedding-001",
    contents: question,
  });
  return result.embeddings![0].values!;
}

async function searchTranscript(query: string, videoId: string): Promise<ToolResult[]> {
  const vector = await embedQuery(query);
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
  const result = await index.query({
    vector,
    topK: 3,
    filter: { video_id: { $eq: videoId } },
    includeMetadata: true,
    namespace: "transcript",
  });
  return result.matches.map((m) => ({
    timestampMs: (m.metadata?.start_ms as number) ?? 0,
    text: (m.metadata?.sentence as string) ?? "",
    source: "transcript" as const,
  }));
}

async function searchOcr(query: string, videoId: string): Promise<ToolResult[]> {
  const rows = await db
    .select({ timestampMs: ocrFrames.timestampMs, ocrText: ocrFrames.ocrText })
    .from(ocrFrames)
    .where(
      and(
        eq(ocrFrames.videoId, videoId),
        sql`to_tsvector('english', array_to_string(${ocrFrames.ocrText}, ' ')) @@ plainto_tsquery('english', ${query})`
      )
    )
    .limit(5);

  return rows.map((r) => ({
    timestampMs: r.timestampMs,
    text: (r.ocrText ?? []).join(" | "),
    source: "ocr" as const,
  }));
}

async function searchScene(query: string, videoId: string): Promise<ToolResult[]> {
  const vector = await embedQuery(query);
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
  const result = await index.query({
    vector,
    topK: 3,
    filter: { video_id: { $eq: videoId } },
    includeMetadata: true,
    namespace: "scenes",
  });
  return result.matches.map((m) => ({
    timestampMs: (m.metadata?.start_ms as number) ?? 0,
    text: (m.metadata?.sentence as string) ?? "",
    source: "scene" as const,
  }));
}

function emitAnswer(
  emit: (e: object) => void,
  rawText: string,
  allResults: ToolResult[],
) {
  let answerJson: {
    timestamp_ms: number;
    explanation: string;
    strongest_signal: "transcript" | "ocr" | "scene";
  };

  try {
    const cleaned = rawText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    answerJson = JSON.parse(cleaned);
  } catch {
    const best = allResults[0];
    answerJson = {
      timestamp_ms: best?.timestampMs ?? 0,
      explanation: rawText || "I searched the video but couldn't produce a clear answer. Try rephrasing your question.",
      strongest_signal: best?.source ?? "transcript",
    };
  }

  const candidates = allResults.slice(0, 5).map((r, i) => ({
    transcriptText: r.source === "transcript" ? r.text : "",
    startMs: r.timestampMs,
    endMs: r.timestampMs,
    ocrText: r.source === "ocr" ? r.text.split(" | ") : [],
    sceneDescription: r.source === "scene" ? r.text : "",
    strongestSignal: r.source,
    isBest: i === 0,
  }));

  emit({
    type: "answer",
    primaryTimestampMs: answerJson.timestamp_ms ?? allResults[0]?.timestampMs ?? 0,
    explanation: answerJson.explanation,
    candidates,
  });
}

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

  const { videoId, question, history } = parsed.data;

  const [video] = await db
    .select({ id: videos.id, status: videos.status })
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, session.user.id)));

  if (!video) return Response.json({ error: "Not found" }, { status: 404 });
  if (video.status !== "READY") return Response.json({ error: "Video not ready" }, { status: 409 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const conversationContext =
          history && history.length > 0
            ? `\n\nPrevious conversation (for resolving references like "that", "it", "before that"):\n${history
                .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
                .join("\n")}\n`
            : "";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let messages: any[] = [
          {
            role: "user",
            parts: [
              {
                text: `You are a video intelligence assistant. You have three search tools:
- search_transcript: searches the spoken audio transcript
- search_ocr: searches text visible on screen (slides, captions, titles, whiteboards, code)
- search_scene: searches visual scene descriptions (what is happening, who is visible, objects, actions)

Your job is to answer the question by searching thoroughly. You must NEVER give up after one failed search.
${conversationContext}
SEARCH STRATEGY — follow this every time:
1. Search all three tools with an initial query relevant to the question.
2. After receiving results, REFLECT: are the results sufficient to answer fully? If not, search again.
3. If a search returns 0 or few results, do NOT stop. Reformulate the query — try synonyms, broader terms, or break the question into sub-queries — then search again.
4. For list/summary questions (e.g. "all headings", "every time X is mentioned", "what topics are covered"), you MUST run multiple searches with varied queries to collect all instances. One search is never enough for these.
5. Try every relevant tool before concluding. A failed transcript search does not mean OCR or scene search will also fail.
6. Only stop searching and move to answering when you have enough evidence, or you have genuinely exhausted varied query attempts.

TIMESTAMP RULES:
- Never invent or approximate timestamps. Only use exact timestamp_ms values returned by the tools.
- Do not mention timestamps in your explanation text.

ANSWERING RULES:
- Base your answer only on what the tools returned.
- If results are thin, report what you did find rather than refusing.
- Never say "I cannot answer" — always reason over whatever was retrieved.

Current question: "${question}"`,
              },
            ],
          },
        ];

        const allResults: ToolResult[] = [];
        let iterations = 0;
        let answered = false;

        // Raised from 3 to 6 — list/summary questions need multiple search rounds
        while (iterations < 6) {
          const response = await genAI.models.generateContent({
            model: "gemini-2.5-pro",
            contents: messages,
            config: {
              tools: TOOLS,
              thinkingConfig: { thinkingBudget: 512 },
            },
          });

          const candidate = response.candidates?.[0];
          if (!candidate || !candidate.content) break;

          const functionCalls = candidate.content.parts?.filter((p: { functionCall?: unknown }) => p.functionCall) ?? [];

          if (functionCalls.length === 0) {
            // Model decided to stop searching — synthesize
            const synthesisMessages = allResults.length > 0 ? [
              ...messages,
              {
                role: "user",
                parts: [{
                  text: `You have finished searching. Now synthesize a final answer using ONLY the tool results above.

RULES:
- Reason over ALL retrieved results, not just the first one.
- For list/summary questions, compile every relevant item found across all searches.
- Do not mention timestamps in your explanation.
- Use ONLY timestamp_ms values that came from tool results.
- If evidence is partial, say what was found and note what may be missing.
- Return ONLY valid JSON (no markdown fences):
{"timestamp_ms": <best or most relevant timestamp_ms from results, or 0 if none>, "explanation": "<your full answer>", "strongest_signal": "<transcript|ocr|scene>"}`,
                }],
              },
            ] : messages;

            const synthesisResponse = allResults.length > 0
              ? await genAI.models.generateContent({
                  model: "gemini-2.5-pro",
                  contents: synthesisMessages,
                  config: { thinkingConfig: { thinkingBudget: 2048 } },
                })
              : response;

            answered = true;
            emitAnswer(emit, synthesisResponse.text?.trim() ?? "", allResults);
            break;
          }

          // Execute all function calls in this iteration
          const toolResponseParts = [];

          for (const part of functionCalls) {
            const call = part.functionCall as { name: string; args: { query: string } };
            const toolName = call.name;
            const query = call.args?.query ?? question;

            emit({ type: "tool_call", tool: toolName, query });

            let results: ToolResult[] = [];
            try {
              if (toolName === "search_transcript") {
                results = await searchTranscript(query, videoId);
              } else if (toolName === "search_ocr") {
                results = await searchOcr(query, videoId);
              } else if (toolName === "search_scene") {
                results = await searchScene(query, videoId);
              }
            } catch {
              results = [];
            }

            allResults.push(...results);

            const snippet = results[0]?.text?.slice(0, 120) ?? "(no results)";
            emit({ type: "tool_result", tool: toolName, count: results.length, snippet });

            toolResponseParts.push({
              functionResponse: {
                name: toolName,
                response: {
                  results: results.map((r) => ({
                    timestamp_ms: r.timestampMs,
                    text: r.text,
                  })),
                },
              },
            });
          }

          messages = [
            ...messages,
            { role: "model", parts: candidate.content.parts ?? [] },
            { role: "tool", parts: toolResponseParts },
          ];

          iterations++;
        }

        // Fallback: loop exited without a synthesis step (iteration cap hit, or no candidate)
        if (!answered) {
          if (allResults.length > 0) {
            // Force a synthesis pass over whatever we collected
            const forcedMessages = [
              ...messages,
              {
                role: "user",
                parts: [{
                  text: `You have searched the video and collected results. Now answer the question using only those results.

RULES:
- Use ONLY the exact timestamp_ms values from the tool results.
- Do not write any timestamps in your explanation text.
- Summarise all relevant findings — this may be a list or multi-part answer.
- Return ONLY valid JSON: {"timestamp_ms": <best timestamp_ms>, "explanation": "<your answer>", "strongest_signal": "<transcript|ocr|scene>"}`,
                }],
              },
            ];
            const forcedResponse = await genAI.models.generateContent({
              model: "gemini-2.5-pro",
              contents: forcedMessages,
              config: { thinkingConfig: { thinkingBudget: 1024 } },
            });
            emitAnswer(emit, forcedResponse.text?.trim() ?? "", allResults);
          } else {
            // No tools were called or all returned empty — emit a graceful answer
            emit({
              type: "answer",
              primaryTimestampMs: 0,
              explanation: "I searched the video across speech, on-screen text, and visual context but couldn't find relevant information to answer your question. Try rephrasing or asking about a more specific moment.",
              candidates: [],
            });
          }
        }
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
