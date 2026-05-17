import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import LogoutButton from "./logout-button";

export default async function Navbar() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return (
    <nav className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-6">
        <Link href="/videos" className="text-sm font-semibold text-zinc-100 hover:text-white">
          VideoRAG
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/videos" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            My Videos
          </Link>
          <Link href="/upload" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            Upload
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-zinc-500">{session.user.email}</span>
        <LogoutButton />
      </div>
    </nav>
  );
}
