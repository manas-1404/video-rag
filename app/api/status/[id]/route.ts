import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/status/[id]">
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const [video] = await db
    .select({
      id: videos.id,
      status: videos.status,
      title: videos.title,
      errorMessage: videos.errorMessage,
    })
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, session.user.id)));

  if (!video) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(video);
}
