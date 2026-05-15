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
    <div className="rounded-xl overflow-hidden bg-black aspect-video w-full">
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
