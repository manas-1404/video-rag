"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TERMINAL = new Set(["READY", "ERROR"]);
const POLL_MS = 20000;

type VideoStatus = { id: string; status: string };

export default function VideoStatusPoller({ initial }: { initial: VideoStatus[] }) {
  const router = useRouter();
  const hasProcessing = initial.some((v) => !TERMINAL.has(v.status));

  useEffect(() => {
    if (!hasProcessing) return;

    // Track last-seen statuses so we only refresh on actual changes
    const seen = new Map(initial.map((v) => [v.id, v.status]));

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/videos/status");
        if (!res.ok) return;
        const { statuses }: { statuses: VideoStatus[] } = await res.json();

        const changed = statuses.some((v) => seen.get(v.id) !== v.status);
        statuses.forEach((v) => seen.set(v.id, v.status));

        if (changed) router.refresh();
        if (statuses.every((v) => TERMINAL.has(v.status))) clearInterval(interval);
      } catch {
        // ignore transient network errors
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [hasProcessing, router]);

  return null;
}
