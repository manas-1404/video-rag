import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import LogoutButton from "./logout-button";
import MeridianMark from "./meridian-mark";

export default async function Navbar() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return (
    <nav className="navbar-glass shrink-0 flex items-center justify-between px-6 py-3 sticky top-0 z-50">
      <div className="flex items-center gap-7">
        {/* Logo */}
        <Link href="/videos" className="flex items-center gap-2.5">
          <MeridianMark size={28} />
          <span className="text-sm font-semibold tracking-tight gradient-text-subtle">Meridian</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/videos"
            className="px-3 py-1.5 rounded-lg text-sm transition-all text-slate-400 hover:text-slate-200 hover:bg-white/5"
          >
            Library
          </Link>
          <Link
            href="/upload"
            className="px-3 py-1.5 rounded-lg text-sm transition-all text-slate-400 hover:text-slate-200 hover:bg-white/5"
          >
            Upload
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs hidden sm:block text-slate-600">
          {session.user.email}
        </span>
        <LogoutButton />
      </div>
    </nav>
  );
}
