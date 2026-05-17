"use client";

import { useState, useRef, useCallback } from "react";
import VideoPlayer from "./video-player";
import ReferenceCards from "./reference-cards";

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
  | { role: "assistant"; content: string; result: QueryResult };

type Props = {
  videoId: string;
  videoUrl: string;
  title: string;
};

export default function QueryInterface({ videoId, videoUrl, title }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
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

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, question: q }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: err.error ?? "Query failed. Please try again.",
            result: { primaryTimestampMs: 0, explanation: "", candidates: [] },
          },
        ]);
        return;
      }

      const result: QueryResult = await res.json();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Found the best moment at ${formatMs(result.primaryTimestampMs)}.`, result },
      ]);

      setSeekTo(result.primaryTimestampMs);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
          result: { primaryTimestampMs: 0, explanation: "", candidates: [] },
        },
      ]);
    } finally {
      setLoading(false);
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
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 shrink-0">
        <span className="text-sm font-medium text-zinc-400">VideoRAG</span>
        <span className="text-zinc-700">/</span>
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
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <p className="text-zinc-600 text-sm text-center max-w-xs">
                  Ask a question about the video. The system will search across
                  speech, on-screen text, and visual context to find the best
                  answer.
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
                  <div className="space-y-2">
                    <p className="text-zinc-200 text-sm leading-relaxed">
                      {msg.content}
                    </p>
                    {msg.result.primaryTimestampMs > 0 && (
                      <button
                        onClick={() => handleSeek(msg.result.primaryTimestampMs)}
                        className="text-xs text-violet-400 hover:text-violet-300 underline"
                      >
                        Jump to {formatMs(msg.result.primaryTimestampMs)}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
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
