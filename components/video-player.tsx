"use client";

import { useRef, useImperativeHandle, forwardRef } from "react";

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void;
}

interface VideoPlayerProps {
  src: string;
  className?: string;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ src, className }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number) {
        if (videoRef.current) {
          videoRef.current.currentTime = seconds;
          videoRef.current.play();
        }
      },
    }));

    return (
      <video
        ref={videoRef}
        src={src}
        controls
        className={`w-full rounded-lg ${className ?? ""}`}
      >
        Your browser does not support the video tag.
      </video>
    );
  }
);
