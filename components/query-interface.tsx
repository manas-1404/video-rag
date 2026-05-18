"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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

const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  search_transcript: { icon: "🎙️", label: "Speech", color: "#93c5fd" },
  search_ocr:        { icon: "📄", label: "On-screen text", color: "#fcd34d" },
  search_scene:      { icon: "👁️", label: "Visual context", color: "#6ee7b7" },
};

const SUGGESTED_QUESTIONS = [
  "What is the main topic discussed?",
  "Find where a chart or graph appears",
  "When does the speaker mention pricing?",
  "What text is visible on screen?",
];

function WaveformSpinner() {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="waveform-bar"
          style={{
            height: "14px",
            color: "#6366f1",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function LiveStatus({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
        style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}>
        <WaveformSpinner />
        <span className="text-xs text-slate-400">Thinking…</span>
      </div>
    );
  }

  const last = steps[steps.length - 1];
  const meta = TOOL_META[last.tool] ?? { icon: "🔍", label: "Searching", color: "#94a3b8" };

  if (last.type === "tool_call") {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
        style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}>
        <WaveformSpinner />
        <span className="text-xs" style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
        <span className="text-xs text-slate-500">— searching for</span>
        <span className="text-xs text-indigo-300 italic truncate max-w-[160px]">&ldquo;{last.query}&rdquo;</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
      style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
      <span className="text-emerald-400 text-sm">✓</span>
      <span className="text-xs text-slate-400">{meta.icon} Found {last.count} result{last.count !== 1 ? "s" : ""}</span>
      {last.count > 0 && (
        <span className="text-xs text-slate-600 italic truncate max-w-[200px]">— &ldquo;{last.snippet}&rdquo;</span>
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
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback((ms: number) => setSeekTo(ms), []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
            const step: AgentStep = { type: "tool_call", tool: event.tool as string, query: event.query as string };
            capturedSteps = [...capturedSteps, step];
            setLiveSteps([...capturedSteps]);
          } else if (event.type === "tool_result") {
            const step: AgentStep = { type: "tool_result", tool: event.tool as string, count: event.count as number, snippet: event.snippet as string };
            capturedSteps = [...capturedSteps, step];
            setLiveSteps([...capturedSteps]);
          } else if (event.type === "answer") {
            const result = event as unknown as QueryResult & { type: string };
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: result.explanation,
                result: { primaryTimestampMs: result.primaryTimestampMs, explanation: result.explanation, candidates: result.candidates },
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

  const lastAssistantMsg = messages
    .filter((m): m is Extract<Message, { role: "assistant" }> => m.role === "assistant")
    .slice(-1)[0];

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
      {/* Sub-header */}
      <div className="navbar-glass shrink-0 flex items-center gap-3 px-5 py-2.5 border-t-0">
        <Link
          href="/videos"
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Library
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-xs text-slate-300 truncate max-w-xs font-medium">{title}</span>

        {/* Modality pills */}
        <div className="ml-auto flex items-center gap-1.5">
          {[
            { label: "Speech", cls: "signal-transcript" },
            { label: "OCR", cls: "signal-ocr" },
            { label: "Visual", cls: "signal-scene" },
          ].map(({ label, cls }) => (
            <span key={label} className={`${cls} text-xs px-2 py-0.5 rounded-full font-medium`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Video + Evidence */}
        <div className="w-[52%] flex flex-col overflow-y-auto"
          style={{ borderRight: "1px solid var(--border-subtle)" }}>
          <div className="p-4">
            <VideoPlayer url={videoUrl} seekTo={seekTo} />
          </div>

          {lastAssistantMsg && lastAssistantMsg.result.candidates.length > 0 && (
            <div className="px-4 pb-6">
              <ReferenceCards candidates={lastAssistantMsg.result.candidates} onSeek={handleSeek} />
            </div>
          )}
        </div>

        {/* RIGHT: Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {messages.length === 0 && !loading && (
              <div className="h-full flex flex-col items-center justify-center gap-6">
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-400 mb-1">Ask Meridian</p>
                  <p className="text-xs text-slate-600 max-w-[220px] leading-relaxed">
                    Search across speech, on-screen text, and visual context simultaneously.
                  </p>
                </div>
                <div className="space-y-2 w-full max-w-xs">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => { setQuestion(q); inputRef.current?.focus(); }}
                      className="w-full text-left text-xs px-3.5 py-2.5 rounded-xl transition-all"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex flex-col gap-2"}>
                {msg.role === "user" ? (
                  <div className="bubble-user text-white text-sm px-4 py-2.5 max-w-[85%]">
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="bubble-ai text-sm px-4 py-3 leading-relaxed max-w-[95%]"
                      style={{ color: "var(--text-primary)" }}>
                      {msg.content}
                    </div>
                    {msg.result.primaryTimestampMs > 0 && (
                      <button
                        onClick={() => handleSeek(msg.result.primaryTimestampMs)}
                        className="timestamp-badge ml-1"
                      >
                        ▶ Jump to {formatMs(msg.result.primaryTimestampMs)}
                      </button>
                    )}
                    <AgentTrace steps={msg.steps} />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="py-1">
                <LiveStatus steps={liveSteps} />
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input bar */}
          <div className="shrink-0 px-4 py-3"
            style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(4,8,15,0.6)", backdropFilter: "blur(12px)" }}>
            <form onSubmit={handleSubmit} className="flex gap-2.5 items-end">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about the video…"
                rows={1}
                style={{ resize: "none", maxHeight: "128px" }}
                className="input-glass flex-1 px-3.5 py-2.5 text-sm"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="btn-primary px-4 py-2.5 text-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M14 8H2M8 2l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </form>
            <p className="text-xs text-slate-700 mt-2 text-center">
              Enter to send · Shift+Enter for new line
            </p>
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
