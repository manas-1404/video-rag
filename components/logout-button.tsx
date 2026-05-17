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
      className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
    >
      Sign out
    </button>
  );
}
