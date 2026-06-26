import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos, asrChunks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { s3, BUCKET_NAME } from "@/lib/s3";
import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { pinecone } from "@/lib/genai";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: videoId } = await params;

  const [video] = await db
    .select({ id: videos.id, blobUrl: videos.blobUrl, isDemo: videos.isDemo })
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, session.user.id)));

  if (!video) return Response.json({ error: "Not found" }, { status: 404 });
  if (video.isDemo) return Response.json({ error: "Demo videos cannot be deleted" }, { status: 403 });

  // Pinecone cleanup — non-fatal, don't block DB delete if this fails
  try {
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);

    const chunks = await db
      .select({ pineconeId: asrChunks.pineconeId })
      .from(asrChunks)
      .where(eq(asrChunks.videoId, videoId));

    const transcriptIds = chunks.map((c) => c.pineconeId).filter(Boolean) as string[];
    if (transcriptIds.length > 0) {
      await index.namespace("transcript").deleteMany(transcriptIds);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (index.namespace("scenes").deleteMany as any)({ video_id: { $eq: videoId } });
  } catch (err) {
    console.error("[delete] Pinecone cleanup failed (non-fatal):", err);
  }

  // S3 cleanup — non-fatal, don't block DB delete if this fails
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: video.blobUrl }));

    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: `videos/${videoId}/` })
    );

    if (listed.Contents && listed.Contents.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: listed.Contents.map((obj) => ({ Key: obj.Key! })),
            Quiet: true,
          },
        })
      );
    }
  } catch (err) {
    console.error("[delete] S3 cleanup failed (non-fatal):", err);
  }

  // DB delete — this is the critical operation, always runs
  await db.delete(videos).where(eq(videos.id, videoId));

  return Response.json({ ok: true });
}
