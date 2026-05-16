"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type Phase =
  | { type: "idle" }
  | { type: "uploading" }
  | { type: "error"; message: string };

export default function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setPhase({ type: "error", message: "Please upload a video file." });
      return;
    }

    try {
      setPhase({ type: "uploading" });
      console.log("[upload] sending file:", file.name, "size:", file.size, "type:", file.type);

      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      console.log("[upload] response status:", res.status);

      if (!res.ok) {
        const err = await res.json();
        console.error("[upload] error:", err);
        throw new Error(err.error ?? "Upload failed");
      }

      const data = await res.json();
      console.log("[upload] done:", data);
      router.push("/videos");
    } catch (e) {
      console.error("[upload] caught:", e);
      setPhase({ type: "error", message: (e as Error).message });
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  if (phase.type === "uploading") {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center space-y-4">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-zinc-300 text-sm font-medium">Uploading video…</p>
      </div>
    );
  }

  if (phase.type === "error") {
    return (
      <div className="rounded-2xl border border-red-800/40 bg-red-950/20 p-8 text-center space-y-4">
        <p className="text-red-400 text-sm">{phase.message}</p>
        <button
          onClick={() => setPhase({ type: "idle" })}
          className="text-sm text-zinc-400 hover:text-zinc-200 underline"
        >
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
      className={`
        rounded-2xl border-2 border-dashed p-16 text-center cursor-pointer transition-colors
        ${dragging
          ? "border-violet-500 bg-violet-950/20"
          : "border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-800/50"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onInputChange}
      />
      <div className="space-y-3">
        <div className="text-4xl text-zinc-600">↑</div>
        <p className="text-zinc-300 font-medium">
          Drop your video here, or click to browse
        </p>
        <p className="text-zinc-600 text-sm">MP4, MOV, WebM — up to 500 MB</p>
      </div>
    </div>
  );
}
