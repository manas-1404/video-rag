import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import LogoutButton from "./logout-button";

export default async function Navbar() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return (
    <nav className="navbar-glass shrink-0 flex items-center justify-between px-6 py-3 sticky top-0 z-50">
      <div className="flex items-center gap-7">
        {/* Logo */}
        <Link href="/videos" className="flex items-center gap-2.5">
          <div className="logo-mark w-7 h-7">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" fill="white" opacity="0.9" />
              <circle cx="8" cy="8" r="6.5" stroke="white" strokeWidth="1" opacity="0.4" />
              <line x1="8" y1="1.5" x2="8" y2="3" stroke="white" strokeWidth="1.2" opacity="0.6" />
              <line x1="8" y1="13" x2="8" y2="14.5" stroke="white" strokeWidth="1.2" opacity="0.6" />
              <line x1="1.5" y1="8" x2="3" y2="8" stroke="white" strokeWidth="1.2" opacity="0.6" />
              <line x1="13" y1="8" x2="14.5" y2="8" stroke="white" strokeWidth="1.2" opacity="0.6" />
            </svg>
          </div>
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
