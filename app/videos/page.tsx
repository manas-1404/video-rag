import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Queued",
  EXTRACTING: "Extracting",
  PROCESSING: "Processing",
  READY: "Ready",
  ERROR: "Error",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "text-zinc-400",
  EXTRACTING: "text-yellow-400",
  PROCESSING: "text-blue-400",
  READY: "text-green-400",
  ERROR: "text-red-400",
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
    <div className="min-h-screen px-4 py-12 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Your Videos
        </h1>
        <Link
          href="/upload"
          className="text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
        >
          Upload new
        </Link>
      </div>

      {userVideos.length === 0 ? (
        <div className="text-center py-24 text-zinc-500">
          No videos yet.{" "}
          <Link href="/upload" className="text-violet-400 hover:underline">
            Upload one
          </Link>
          .
        </div>
      ) : (
        <ul className="space-y-3">
          {userVideos.map((video) => (
            <li key={video.id}>
              {video.status === "READY" ? (
                <Link href={`/video/${video.id}`} className="block">
                  <VideoCard video={video} />
                </Link>
              ) : (
                <VideoCard video={video} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VideoCard(props: { video: typeof videos.$inferSelect }) {
  const { video } = props;
  const isReady = video.status === "READY";
  const isError = video.status === "ERROR";

  return (
    <div
      className={`rounded-xl border px-5 py-4 flex items-center justify-between gap-4 transition-colors ${
        isReady
          ? "border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-800"
          : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      <div className="min-w-0">
        <p className="text-zinc-100 font-medium truncate">
          {video.title ?? "Untitled"}
        </p>
        {isError && video.errorMessage && (
          <p className="text-xs text-red-400 mt-0.5 truncate">
            {video.errorMessage}
          </p>
        )}
        <p className="text-xs text-zinc-600 mt-0.5">
          {video.createdAt
            ? new Date(video.createdAt).toLocaleString()
            : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isReady && !isError && (
          <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        )}
        <span className={`text-xs font-medium ${STATUS_COLOR[video.status] ?? "text-zinc-400"}`}>
          {STATUS_LABEL[video.status] ?? video.status}
        </span>
        {isReady && (
          <span className="text-xs text-zinc-500">→</span>
        )}
      </div>
    </div>
  );
}
