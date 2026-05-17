import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/videos");

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-bold text-zinc-100 mb-3">VideoRAG</h1>
      <p className="text-zinc-400 text-lg max-w-md mb-8">
        Upload a video and ask anything about it. Get timestamped answers from speech, on-screen text, and visual context.
      </p>
      <div className="flex gap-3">
        <Link
          href="/register"
          className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
