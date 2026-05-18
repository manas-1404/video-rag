import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

type Video = typeof videos.$inferSelect;

const STATUS_CONFIG: Record<string, { label: string; cls: string; showSpinner?: boolean }> = {
  PENDING:    { label: "Queued",      cls: "status-pending",    showSpinner: true },
  EXTRACTING: { label: "Extracting",  cls: "status-extracting", showSpinner: true },
  PROCESSING: { label: "Processing",  cls: "status-processing", showSpinner: true },
  READY:      { label: "Ready",       cls: "status-ready" },
  ERROR:      { label: "Error",       cls: "status-error" },
};

export default async function VideosPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const userVideos = await db
    .select()
    .from(videos)
    .where(eq(videos.userId, session.user.id))
    .orderBy(desc(videos.createdAt));

  return (
    <div className="flex-1 px-4 py-12 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Video Library
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {userVideos.length === 0
              ? "No videos yet"
              : `${userVideos.length} video${userVideos.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link
          href="/upload"
          className="btn-primary text-sm px-5 py-2.5 flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Upload video
        </Link>
      </div>

      {userVideos.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {userVideos.map((video) => (
            <VideoRow key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoRow({ video }: { video: Video }) {
  const isReady = video.status === "READY";
  const isError = video.status === "ERROR";
  const config = STATUS_CONFIG[video.status] ?? { label: video.status, cls: "status-pending" };

  const inner = (
    <div className={`glass-card px-5 py-4 flex items-center gap-5 ${isReady ? "hover:border-indigo-500/30" : ""}`}>
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: isReady
            ? "rgba(99,102,241,0.1)"
            : isError
            ? "rgba(239,68,68,0.08)"
            : "rgba(255,255,255,0.04)",
          border: `1px solid ${isReady ? "rgba(99,102,241,0.25)" : isError ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)"}`,
        }}
      >
        {isReady ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <polygon points="6,4 13,8 6,12" fill="#818cf8" />
          </svg>
        ) : isError ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 5v3M8 11h.01" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="8" r="6.5" stroke="#f87171" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="4" width="12" height="8" rx="1.5" stroke="#94a3b8" strokeWidth="1" />
            <path d="M6 6l4 2-4 2V6z" fill="#94a3b8" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-200 truncate">
          {video.title ?? "Untitled video"}
        </p>
        {isError && video.errorMessage && (
          <p className="text-xs text-red-400/80 mt-0.5 truncate">{video.errorMessage}</p>
        )}
        <p className="text-xs text-slate-600 mt-0.5 font-mono">
          {video.createdAt ? new Date(video.createdAt).toLocaleString() : ""}
        </p>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2.5 shrink-0">
        {config.showSpinner && (
          <div className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
        )}
        <span className={`${config.cls} text-xs font-medium px-2.5 py-1 rounded-full`}>
          {config.label}
        </span>
        {isReady && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-600">
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );

  return isReady ? (
    <Link href={`/video/${video.id}`} className="block">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

function EmptyState() {
  return (
    <div className="glass-card p-16 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
        style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="4" width="20" height="16" rx="2" stroke="#6366f1" strokeWidth="1.5" />
          <path d="M10 9l5 3-5 3V9z" fill="#6366f1" />
        </svg>
      </div>
      <p className="font-semibold text-slate-300 mb-2">No videos yet</p>
      <p className="text-sm text-slate-500 mb-7 max-w-xs mx-auto leading-relaxed">
        Upload your first video and Meridian will make every second of it searchable.
      </p>
      <Link href="/upload" className="btn-primary inline-flex items-center gap-2 text-sm px-6 py-2.5">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Upload a video
      </Link>
    </div>
  );
}
