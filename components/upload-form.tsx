"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

type Phase =
  | { type: "idle" }
  | { type: "uploading"; progress: number }
  | { type: "processing"; videoId: string; status: string }
  | { type: "error"; message: string };

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Queued for processing…",
  EXTRACTING: "Extracting frames and audio…",
  PROCESSING: "Transcribing audio and analysing frames…",
  READY: "Ready!",
  ERROR: "Processing failed",
};

export default function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [dragging, setDragging] = useState(false);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(videoId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${videoId}`);
        const data = await res.json();

        setPhase({ type: "processing", videoId, status: data.status });

        if (data.status === "READY") {
          stopPolling();
          router.push(`/video/${videoId}`);
        } else if (data.status === "ERROR") {
          stopPolling();
          setPhase({ type: "error", message: data.errorMessage ?? "Processing failed" });
        }
      } catch {
        // transient network error — keep polling
      }
    }, 3000);
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setPhase({ type: "error", message: "Please upload a video file." });
      return;
    }

    try {
      setPhase({ type: "uploading", progress: 0 });

      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob-token",
        onUploadProgress: ({ percentage }) => {
          setPhase({ type: "uploading", progress: percentage });
        },
      });

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url, title: file.name }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }

      const { videoId } = await res.json();
      setPhase({ type: "processing", videoId, status: "PENDING" });
      startPolling(videoId);
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
        <p className="text-zinc-300 text-sm font-medium">Uploading video…</p>
        <div className="w-full bg-zinc-800 rounded-full h-2">
          <div
            className="bg-violet-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${phase.progress}%` }}
          />
        </div>
        <p className="text-zinc-500 text-xs">{phase.progress}%</p>
      </div>
    );
  }

  if (phase.type === "processing") {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center space-y-4">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-zinc-300 text-sm font-medium">
          {STATUS_LABELS[phase.status] ?? "Processing…"}
        </p>
        <p className="text-zinc-600 text-xs">
          This can take a few minutes depending on video length.
        </p>
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
