import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos, ocrFrames } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { GoogleGenAI, Type } from "@google/genai";
import { ExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";
import { Pinecone } from "@pinecone-database/pinecone";
import { z } from "zod";

if (!process.env.GCP_PROJECT_ID) throw new Error("GCP_PROJECT_ID is not set");
if (!process.env.GCP_PROJECT_NUMBER) throw new Error("GCP_PROJECT_NUMBER is not set");
if (!process.env.GCP_SERVICE_ACCOUNT_EMAIL) throw new Error("GCP_SERVICE_ACCOUNT_EMAIL is not set");
if (!process.env.GCP_WORKLOAD_IDENTITY_POOL_ID) throw new Error("GCP_WORKLOAD_IDENTITY_POOL_ID is not set");
if (!process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID) throw new Error("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID is not set");
if (!process.env.GOOGLE_CLOUD_LOCATION) throw new Error("GOOGLE_CLOUD_LOCATION is not set");
if (!process.env.PINECONE_API_KEY) throw new Error("PINECONE_API_KEY is not set");

const authClient = ExternalAccountClient.fromJSON({
  type: "external_account",
  audience: `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${process.env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
  subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
  token_url: "https://sts.googleapis.com/v1/token",
  service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
  subject_token_supplier: {
    getSubjectToken: () => getVercelOidcToken(),
  },
});

if (!authClient) throw new Error("Failed to initialize GCP auth client");

const genAI = new GoogleGenAI({
  enterprise: true,
  project: process.env.GCP_PROJECT_ID,
  location: process.env.GOOGLE_CLOUD_LOCATION,
  googleAuthOptions: {
    authClient,
    projectId: process.env.GCP_PROJECT_ID,
  },
});
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

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
                text: `You are a video intelligence assistant with access to search tools for a video's transcript, on-screen text, and visual scenes. Your job is to always attempt to answer using the tools — never refuse.

For complex analytical questions (contradictions, comparisons, summaries, lists of moments), search broadly across multiple queries and use the results to reason and answer. If you cannot find enough evidence, say what you did find rather than refusing.

STRICT RULES:
- Always call at least one tool before answering.
- Never invent, approximate, or guess timestamps. Only use exact timestamp_ms values returned by the tools.
- Never reference a time (e.g. "0:01:19") unless that exact value came from a tool result.
- Base your answer only on what the tools returned. Do not use prior knowledge.
- Never refuse to answer — always search first, then reason over results.
${conversationContext}
Current question: "${question}"`,
              },
            ],
          },
        ];

        const allResults: ToolResult[] = [];
        let iterations = 0;

        while (iterations < 3) {
          const response = await genAI.models.generateContent({
            model: "gemini-2.5-pro",
            contents: messages,
            config: {
              tools: TOOLS,
              thinkingConfig: { thinkingBudget: 512 },
            },
          });

          const candidate = response.candidates?.[0];
          if (!candidate) break;

          const functionCalls = candidate.content?.parts?.filter((p: { functionCall?: unknown }) => p.functionCall) ?? [];
          if (!candidate.content) break;

          if (functionCalls.length === 0) {
            // No more tool calls — synthesize final answer
            // Re-ask with strict grounding instructions if we have results
            const synthesisMessages = allResults.length > 0 ? [
              ...messages,
              {
                role: "user",
                parts: [{
                  text: `Based only on the tool results above, answer the question. Reason over all retrieved results — do not just pick one.

RULES:
- Use ONLY the exact timestamp_ms values from the tool results. Do not write any timestamps in your explanation text.
- Answer directly and concisely. For analytical questions (contradictions, comparisons, lists), summarise what you found across all results.
- If results don't contain enough information, say what was found rather than refusing.
- Never refuse to answer.
- Return ONLY valid JSON: {"timestamp_ms": <best matching timestamp_ms from tool results>, "explanation": "<answer with no timestamps mentioned>", "strongest_signal": "<transcript|ocr|scene>"}`,
                }],
              },
            ] : messages;

            const synthesisResponse = allResults.length > 0
              ? await genAI.models.generateContent({
                  model: "gemini-2.5-pro",
                  contents: synthesisMessages,
                  config: { thinkingConfig: { thinkingBudget: 1024 } },
                })
              : response;

            const text = synthesisResponse.text?.trim() ?? "";
            let answerJson: {
              timestamp_ms: number;
              explanation: string;
              strongest_signal: "transcript" | "ocr" | "scene";
            };

            try {
              const cleaned = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
              answerJson = JSON.parse(cleaned);
            } catch {
              // Gemini returned plain text — wrap it
              const best = allResults[0];
              answerJson = {
                timestamp_ms: best?.timestampMs ?? 0,
                explanation: text,
                strongest_signal: best?.source ?? "transcript",
              };
            }

            // Build candidates from all gathered results
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
            { role: "model", parts: candidate.content?.parts ?? [] },
            { role: "tool", parts: toolResponseParts },
          ];

          iterations++;
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
