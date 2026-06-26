import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos, ocrFrames, asrChunks, sceneFrames } from "@/lib/db/schema";
import { eq, and, or, sql, lte, gte } from "drizzle-orm";
import { Type, ToolListUnion } from "@google/genai";
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

const TOOLS: ToolListUnion = [
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
      {
        name: "get_content_at",
        description:
          "Retrieve all content (speech, visuals, on-screen text) at a specific timestamp in the video by querying the database directly. Use this when the user references a specific time such as '2:30', '45 seconds in', or 'at the 3 minute mark'. This is a direct time-based lookup — do not call semantic search tools for time-specific questions.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            timestamp_ms: {
              type: Type.INTEGER,
              description: "The timestamp in milliseconds (e.g. 150000 for 2:30, 45000 for 0:45)",
            },
            window_ms: {
              type: Type.INTEGER,
              description: "Milliseconds before and after the timestamp to search. Default is 5000 (±5 seconds).",
            },
          },
          required: ["timestamp_ms"],
        },
      },
      {
        name: "get_content_at_beginning",
        description:
          "Retrieve all content from the beginning of the video. Use when the user asks about the beginning, opening, introduction, start, or first part of the video. If the user specifies a duration (e.g. 'first two minutes', 'opening 30 seconds'), convert it to milliseconds and pass as duration_ms. Default covers the first 60 seconds.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            duration_ms: {
              type: Type.INTEGER,
              description: "How many milliseconds from the start to retrieve. Default is 60000 (first 60 seconds). Example: 120000 for 'first two minutes', 300000 for 'first five minutes'.",
            },
          },
        },
      },
      {
        name: "get_content_at_end",
        description:
          "Retrieve all content from the end of the video. Use when the user asks about the end, conclusion, closing, final section, or last part of the video. If the user specifies a duration (e.g. 'last five minutes', 'final 30 seconds'), convert it to milliseconds and pass as duration_ms. Default covers the last 2 minutes.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            duration_ms: {
              type: Type.INTEGER,
              description: "How many milliseconds from the end to retrieve. Default is 120000 (last 2 minutes). Example: 300000 for 'last five minutes', 30000 for 'last 30 seconds'.",
            },
          },
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

type WordTimestamp = { word: string; start_ms: number; end_ms: number };

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
    topK: 5,
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
    topK: 5,
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

async function getContentAt(timestampMs: number, windowMs: number, videoId: string): Promise<ToolResult[]> {
  const lower = timestampMs - windowMs;
  const upper = timestampMs + windowMs;
  const results: ToolResult[] = [];

  // Find transcript chunks that overlap the window [lower, upper].
  // A chunk overlaps if it starts before upper AND ends after lower.
  const chunks = await db
    .select({
      text: asrChunks.text,
      startMs: asrChunks.startMs,
      wordTimestamps: asrChunks.wordTimestamps,
    })
    .from(asrChunks)
    .where(
      and(
        eq(asrChunks.videoId, videoId),
        lte(asrChunks.startMs, upper),
        gte(asrChunks.endMs, lower),
      )
    )
    .orderBy(sql`ABS(${asrChunks.startMs} - ${timestampMs})`)
    .limit(3);

  for (const chunk of chunks) {
    const words = (chunk.wordTimestamps as WordTimestamp[]) ?? [];
    const pinpointWords = words
      .filter((w) => w.start_ms >= lower && w.start_ms <= upper)
      .map((w) => w.word.trim())
      .join(" ")
      .trim();

    const text = pinpointWords
      ? `At ${timestampMs}ms: "${pinpointWords}" | Context: "${chunk.text}"`
      : chunk.text;

    results.push({ timestampMs: chunk.startMs, text, source: "transcript" });
  }

  // Scene descriptions within the window, closest first
  const scenes = await db
    .select({ timestampMs: sceneFrames.timestampMs, description: sceneFrames.description })
    .from(sceneFrames)
    .where(
      and(
        eq(sceneFrames.videoId, videoId),
        gte(sceneFrames.timestampMs, lower),
        lte(sceneFrames.timestampMs, upper),
      )
    )
    .orderBy(sql`ABS(${sceneFrames.timestampMs} - ${timestampMs})`)
    .limit(5);

  for (const scene of scenes) {
    results.push({ timestampMs: scene.timestampMs, text: scene.description, source: "scene" });
  }

  // OCR frames within the window, closest first
  const ocr = await db
    .select({ timestampMs: ocrFrames.timestampMs, ocrText: ocrFrames.ocrText })
    .from(ocrFrames)
    .where(
      and(
        eq(ocrFrames.videoId, videoId),
        gte(ocrFrames.timestampMs, lower),
        lte(ocrFrames.timestampMs, upper),
      )
    )
    .orderBy(sql`ABS(${ocrFrames.timestampMs} - ${timestampMs})`)
    .limit(5);

  for (const row of ocr) {
    results.push({ timestampMs: row.timestampMs, text: (row.ocrText ?? []).join(" | "), source: "ocr" });
  }

  return results;
}

