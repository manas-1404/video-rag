import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QueryInterface from "@/components/query-interface";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { id } = await params;

  const [video] = await db
    .select({
      id: videos.id,
      title: videos.title,
      status: videos.status,
      blobUrl: videos.blobUrl,
    })
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, session.user.id)));

  if (!video) notFound();
  if (video.status !== "READY") redirect("/upload");

  return (
    <QueryInterface
      videoId={video.id}
      videoUrl={video.blobUrl}
      title={video.title ?? "Untitled video"}
    />
  );
}
