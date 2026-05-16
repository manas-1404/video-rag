import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  endpoint: process.env.BUCKET_ENDPOINT_URL!,
  region: process.env.BUCKET_REGION || "auto",
  credentials: {
    accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,
});

export const BUCKET_NAME = process.env.BUCKET_NAME!;
