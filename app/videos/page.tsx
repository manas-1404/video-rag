import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { eq, desc, or } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import DeleteVideoButton from "@/components/delete-video-button";
import VideoStatusPoller from "@/components/video-status-poller";

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
    .where(or(eq(videos.userId, session.user.id), eq(videos.isDemo, true)))
    .orderBy(desc(videos.isDemo), desc(videos.createdAt));

  return (
    <div className="flex-1 px-4 py-12 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">Video Library</h1>
          <p className="text-base text-slate-500 mt-1.5">
            {userVideos.length === 0
              ? "No videos yet"
              : `${userVideos.length} video${userVideos.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link href="/upload" className="btn-primary text-base px-5 py-2.5 flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Upload video
        </Link>
      </div>

      <VideoStatusPoller initial={userVideos.map((v) => ({ id: v.id, status: v.status }))} />

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
    <div className={`glass-card px-6 py-5 flex items-center gap-5 ${isReady ? "cursor-pointer" : ""}`}>
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: isReady ? "rgba(99,102,241,0.14)" : isError ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${isReady ? "rgba(99,102,241,0.3)" : isError ? "rgba(239,68,68,0.22)" : "rgba(255,255,255,0.09)"}`,
        }}
      >
        {isReady ? (
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <polygon points="5,3 13,8 5,13" fill="#818cf8" />
          </svg>
        ) : isError ? (
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M8 5v3M8 11h.01" stroke="#f87171" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="8" cy="8" r="6.5" stroke="#f87171" strokeWidth="1.2" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="4" width="12" height="8" rx="1.5" stroke="#64748b" strokeWidth="1.2" />
            <path d="M6 6l4 2-4 2V6z" fill="#64748b" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-slate-100 truncate">
          {video.title ?? "Untitled video"}
        </p>
        {isError && video.errorMessage && (
          <p className="text-sm text-red-400 mt-1 truncate">{video.errorMessage}</p>
        )}
        <p className="text-sm text-slate-500 mt-1 font-mono">
          {video.createdAt ? new Date(video.createdAt).toLocaleString() : ""}
        </p>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 shrink-0">
        {video.isDemo && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
            Demo
          </span>
        )}
        {config.showSpinner && (
          <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
        )}
        <span className={`${config.cls} text-sm font-semibold px-3 py-1.5 rounded-full`}>
          {config.label}
        </span>
        {isReady && (
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" className="text-slate-500">
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {!video.isDemo && <DeleteVideoButton videoId={video.id} />}
      </div>
    </div>
  );

  return isReady ? (
    <Link href={`/video/${video.id}`} className="block">{inner}</Link>
  ) : (
    <div>{inner}</div>
  );
}

function EmptyState() {
  return (
    <div className="glass-card p-16 text-center">
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
        style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.22)" }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="4" width="20" height="16" rx="2" stroke="#818cf8" strokeWidth="1.5" />
          <path d="M10 9l5 3-5 3V9z" fill="#818cf8" />
        </svg>
      </div>
      <p className="text-xl font-bold text-slate-100 mb-2">No videos yet</p>
      <p className="text-base text-slate-400 mb-8 max-w-xs mx-auto leading-relaxed">
        Upload your first video and Meridian will make every second of it searchable.
      </p>
      <Link href="/upload" className="btn-primary inline-flex items-center gap-2 text-base px-7 py-3">
        <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Upload a video
      </Link>
    </div>
  );
}
