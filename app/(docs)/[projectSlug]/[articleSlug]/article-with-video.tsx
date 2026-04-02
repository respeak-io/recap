"use client";

import { useRef, useCallback } from "react";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video-player";
import { ArticleRenderer } from "@/components/docs/article-renderer";

interface ArticleWithVideoProps {
  title: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  videoUrl: string | null;
  videoUrls?: Record<string, string>;
}

export function ArticleWithVideo({
  title,
  description,
  content,
  videoUrl,
  videoUrls,
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
      <h1 className="text-3xl font-bold mt-4 mb-2">{title}</h1>
      {description && (
        <p className="text-lg text-muted-foreground mb-6">{description}</p>
      )}
      {!description && <div className="mb-4" />}
      <ArticleRenderer
        content={content}
        onTimestampClick={handleTimestampClick}
        videoUrls={videoUrls}
      />
    </>
  );
}
