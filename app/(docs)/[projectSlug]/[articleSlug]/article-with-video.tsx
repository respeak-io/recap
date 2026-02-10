"use client";

import { useRef, useCallback } from "react";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video-player";
import { ArticleRenderer } from "@/components/docs/article-renderer";

interface ArticleWithVideoProps {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  videoUrl: string | null;
}

export function ArticleWithVideo({
  title,
  content,
  videoUrl,
}: ArticleWithVideoProps) {
  const playerRef = useRef<VideoPlayerHandle>(null);

  const handleTimestampClick = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds);
  }, []);

  return (
    <>
      {videoUrl && (
        <VideoPlayer ref={playerRef} src={videoUrl} className="mb-8" />
      )}
      <h1 className="text-3xl font-bold mt-4 mb-6">{title}</h1>
      <ArticleRenderer
        content={content}
        onTimestampClick={handleTimestampClick}
      />
    </>
  );
}
