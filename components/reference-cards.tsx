"use client";

import { useState } from "react";

type Candidate = {
  transcriptText: string;
  startMs: number;
  endMs: number;
  ocrText: string[];
  sceneDescription: string;
  strongestSignal: "transcript" | "ocr" | "scene";
  isBest: boolean;
};

type Props = {
  candidates: Candidate[];
  onSeek: (ms: number) => void;
};

const SIGNAL_CONFIG = {
  transcript: { label: "Speech",       cls: "signal-transcript", icon: "🎙️" },
  ocr:        { label: "On-screen text", cls: "signal-ocr",        icon: "📄" },
  scene:      { label: "Visual",        cls: "signal-scene",       icon: "👁️" },
};

function ExpandableText({ text, limit = 110 }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= limit) return <span>{text}</span>;
  return (
    <span>
      {expanded ? text : text.slice(0, limit) + "…"}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        className="ml-1 text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
      >
        {expanded ? "less" : "more"}
      </button>
    </span>
  );
}

export default function ReferenceCards({ candidates, onSeek }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mt-1">
        <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
        <p className="text-xs font-semibold uppercase tracking-widest shrink-0"
          style={{ color: "var(--text-muted)" }}>
          Evidence
        </p>
        <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
      </div>

      <div className="space-y-2">
        {candidates.map((c, i) => {
          const sig = SIGNAL_CONFIG[c.strongestSignal];
          return (
            <div
              key={i}
              className="rounded-xl p-3.5 space-y-2.5 transition-all"
              style={{
                background: c.isBest ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.025)",
                border: `1px solid ${c.isBest ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.07)"}`,
                boxShadow: c.isBest ? "0 0 20px rgba(99,102,241,0.08)" : "none",
              }}
            >
              {/* Top row */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => onSeek(c.startMs)}
                  className="timestamp-badge"
                >
                  ▶ {formatMs(c.startMs)}
                  {c.endMs > c.startMs && <> → {formatMs(c.endMs)}</>}
                </button>

                <div className="flex items-center gap-1.5">
                  {c.isBest && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
                      Best match
                    </span>
                  )}
                  <span className={`${sig.cls} text-xs px-2 py-0.5 rounded-full font-medium`}>
                    {sig.icon} {sig.label}
                  </span>
                </div>
              </div>

              {/* Transcript */}
              {c.transcriptText && (
                <p className="text-xs leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}>
                  &ldquo;<ExpandableText text={c.transcriptText} />&rdquo;
                </p>
              )}

              {/* OCR */}
              {c.ocrText.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.ocrText.slice(0, 4).map((t, j) => (
                    <span key={j} className="text-xs px-2 py-0.5 rounded-md font-mono"
                      style={{ background: "rgba(251,191,36,0.08)", color: "#fcd34d", border: "1px solid rgba(251,191,36,0.15)" }}>
                      {t.length > 40 ? t.slice(0, 40) + "…" : t}
                    </span>
                  ))}
                  {c.ocrText.length > 4 && (
                    <span className="text-xs text-slate-600">+{c.ocrText.length - 4} more</span>
                  )}
                </div>
              )}

              {/* Scene */}
              {c.sceneDescription && (
                <p className="text-xs italic"
                  style={{ color: "var(--text-muted)" }}>
                  <ExpandableText text={c.sceneDescription} />
                </p>
              )}
            </div>
          );
        })}
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
