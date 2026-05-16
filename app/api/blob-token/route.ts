import { auth } from "@/lib/auth";
import { s3, BUCKET_NAME } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const contentType = searchParams.get("contentType") || "video/mp4";
  const ext = contentType.split("/")[1]?.split(";")[0] || "mp4";
  const key = `videos/${crypto.randomUUID()}.${ext}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType }),
    { expiresIn: 3600 },
  );

  return Response.json({ url, key });
}
