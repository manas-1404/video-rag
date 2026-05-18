"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
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

type Props = { videoId: string; videoUrl: string; title: string };

const TOOL_META: Record<string, { icon: string; label: string }> = {
  search_transcript: { icon: "🎙️", label: "Speech" },
  search_ocr:        { icon: "📄", label: "On-screen text" },
  search_scene:      { icon: "👁️", label: "Visual context" },
};

const SUGGESTED_FALLBACK = [
  "What is the main topic discussed?",
  "Find where a chart or graph appears",
  "What text is visible on screen?",
  "Summarise the key points covered",
];

function WaveformSpinner() {
  return (
    <div className="flex items-end gap-0.5" style={{ height: "18px" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="waveform-bar" style={{ height: "16px", animationDelay: `${i * 0.14}s` }} />
      ))}
    </div>
  );
}

function LiveStatus({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)" }}>
        <WaveformSpinner />
        <span className="text-sm text-slate-300">Thinking…</span>
      </div>
    );
  }

  const last = steps[steps.length - 1];
  const meta = TOOL_META[last.tool] ?? { icon: "🔍", label: "Searching" };

  if (last.type === "tool_call") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)" }}>
        <WaveformSpinner />
        <span className="text-sm text-indigo-300 font-medium">{meta.icon} {meta.label}</span>
        <span className="text-sm text-slate-500">—</span>
        <span className="text-sm text-slate-400 italic truncate max-w-[200px]">&ldquo;{last.query}&rdquo;</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.18)" }}>
      <span className="text-emerald-400 text-base">✓</span>
      <span className="text-sm text-slate-300">{meta.icon} Found {last.count} result{last.count !== 1 ? "s" : ""}</span>
      {last.count > 0 && (
        <span className="text-sm text-slate-500 italic truncate max-w-[220px]">— &ldquo;{last.snippet}&rdquo;</span>
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
  const [suggested, setSuggested] = useState<string[]>(SUGGESTED_FALLBACK);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback((ms: number) => setSeekTo(ms), []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    fetch(`/api/suggestions?videoId=${videoId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggested(data.suggestions);
        }
      })
      .catch(() => {})
      .finally(() => setSuggestionsLoading(false));
  }, [videoId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    // Snapshot the last 5 turns (10 messages) BEFORE appending the new question
    const historySnapshot = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.role === "user" ? m.content : (m as Extract<Message, { role: "assistant" }>).result.explanation || m.content,
    }));

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");
    setLoading(true);
    setLiveSteps([]);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, question: q, history: historySnapshot }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Query failed. Please try again." }));
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: err.error ?? "Query failed. Please try again.",
          result: { primaryTimestampMs: 0, explanation: "", candidates: [] },
          steps: [],
        }]);
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
          try { event = JSON.parse(line); } catch { continue; }

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
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: result.explanation,
              result: { primaryTimestampMs: result.primaryTimestampMs, explanation: result.explanation, candidates: result.candidates },
              steps: capturedSteps,
            }]);
            setLiveSteps([]);
            setSeekTo(result.primaryTimestampMs);
          } else if (event.type === "error") {
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: (event.message as string) ?? "Something went wrong.",
              result: { primaryTimestampMs: 0, explanation: "", candidates: [] },
              steps: capturedSteps,
            }]);
            setLiveSteps([]);
          }
        }
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "Something went wrong. Please try again.",
        result: { primaryTimestampMs: 0, explanation: "", candidates: [] },
        steps: [],
      }]);
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
      <div className="navbar-glass shrink-0 flex items-center gap-3 px-5 py-3">
        <Link href="/videos" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Library
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-sm text-slate-200 truncate max-w-xs font-medium">{title}</span>

        <div className="ml-auto flex items-center gap-2">
          {[
            { label: "Speech",  cls: "signal-transcript" },
            { label: "OCR",     cls: "signal-ocr" },
            { label: "Visual",  cls: "signal-scene" },
          ].map(({ label, cls }) => (
            <span key={label} className={`${cls} text-xs font-semibold px-2.5 py-1 rounded-full`}>{label}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Video + Evidence */}
        <div className="w-[52%] flex flex-col overflow-y-auto"
          style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}>
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
                  <p className="text-base font-semibold text-slate-300 mb-1">Ask Meridian</p>
                  <p className="text-sm text-slate-500 max-w-[220px] leading-relaxed">
                    Searches speech, on-screen text, and visual context simultaneously.
                  </p>
                </div>
                <div className="space-y-2 w-full max-w-xs">
                  {suggestionsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-11 rounded-xl animate-pulse"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
                    ))
                  ) : (
                    suggested.map((q) => (
                      <button
                        key={q}
                        onClick={() => { setQuestion(q); inputRef.current?.focus(); }}
                        className="w-full text-left text-sm px-4 py-3 rounded-xl transition-all text-slate-400 hover:text-slate-200"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
                      >
                        {q}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex flex-col gap-2"}>
                {msg.role === "user" ? (
                  <div className="bubble-user text-white text-sm px-4 py-3 max-w-[88%]">
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="bubble-ai text-sm px-4 py-3.5 leading-relaxed max-w-[96%] text-slate-200 prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.result.primaryTimestampMs > 0 && (
                      <button onClick={() => handleSeek(msg.result.primaryTimestampMs)} className="timestamp-badge ml-1">
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
            style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(4,8,15,0.7)", backdropFilter: "blur(12px)" }}>
            <form onSubmit={handleSubmit} className="flex gap-2.5 items-end">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about the video…"
                rows={1}
                style={{ resize: "none", maxHeight: "128px" }}
                className="input-glass flex-1 px-4 py-3 text-sm"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="btn-primary px-4 py-3 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M14 8H2M8 2l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </form>
            <p className="text-xs text-slate-600 mt-2 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
