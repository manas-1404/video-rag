"use client";

import { useState } from "react";

type AgentStep =
  | { type: "tool_call"; tool: string; query: string }
  | { type: "tool_result"; tool: string; count: number; snippet: string };

const TOOL_META: Record<string, { icon: string; label: string }> = {
  search_transcript: { icon: "🎙️", label: "Transcript" },
  search_ocr: { icon: "📄", label: "On-screen text" },
  search_scene: { icon: "🎬", label: "Visual scene" },
};

function StepRow({ step }: { step: AgentStep }) {
  const meta = TOOL_META[step.tool] ?? { icon: "🔍", label: step.tool };

  if (step.type === "tool_call") {
    return (
      <div className="flex items-start gap-2 text-xs text-zinc-400">
        <span className="shrink-0 mt-0.5">{meta.icon}</span>
        <span>
          <span className="text-zinc-300">{meta.label}</span>
          {" — searching for "}
          <span className="text-violet-400 italic">"{step.query}"</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-xs text-zinc-500 pl-5">
      <span className="shrink-0 text-emerald-500 mt-0.5">✓</span>
      <span>
        {step.count === 0 ? (
          <span className="text-zinc-600">No results found</span>
        ) : (
          <>
            <span className="text-zinc-400">{step.count} result{step.count !== 1 ? "s" : ""} — </span>
            <span className="text-zinc-500 italic truncate">"{step.snippet}"</span>
          </>
        )}
      </span>
    </div>
  );
}

export default function AgentTrace({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false);

  if (steps.length === 0) return null;

  const toolsUsed = [...new Set(
    steps.filter((s) => s.type === "tool_call").map((s) => TOOL_META[s.tool]?.icon ?? "🔍")
  )].join(" ");

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <span>{toolsUsed}</span>
        <span>How I found this</span>
        <span className="text-zinc-700">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 pl-1 border-l border-zinc-800">
          {steps.map((step, i) => (
            <StepRow key={i} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

export type { AgentStep };
