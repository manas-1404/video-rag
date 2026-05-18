"use client";

import { useEffect, useRef } from "react";
import ReactPlayer from "react-player";

type Props = {
  url: string;
  seekTo: number | null;
};

export default function VideoPlayer({ url, seekTo }: Props) {
  const playerRef = useRef<HTMLVideoElement>(null);
  const prevSeekRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      seekTo !== null &&
      seekTo !== prevSeekRef.current &&
      playerRef.current
    ) {
      playerRef.current.currentTime = seekTo / 1000;
      prevSeekRef.current = seekTo;
    }
  }, [seekTo]);

  return (
    <div className="rounded-2xl overflow-hidden aspect-video w-full"
      style={{ background: "#000", boxShadow: "0 0 0 1px rgba(255,255,255,0.07), 0 8px 32px rgba(0,0,0,0.6)" }}>
      <ReactPlayer
        ref={playerRef}
        src={url}
        width="100%"
        height="100%"
        controls
      />
    </div>
  );
}
