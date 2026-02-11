"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Editor } from "@/editor/editor";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video-player";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { saveArticleAction, togglePublishAction } from "./actions";

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  audience: string;
  status: string;
  content_json: Record<string, unknown>;
  videos: { storage_path: string } | null;
}

function extractText(json: Record<string, unknown>): string {
  const content = json.content as Array<Record<string, unknown>> | undefined;
  if (!content) return "";
  return content
    .map((node) => {
      if (node.type === "text") return node.text as string;
      const inner = node.content as Array<Record<string, unknown>> | undefined;
      if (inner) return extractText({ content: inner } as Record<string, unknown>);
      return "";
    })
    .join("\n");
}

export function EditorPageClient({
  article,
  projectSlug,
  projectName,
  videoUrl,
}: {
  article: ArticleData;
  projectSlug: string;
  projectName: string;
  videoUrl: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState(article.status);
  const contentRef = useRef(article.content_json);
  const playerRef = useRef<VideoPlayerHandle>(null);

  const handleUpdate = useCallback((json: Record<string, unknown>) => {
    contentRef.current = json;
    setSaved(false);
  }, []);

  const handleTimestampClick = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds);
  }, []);

  async function handleSave() {
    setSaving(true);
    const text = extractText(contentRef.current);
    await saveArticleAction(article.id, contentRef.current, text);
    setSaving(false);
    setSaved(true);
  }

  async function handleTogglePublish() {
    const newStatus = status === "published" ? "draft" : "published";
    await togglePublishAction(article.id, newStatus === "published");
    setStatus(newStatus);
  }

  const publicUrl = `/${projectSlug}/${article.slug}?audience=${article.audience}`;

  return (
    <>
    <BreadcrumbNav
      projectName={projectName}
      projectSlug={projectSlug}
      items={[
        { label: "Articles", href: `/project/${projectSlug}/articles` },
        { label: article.title },
      ]}
    />
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{article.title}</h1>
          <Badge variant="outline">{article.audience}</Badge>
          <Badge variant={status === "published" ? "default" : "secondary"}>
            {status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {status === "published" && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={publicUrl} target="_blank">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                View
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </Button>
          <Button size="sm" onClick={handleTogglePublish}>
            {status === "published" ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Editor
          content={article.content_json}
          onUpdate={handleUpdate}
          onTimestampClick={handleTimestampClick}
        />
        {videoUrl && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Source video
            </h3>
            <VideoPlayer ref={playerRef} src={videoUrl} />
          </div>
        )}
      </div>
    </div>
    </>
  );
}
