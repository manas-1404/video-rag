import UploadForm from "@/components/upload-form";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function UploadPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-20">
      <div className="w-full max-w-lg fade-up">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-5 text-sm text-slate-300 font-medium"
            style={{ border: "1px solid rgba(99,102,241,0.3)" }}>
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse inline-block" />
            Ready to index
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-100 mb-3">
            Upload a video
          </h1>
          <p className="text-base text-slate-400 max-w-sm mx-auto leading-relaxed">
            Meridian will index speech, on-screen text, and visual context —
            making every second searchable.
          </p>
        </div>

        <UploadForm />

        <p className="text-center text-sm text-slate-600 mt-6">
          Processing typically takes 1–3 minutes depending on video length.
        </p>
      </div>
    </div>
  );
}
