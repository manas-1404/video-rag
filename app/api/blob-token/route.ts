import { auth } from "@/lib/auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;
  console.log("[blob-token] body type:", (body as { type?: string }).type);

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        console.log("[blob-token] generating token for:", pathname);
        return {
          allowedContentTypes: [
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "video/x-msvideo",
          ],
          maximumSizeInBytes: 500 * 1024 * 1024,
          callbackUrl: `${process.env.BETTER_AUTH_URL}/api/blob-token`,
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("[blob-token] upload completed:", blob.url, tokenPayload);
      },
    });

    console.log("[blob-token] handleUpload response:", jsonResponse);
    return Response.json(jsonResponse);
  } catch (e) {
    console.error("[blob-token] error:", e);
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
