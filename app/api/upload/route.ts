import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";
import { z } from "zod";

const bodySchema = z.object({
  blobUrl: z.string().url(),
  title: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { blobUrl, title } = parsed.data;

  const [video] = await db
    .insert(videos)
    .values({
      userId: session.user.id,
      blobUrl,
      title: title ?? null,
      status: "PENDING",
    })
    .returning({ id: videos.id });

  await inngest.send({
    name: "video/uploaded",
    data: {
      videoId: video.id,
      blobUrl,
      userId: session.user.id,
    },
  });

  return Response.json({ videoId: video.id }, { status: 201 });
}
