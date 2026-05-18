"use client";

import { useState } from "react";

type AgentStep =
  | { type: "tool_call"; tool: string; query: string }
  | { type: "tool_result"; tool: string; count: number; snippet: string };

const TOOL_META: Record<string, { icon: string; label: string }> = {
  search_transcript: { icon: "🎙️", label: "Speech" },
  search_ocr:        { icon: "📄", label: "On-screen text" },
  search_scene:      { icon: "👁️", label: "Visual context" },
};

function StepRow({ step, isLast }: { step: AgentStep; isLast: boolean }) {
  const meta = TOOL_META[step.tool] ?? { icon: "🔍", label: step.tool };

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm"
          style={{
            background: step.type === "tool_result" && step.count > 0 ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${step.type === "tool_result" && step.count > 0 ? "rgba(52,211,153,0.28)" : "rgba(255,255,255,0.1)"}`,
          }}>
          {step.type === "tool_call" ? (
            <span style={{ fontSize: "11px" }}>{meta.icon}</span>
          ) : step.count > 0 ? (
            <span style={{ color: "#34d399", fontSize: "10px" }}>✓</span>
          ) : (
            <span style={{ color: "#475569", fontSize: "10px" }}>—</span>
          )}
        </div>
        {!isLast && (
          <div className="w-px mt-1" style={{ background: "rgba(255,255,255,0.07)", minHeight: "14px", flex: 1 }} />
        )}
      </div>

      <div className="pb-3 min-w-0">
        {step.type === "tool_call" ? (
          <p className="text-sm">
            <span className="text-slate-300 font-medium">{meta.label}</span>
            <span className="text-slate-500"> — searching for </span>
            <span className="text-indigo-300 italic">&ldquo;{step.query}&rdquo;</span>
          </p>
        ) : step.count === 0 ? (
          <p className="text-sm text-slate-600">No results found</p>
        ) : (
          <div>
            <p className="text-sm text-slate-400">{step.count} result{step.count !== 1 ? "s" : ""}</p>
            {step.snippet && (
              <p className="text-sm text-slate-600 italic truncate max-w-[280px]">&ldquo;{step.snippet}&rdquo;</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentTrace({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  const toolIcons = [...new Set(
    steps.filter((s) => s.type === "tool_call").map((s) => TOOL_META[s.tool]?.icon ?? "🔍")
  )];
  const totalResults = steps
    .filter((s): s is Extract<AgentStep, { type: "tool_result" }> => s.type === "tool_result")
    .reduce((acc, s) => acc + s.count, 0);

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-400 transition-colors"
      >
        <span className="flex gap-0.5">{toolIcons.map((icon, i) => <span key={i}>{icon}</span>)}</span>
        <span>Searched {toolIcons.length} channel{toolIcons.length !== 1 ? "s" : ""} · {totalResults} results</span>
        <svg width="12" height="12" viewBox="0 0 10 10" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 pl-1">
          {steps.map((step, i) => (
            <StepRow key={i} step={step} isLast={i === steps.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export type { AgentStep };
