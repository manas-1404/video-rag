"use client";

import { useEffect, useRef } from "react";
import ReactPlayer from "react-player";

type Props = {
  url: string;
  seekTo: number | null;
};

export default function VideoPlayer({ url, seekTo }: Props) {
  const playerRef = useRef<ReactPlayer>(null);
  const prevSeekRef = useRef<number | null>(null);

  useEffect(() => {
    if (seekTo !== null && seekTo !== prevSeekRef.current && playerRef.current) {
      playerRef.current.seekTo(seekTo / 1000, "seconds");
      prevSeekRef.current = seekTo;
    }
  }, [seekTo]);

  return (
    <div className="rounded-xl overflow-hidden bg-black aspect-video w-full">
      <ReactPlayer
        ref={playerRef}
        url={url}
        width="100%"
        height="100%"
        controls
        config={{
          file: {
            attributes: { controlsList: "nodownload" },
          },
        }}
      />
    </div>
  );
}
