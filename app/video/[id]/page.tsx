import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { s3, BUCKET_NAME } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

  const videoUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: video.blobUrl }),
    { expiresIn: 3600 },
  );

  return (
    <QueryInterface
      videoId={video.id}
      videoUrl={videoUrl}
      title={video.title ?? "Untitled video"}
    />
  );
}
