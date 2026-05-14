import UploadForm from "@/components/upload-form";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function UploadPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
            VideoRAG
          </h1>
          <p className="mt-2 text-zinc-400">
            Upload a video. Ask anything about it.
          </p>
        </div>
        <UploadForm />
      </div>
    </div>
  );
}
