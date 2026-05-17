"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import VideoPlayer from "./video-player";
import ReferenceCards from "./reference-cards";
import AgentTrace, { type AgentStep } from "./agent-trace";

type Candidate = {
  transcriptText: string;
  startMs: number;
  endMs: number;
  ocrText: string[];
  sceneDescription: string;
  strongestSignal: "transcript" | "ocr" | "scene";
  isBest: boolean;
};

type QueryResult = {
  primaryTimestampMs: number;
  explanation: string;
  candidates: Candidate[];
};

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; result: QueryResult; steps: AgentStep[] };

type Props = {
  videoId: string;
  videoUrl: string;
  title: string;
};

const TOOL_META: Record<string, { icon: string; label: string }> = {
  search_transcript: { icon: "🎙️", label: "Searching transcript" },
  search_ocr: { icon: "📄", label: "Searching on-screen text" },
  search_scene: { icon: "🎬", label: "Searching visual scene" },
};

function LiveSteps({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
        Thinking…
      </div>
    );
  }

  const last = steps[steps.length - 1];

  if (last.type === "tool_call") {
    const meta = TOOL_META[last.tool] ?? { icon: "🔍", label: "Searching" };
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-400 animate-pulse">
        <span>{meta.icon}</span>
        <span>{meta.label} for <span className="text-violet-400 italic">"{last.query}"</span>…</span>
      </div>
    );
  }

  // tool_result — show what was just found
  const meta = TOOL_META[last.tool] ?? { icon: "🔍", label: last.tool };
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="text-emerald-500">✓</span>
      <span>{meta.icon} Found {last.count} result{last.count !== 1 ? "s" : ""}</span>
      {last.count > 0 && (
        <span className="text-zinc-600 italic truncate max-w-[200px]">— "{last.snippet}"</span>
      )}
    </div>
  );
}

export default function QueryInterface({ videoId, videoUrl, title }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSeek = useCallback((ms: number) => {
    setSeekTo(ms);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");
    setLoading(true);
    setLiveSteps([]);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, question: q }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Query failed. Please try again." }));
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: err.error ?? "Query failed. Please try again.",
            result: { primaryTimestampMs: 0, explanation: "", candidates: [] },
            steps: [],
          },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let capturedSteps: AgentStep[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; [key: string]: unknown };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "tool_call") {
            const step: AgentStep = {
              type: "tool_call",
              tool: event.tool as string,
              query: event.query as string,
            };
            capturedSteps = [...capturedSteps, step];
            setLiveSteps([...capturedSteps]);
          } else if (event.type === "tool_result") {
            const step: AgentStep = {
              type: "tool_result",
              tool: event.tool as string,
              count: event.count as number,
              snippet: event.snippet as string,
            };
            capturedSteps = [...capturedSteps, step];
            setLiveSteps([...capturedSteps]);
          } else if (event.type === "answer") {
            const result = event as unknown as QueryResult & { type: string };
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: result.explanation,
                result: {
                  primaryTimestampMs: result.primaryTimestampMs,
                  explanation: result.explanation,
                  candidates: result.candidates,
                },
                steps: capturedSteps,
              },
            ]);
            setLiveSteps([]);
            setSeekTo(result.primaryTimestampMs);
          } else if (event.type === "error") {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: (event.message as string) ?? "Something went wrong.",
                result: { primaryTimestampMs: 0, explanation: "", candidates: [] },
                steps: capturedSteps,
              },
            ]);
            setLiveSteps([]);
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
          result: { primaryTimestampMs: 0, explanation: "", candidates: [] },
          steps: [],
        },
      ]);
    } finally {
      setLoading(false);
      setLiveSteps([]);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 shrink-0">
        <Link href="/videos" className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm">
          ←
        </Link>
        <span className="text-sm text-zinc-200 truncate max-w-xs">{title}</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: video + reference cards */}
        <div className="w-[55%] flex flex-col border-r border-zinc-800 overflow-y-auto">
          <div className="p-4">
            <VideoPlayer url={videoUrl} seekTo={seekTo} />
          </div>

          {messages.length > 0 && (
            <div className="px-4 pb-4">
              {messages
                .filter((m): m is Extract<Message, { role: "assistant" }> =>
                  m.role === "assistant" && m.result.candidates.length > 0
                )
                .slice(-1)
                .map((m, i) => (
                  <ReferenceCards
                    key={i}
                    candidates={m.result.candidates}
                    onSeek={handleSeek}
                  />
                ))}
            </div>
          )}
        </div>

        {/* Right: chat */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="h-full flex items-center justify-center">
                <p className="text-zinc-600 text-sm text-center max-w-xs">
                  Ask a question about the video. The agent will search across
                  speech, on-screen text, and visual context to find the best answer.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
                {msg.role === "user" ? (
                  <div className="bg-violet-600 text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2 max-w-xs">
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-zinc-200 text-sm leading-relaxed">{msg.content}</p>
                    {msg.result.primaryTimestampMs > 0 && (
                      <button
                        onClick={() => handleSeek(msg.result.primaryTimestampMs)}
                        className="text-xs text-violet-400 hover:text-violet-300 underline"
                      >
                        Jump to {formatMs(msg.result.primaryTimestampMs)}
                      </button>
                    )}
                    <AgentTrace steps={msg.steps} />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="py-1">
                <LiveSteps steps={liveSteps} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-zinc-800 px-4 py-3">
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about the video…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 max-h-32"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                Ask
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
