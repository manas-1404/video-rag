import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { videos } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const statuses = await db
    .select({ id: videos.id, status: videos.status })
    .from(videos)
    .where(or(eq(videos.userId, session.user.id), eq(videos.isDemo, true)));

  return Response.json({ statuses });
}
