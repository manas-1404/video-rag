"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors px-4 py-2 rounded-lg hover:bg-white/5"
    >
      Sign out
    </button>
  );
}
