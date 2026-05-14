import { auth } from "@/lib/auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  const jsonResponse = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async () => ({
      allowedContentTypes: [
        "video/mp4",
        "video/quicktime",
        "video/webm",
        "video/x-msvideo",
      ],
      maximumSizeInBytes: 500 * 1024 * 1024,
      tokenPayload: JSON.stringify({ userId: session.user.id }),
    }),
    onUploadCompleted: async () => {
      // nothing to do — the client calls /api/upload after this
    },
  });

  return Response.json(jsonResponse);
}
