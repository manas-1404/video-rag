import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";
import { put } from "@vercel/blob";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  console.log("[upload] received file:", file.name, "size:", file.size, "type:", file.type);

  let blob;
  try {
    blob = await put(file.name, file, {
      access: "private",
      addRandomSuffix: true,
    });
  } catch (e) {
    console.error("[upload] put error:", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  console.log("[upload] blob stored at:", blob.url);

  const [video] = await db
    .insert(videos)
    .values({
      userId: session.user.id,
      blobUrl: blob.url,
      title: file.name,
      status: "PENDING",
    })
    .returning({ id: videos.id });

  try {
    await inngest.send({
      name: "video/uploaded",
      data: {
        videoId: video.id,
        blobUrl: blob.url,
        userId: session.user.id,
      },
    });
  } catch (e) {
    console.error("[upload] inngest error (run `npx inngest-cli@latest dev` locally):", e);
  }

  return Response.json({ videoId: video.id }, { status: 201 });
}