async function getContentAtBeginning(videoId: string, durationMs: number = 60000): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  const chunks = await db
    .select({ text: asrChunks.text, startMs: asrChunks.startMs })
    .from(asrChunks)
    .where(and(eq(asrChunks.videoId, videoId), lte(asrChunks.startMs, durationMs)))
    .orderBy(asrChunks.startMs)
    .limit(5);

  for (const chunk of chunks) {
    results.push({ timestampMs: chunk.startMs, text: chunk.text, source: "transcript" });
  }

  const scenes = await db
    .select({ timestampMs: sceneFrames.timestampMs, description: sceneFrames.description })
    .from(sceneFrames)
    .where(and(eq(sceneFrames.videoId, videoId), lte(sceneFrames.timestampMs, durationMs)))
    .orderBy(sceneFrames.timestampMs)
    .limit(5);

  for (const scene of scenes) {
    results.push({ timestampMs: scene.timestampMs, text: scene.description, source: "scene" });
  }

  const ocr = await db
    .select({ timestampMs: ocrFrames.timestampMs, ocrText: ocrFrames.ocrText })
    .from(ocrFrames)
    .where(and(eq(ocrFrames.videoId, videoId), lte(ocrFrames.timestampMs, durationMs)))
    .orderBy(ocrFrames.timestampMs)
    .limit(5);

  for (const row of ocr) {
    results.push({ timestampMs: row.timestampMs, text: (row.ocrText ?? []).join(" | "), source: "ocr" });
  }

  return results;
}

