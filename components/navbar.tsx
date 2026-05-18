import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import LogoutButton from "./logout-button";
import MeridianMark from "./meridian-mark";

export default async function Navbar() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return (
    <nav className="navbar-glass shrink-0 flex items-center justify-between px-8 py-4 sticky top-0 z-50">
      <div className="flex items-center gap-10">
        {/* Logo */}
        <Link href="/videos" className="flex items-center gap-3">
          <MeridianMark size={34} />
          <span className="text-lg font-bold tracking-tight gradient-text-subtle">Meridian</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/videos"
            className="px-4 py-2 rounded-lg text-base font-medium transition-all text-slate-400 hover:text-slate-200 hover:bg-white/5"
          >
            Library
          </Link>
          <Link
            href="/upload"
            className="px-4 py-2 rounded-lg text-base font-medium transition-all text-slate-400 hover:text-slate-200 hover:bg-white/5"
          >
            Upload
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm hidden sm:block text-slate-500">
          {session.user.email}
        </span>
        <LogoutButton />
      </div>
    </nav>
  );
}
