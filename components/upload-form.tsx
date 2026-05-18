"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type Phase =
  | { type: "idle" }
  | { type: "uploading"; progress: number; fileName: string }
  | { type: "queued" }
  | { type: "error"; message: string };

export default function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setPhase({ type: "error", message: "Please upload a video file (MP4, MOV, or WebM)." });
      return;
    }

    try {
      setPhase({ type: "uploading", progress: 0, fileName: file.name });

      const { url: presignedUrl, key } = await fetch(
        `/api/blob-token?contentType=${encodeURIComponent(file.type)}`,
      ).then((r) => r.json());

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setPhase({ type: "uploading", progress: Math.round((e.loaded / e.total) * 100), fileName: file.name });
          }
        };
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("content-type", file.type);
        xhr.send(file);
      });

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey: key, title: file.name }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }

      setPhase({ type: "queued" });
      setTimeout(() => router.push("/videos"), 1200);
    } catch (e) {
      setPhase({ type: "error", message: (e as Error).message });
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  if (phase.type === "uploading") {
    return (
      <div className="glass-card p-8 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.35)" }}>
            <span className="text-xl">🎬</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-slate-200 truncate">{phase.fileName}</p>
            <p className="text-sm text-slate-500 mt-0.5">Uploading to Meridian…</p>
          </div>
          <span className="font-mono text-base font-bold text-indigo-400 shrink-0">{phase.progress}%</span>
        </div>

        <div className="progress-track h-2">
          <div className="progress-fill h-2" style={{ width: `${phase.progress}%` }} />
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse inline-block" />
          Uploading… indexing will begin automatically
        </div>
      </div>
    );
  }

  if (phase.type === "queued") {
    return (
      <div className="glass-card p-10 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.28)" }}>
          <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
            <path d="M4 10l4 4 8-8" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-100">Upload complete</p>
          <p className="text-sm text-slate-500 mt-1">Meridian is indexing your video. Redirecting…</p>
        </div>
      </div>
    );
  }

  if (phase.type === "error") {
    return (
      <div className="glass-card p-10 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)" }}>
          <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
            <path d="M10 6v4M10 14h.01" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy="10" r="8" stroke="#f87171" strokeWidth="1.5" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold text-red-400">Upload failed</p>
          <p className="text-sm text-slate-400 mt-1">{phase.message}</p>
        </div>
        <button onClick={() => setPhase({ type: "idle" })} className="btn-ghost text-sm px-6 py-2.5 mt-2">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`upload-zone cursor-pointer px-8 py-16 text-center ${dragging ? "dragging" : ""}`}
    >
      {dragging && <div className="scan-line" />}
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onInputChange} />

      <div className="space-y-5 relative">
        {/* Upload icon */}
        <div className="flex justify-center">
          <div className="w-18 h-18 rounded-2xl flex items-center justify-center transition-all"
            style={{
              width: "72px", height: "72px",
              background: dragging ? "rgba(34,211,238,0.12)" : "rgba(99,102,241,0.1)",
              border: `1.5px solid ${dragging ? "rgba(34,211,238,0.55)" : "rgba(99,102,241,0.35)"}`,
            }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
              style={{ color: dragging ? "#22d3ee" : "#818cf8" }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div>
          <p className="text-lg font-semibold text-slate-100">
            {dragging ? "Release to upload" : "Drop your video here"}
          </p>
          <p className="text-base text-slate-400 mt-1.5">
            or <span className="text-indigo-400 font-medium">click to browse</span>
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 text-sm text-slate-500">
          <span>MP4</span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-700 inline-block" />
          <span>MOV</span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-700 inline-block" />
          <span>WebM</span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-700 inline-block" />
          <span>Up to 500 MB</span>
        </div>

        {/* Modality hint */}
        <div className="flex items-center justify-center gap-2 pt-2">
          {[
            { icon: "🎙️", label: "Speech indexed" },
            { icon: "📄", label: "Text extracted" },
            { icon: "👁️", label: "Scenes analyzed" },
          ].map(({ icon, label }) => (
            <span key={label}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-slate-500"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
              {icon} {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