async function getContentAtEnd(videoId: string, durationMs: number = 120000): Promise<ToolResult[]> {
  // Derive end of content from the last spoken word's end timestamp
  const [maxRow] = await db
    .select({ maxEndMs: sql<number>`MAX(${asrChunks.endMs})` })
    .from(asrChunks)
    .where(eq(asrChunks.videoId, videoId));

  const maxEndMs = maxRow?.maxEndMs ?? durationMs;
  const startRange = Math.max(0, maxEndMs - durationMs);
  const results: ToolResult[] = [];

  const chunks = await db
    .select({ text: asrChunks.text, startMs: asrChunks.startMs })
    .from(asrChunks)
    .where(and(eq(asrChunks.videoId, videoId), gte(asrChunks.startMs, startRange)))
    .orderBy(asrChunks.startMs)
    .limit(5);

  for (const chunk of chunks) {
    results.push({ timestampMs: chunk.startMs, text: chunk.text, source: "transcript" });
  }

  const scenes = await db
    .select({ timestampMs: sceneFrames.timestampMs, description: sceneFrames.description })
    .from(sceneFrames)
    .where(and(eq(sceneFrames.videoId, videoId), gte(sceneFrames.timestampMs, startRange)))
    .orderBy(sceneFrames.timestampMs)
    .limit(5);

  for (const scene of scenes) {
    results.push({ timestampMs: scene.timestampMs, text: scene.description, source: "scene" });
  }

  const ocr = await db
    .select({ timestampMs: ocrFrames.timestampMs, ocrText: ocrFrames.ocrText })
    .from(ocrFrames)
    .where(and(eq(ocrFrames.videoId, videoId), gte(ocrFrames.timestampMs, startRange)))
    .orderBy(ocrFrames.timestampMs)
    .limit(5);

  for (const row of ocr) {
    results.push({ timestampMs: row.timestampMs, text: (row.ocrText ?? []).join(" | "), source: "ocr" });
  }

  return results;
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
      explanation: rawText || "I couldn't find relevant information in the video for that question. Try rephrasing or asking about a specific moment.",
      strongest_signal: best?.source ?? "transcript",
    };
  }

  if (!answerJson.explanation) {
    answerJson.explanation = "I couldn't find relevant information in the video for that question. Try rephrasing or asking about a specific moment.";
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
    .where(and(eq(videos.id, videoId), or(eq(videos.userId, session.user.id), eq(videos.isDemo, true))));

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
                text: `You are a video intelligence assistant. Answer the question by searching the video using these tools:

- search_transcript: spoken audio — what was said, explained, or discussed
- search_ocr: text visible on screen — slides, titles, captions, code, whiteboards
- search_scene: visual descriptions — what is shown, who appears, objects, actions, layout
- get_content_at: direct time-based lookup — retrieves speech, visuals, and on-screen text at a specific timestamp
- get_content_at_beginning: retrieves all content from the first 60 seconds
- get_content_at_end: retrieves all content from the last 2 minutes
${conversationContext}
TOOL ROUTING GUIDE (check temporal routing first):
- TEMPORAL: Any specific timestamp in the question ("at 2:30", "around 45 seconds", "the 3 minute mark") → call get_content_at with timestamp_ms converted to milliseconds. Do not call semantic search tools first.
- TEMPORAL: Question about the beginning, opening, introduction, or start of the video → call get_content_at_beginning. Do not call semantic search tools first.
- TEMPORAL: Question about the end, conclusion, closing, or final part of the video → call get_content_at_end. Do not call semantic search tools first.
- Spoken facts, explanations, definitions → search_transcript
- Slide content, on-screen text, code, equations → search_ocr
- Visual layout, demonstrations, who/what appears on screen → search_scene
- When unsure, search all three semantic tools in parallel
- After temporal results, you may call semantic search tools if more context is still needed

SEARCH RULES:
1. First pass: identify which tools are relevant to the question and call them simultaneously with affirmative-form queries (e.g. "neural network architecture diagram" not "what does the neural network look like").
2. After each retrieval, explicitly state: (a) what evidence you confirmed, (b) what specific gap remains. If your gap statement is vague ("I need more info"), stop immediately and synthesize.
3. Reformulate by targeting the specific gap — not by rephrasing the original question. Use synonyms, narrower terms, or decompose into sub-queries. Never call the same tool with the same query twice.
4. For list/enumeration questions ("all X", "every time Y", "what topics"), run multiple varied queries across tools — one search will miss instances.
5. Stop searching when: you have sufficient evidence OR results overlap heavily with previous iterations OR you have made 6 attempts. Always synthesize something — never refuse to answer.

ANSWER RULES:
- Use only what the tools returned. Do not add external knowledge.
- If evidence is partial, state what was found and what is missing — do not fabricate the gaps.
- Render all math as LaTeX: inline $...$ and block $$...$$.
- Do not mention timestamps in your answer text.

Question: "${question}"`,
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
            model: "gemini-2.5-flash",
            contents: messages,
            config: {
              tools: TOOLS,
              temperature: 0,
              thinkingConfig: { thinkingBudget: 0 },
            },
          });

          const candidate = response.candidates?.[0];
          if (!candidate || !candidate.content) break;

          const functionCalls = response.functionCalls ?? [];

          if (functionCalls.length === 0) {
            // Model decided to stop searching — synthesize
            emit({ type: "synthesizing" });

            if (allResults.length > 0) {
              const synthesisMessages = [
                ...messages,
                {
                  role: "user",
                  parts: [{
                    text: `Synthesize a final answer using ONLY the tool results above. No external knowledge.

- Start directly with the answer — no preamble like "Based on the results" or "According to the search".
- Compile ALL relevant evidence across every search iteration, not just the most recent.
- For list/enumeration questions, aggregate every instance found across all searches.
- If evidence is partial, state clearly what was found and what is missing.
- Render all math as LaTeX: inline $...$ and block $$...$$.
- Plain prose only — no JSON, no code fences.`,
                  }],
                },
              ];

              let accumulatedText = "";
              const stream = await genAI.models.generateContentStream({
                model: "gemini-2.5-pro",
                contents: synthesisMessages,
                config: { temperature: 0, thinkingConfig: { thinkingBudget: 2048 } },
              });
              for await (const chunk of stream) {
                const text = chunk.text ?? "";
                if (text) {
                  accumulatedText += text;
                  emit({ type: "chunk", text });
                }
              }

              const explanation = accumulatedText.trim() || "I couldn't find relevant information in the video for that question. Try rephrasing or asking about a specific moment.";
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
                primaryTimestampMs: allResults[0]?.timestampMs ?? 0,
                explanation,
                candidates,
              });
            } else {
              emit({
                type: "answer",
                primaryTimestampMs: 0,
                explanation: "I searched the video across speech, on-screen text, and visual context but couldn't find relevant information to answer your question. Try rephrasing or asking about a more specific moment.",
                candidates: [],
              });
            }

            answered = true;
            break;
          }

          // Extract all args from each function call
          const toolCalls = functionCalls.map((call) => ({
            toolName: call.name ?? "",
            query: (call.args?.query as string) ?? "",
            timestampMs: call.args?.timestamp_ms as number | undefined,
            windowMs: (call.args?.window_ms as number | undefined) ?? 5000,
            durationMs: call.args?.duration_ms as number | undefined,
          }));

          toolCalls.forEach(({ toolName, query, timestampMs }) => {
            const displayQuery =
              query ||
              (timestampMs !== undefined
                ? `${Math.floor(timestampMs / 60000)}:${String(Math.floor((timestampMs % 60000) / 1000)).padStart(2, "0")}`
                : "");
            emit({ type: "tool_call", tool: toolName, query: displayQuery });
          });

          const toolResults = await Promise.all(
            toolCalls.map(async ({ toolName, query, timestampMs, windowMs, durationMs }) => {
              let results: ToolResult[] = [];
              try {
                if (toolName === "search_transcript") {
                  results = await searchTranscript(query, videoId);
                } else if (toolName === "search_ocr") {
                  results = await searchOcr(query, videoId);
                } else if (toolName === "search_scene") {
                  results = await searchScene(query, videoId);
                } else if (toolName === "get_content_at" && timestampMs !== undefined) {
                  results = await getContentAt(timestampMs, windowMs, videoId);
                } else if (toolName === "get_content_at_beginning") {
                  results = await getContentAtBeginning(videoId, durationMs);
                } else if (toolName === "get_content_at_end") {
                  results = await getContentAtEnd(videoId, durationMs);
                }
              } catch {
                results = [];
              }
              return { toolName, query, results };
            })
          );

          const toolResponseParts = toolResults.map(({ toolName, results }) => {
            allResults.push(...results);
            const snippet = results[0]?.text?.slice(0, 120) ?? "(no results)";
            emit({ type: "tool_result", tool: toolName, count: results.length, snippet });
            return {
              functionResponse: {
                name: toolName,
                response: {
                  results: results.map((r) => ({
                    timestamp_ms: r.timestampMs,
                    text: r.text,
                  })),
                },
              },
            };
          });

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
            emit({ type: "synthesizing" });
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
              config: { temperature: 0, thinkingConfig: { thinkingBudget: 1024 } },
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
