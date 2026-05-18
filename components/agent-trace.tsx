"use client";

import { useState } from "react";

type AgentStep =
  | { type: "tool_call"; tool: string; query: string }
  | { type: "tool_result"; tool: string; count: number; snippet: string };

const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  search_transcript: { icon: "🎙️", label: "Speech",       color: "#93c5fd" },
  search_ocr:        { icon: "📄", label: "On-screen text", color: "#fcd34d" },
  search_scene:      { icon: "👁️", label: "Visual context", color: "#6ee7b7" },
};

function StepRow({ step, isLast }: { step: AgentStep; isLast: boolean }) {
  const meta = TOOL_META[step.tool] ?? { icon: "🔍", label: step.tool, color: "#94a3b8" };

  if (step.type === "tool_call") {
    return (
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontSize: "10px" }}>{meta.icon}</span>
          </div>
          {!isLast && <div className="w-px flex-1 mt-1" style={{ background: "rgba(255,255,255,0.06)", minHeight: "12px" }} />}
        </div>
        <div className="pb-2 min-w-0">
          <span className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</span>
          <span className="text-xs text-slate-500"> — </span>
          <span className="text-xs text-indigo-300/70 italic truncate">
            &ldquo;{step.query}&rdquo;
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5"
          style={{
            background: step.count > 0 ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${step.count > 0 ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.07)"}`,
          }}>
          {step.count > 0
            ? <span style={{ color: "#34d399", fontSize: "9px" }}>✓</span>
            : <span style={{ color: "#475569", fontSize: "9px" }}>—</span>}
        </div>
        {!isLast && <div className="w-px flex-1 mt-1" style={{ background: "rgba(255,255,255,0.06)", minHeight: "12px" }} />}
      </div>
      <div className="pb-2 min-w-0">
        {step.count === 0 ? (
          <span className="text-xs text-slate-600">No results found</span>
        ) : (
          <>
            <span className="text-xs text-slate-400">{step.count} result{step.count !== 1 ? "s" : ""}</span>
            {step.snippet && (
              <span className="text-xs text-slate-600 italic truncate block max-w-[280px]">
                &ldquo;{step.snippet}&rdquo;
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AgentTrace({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  const toolsSearched = [...new Set(
    steps.filter((s) => s.type === "tool_call").map((s) => TOOL_META[s.tool]?.icon ?? "🔍")
  )];

  const resultsFound = steps
    .filter((s): s is Extract<AgentStep, { type: "tool_result" }> => s.type === "tool_result")
    .reduce((acc, s) => acc + s.count, 0);

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs transition-colors text-slate-600 hover:text-slate-400"
      >
        <span className="flex items-center gap-0.5">{toolsSearched.map((icon, i) => <span key={i}>{icon}</span>)}</span>
        <span>Searched {toolsSearched.length} channel{toolsSearched.length !== 1 ? "s" : ""} · {resultsFound} results</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2.5 pl-1">
          {steps.map((step, i) => (
            <StepRow key={i} step={step} isLast={i === steps.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export type { AgentStep };
