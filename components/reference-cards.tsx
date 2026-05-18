"use client";

import { useState } from "react";

function ExpandableText({ text, limit = 120 }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= limit) return <span>{text}</span>;
  return (
    <span>
      {expanded ? text : text.slice(0, limit) + "…"}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        className="ml-1 text-zinc-500 hover:text-zinc-300 underline transition-colors"
      >
        {expanded ? "less" : "more"}
      </button>
    </span>
  );
}

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

const SIGNAL_LABELS = {
  transcript: "Speech",
  ocr: "On-screen text",
  scene: "Visual context",
};

const SIGNAL_COLORS = {
  transcript: "text-blue-400 bg-blue-950/40 border-blue-800/40",
  ocr: "text-amber-400 bg-amber-950/40 border-amber-800/40",
  scene: "text-emerald-400 bg-emerald-950/40 border-emerald-800/40",
};

export default function ReferenceCards({ candidates, onSeek }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        Evaluated candidates
      </p>
      <div className="space-y-2">
        {candidates.map((c, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3 space-y-2 transition-colors ${
              c.isBest
                ? "border-violet-700/60 bg-violet-950/20"
                : "border-zinc-800 bg-zinc-900/50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => onSeek(c.startMs)}
                className="text-xs font-mono text-zinc-400 hover:text-violet-400 transition-colors"
              >
                {formatMs(c.startMs)} → {formatMs(c.endMs)}
              </button>
              <div className="flex items-center gap-1.5">
                {c.isBest && (
                  <span className="text-xs bg-violet-800/60 text-violet-300 px-1.5 py-0.5 rounded-full">
                    Best match
                  </span>
                )}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full border ${SIGNAL_COLORS[c.strongestSignal]}`}
                >
                  {SIGNAL_LABELS[c.strongestSignal]}
                </span>
              </div>
            </div>

            {c.transcriptText && (
              <p className="text-xs text-zinc-300 leading-relaxed">
                &ldquo;{c.transcriptText}&rdquo;
              </p>
            )}

            {c.ocrText.length > 0 && (
              <div className="text-xs text-zinc-500">
                <span className="text-zinc-600">On screen: </span>
                {c.ocrText.join(" · ")}
              </div>
            )}

            {c.sceneDescription && (
              <p className="text-xs text-zinc-600 italic">
                <ExpandableText text={c.sceneDescription} />
              </p>
            )}
          </div>
        ))}
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
