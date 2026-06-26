"use client";

import { useState } from "react";

export default function DeleteVideoButton({ videoId }: { videoId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm("Delete this video? This will permanently remove all data and cannot be undone.")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to delete video");
        return;
      }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      title="Delete video"
      className="p-2 rounded-lg transition-colors"
      style={{
        color: loading ? "#475569" : "#64748b",
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        if (!loading) (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = loading ? "#475569" : "#64748b";
      }}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M5 4V2.5A.5.5 0 015.5 2h5a.5.5 0 01.5.5V4M6 7v5M10 7v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
    </button>
  );
}
