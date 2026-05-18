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

type Props = { candidates: Candidate[]; onSeek: (ms: number) => void };

const SIGNAL_CONFIG = {
  transcript: { label: "Speech",        cls: "signal-transcript", icon: "🎙️" },
  ocr:        { label: "On-screen text", cls: "signal-ocr",        icon: "📄" },
  scene:      { label: "Visual",         cls: "signal-scene",       icon: "👁️" },
};

function ExpandableText({ text, limit = 120 }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= limit) return <span>{text}</span>;
  return (
    <span>
      {expanded ? text : text.slice(0, limit) + "…"}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        className="ml-1.5 text-sm text-slate-500 hover:text-slate-300 underline transition-colors"
      >
        {expanded ? "less" : "more"}
      </button>
    </span>
  );
}

export default function ReferenceCards({ candidates, onSeek }: Props) {
  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/7" style={{ background: "rgba(255,255,255,0.07)" }} />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 shrink-0">Evidence</p>
        <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
      </div>

      <div className="space-y-2.5">
        {candidates.map((c, i) => {
          const sig = SIGNAL_CONFIG[c.strongestSignal];
          return (
            <div key={i} className="rounded-xl p-4 space-y-3 transition-all"
              style={{
                background: c.isBest ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.035)",
                border: `1px solid ${c.isBest ? "rgba(99,102,241,0.32)" : "rgba(255,255,255,0.08)"}`,
                boxShadow: c.isBest ? "0 0 24px rgba(99,102,241,0.1)" : "none",
              }}
            >
              {/* Top row */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button onClick={() => onSeek(c.startMs)} className="timestamp-badge">
                  ▶ {formatMs(c.startMs)}
                  {c.endMs > c.startMs && <> → {formatMs(c.endMs)}</>}
                </button>
                <div className="flex items-center gap-2">
                  {c.isBest && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.32)" }}>
                      Best match
                    </span>
                  )}
                  <span className={`${sig.cls} text-xs font-semibold px-2.5 py-1 rounded-full`}>
                    {sig.icon} {sig.label}
                  </span>
                </div>
              </div>

              {/* Transcript */}
              {c.transcriptText && (
                <p className="text-sm text-slate-300 leading-relaxed">
                  &ldquo;<ExpandableText text={c.transcriptText} />&rdquo;
                </p>
              )}

              {/* OCR chips */}
              {c.ocrText.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.ocrText.slice(0, 4).map((t, j) => (
                    <span key={j} className="text-xs font-mono px-2.5 py-1 rounded-md"
                      style={{ background: "rgba(251,191,36,0.1)", color: "#fcd34d", border: "1px solid rgba(251,191,36,0.18)" }}>
                      {t.length > 40 ? t.slice(0, 40) + "…" : t}
                    </span>
                  ))}
                  {c.ocrText.length > 4 && (
                    <span className="text-xs text-slate-500">+{c.ocrText.length - 4} more</span>
                  )}
                </div>
              )}

              {/* Scene */}
              {c.sceneDescription && (
                <p className="text-sm text-slate-500 italic leading-relaxed">
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
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
