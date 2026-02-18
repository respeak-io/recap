"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Editor } from "@/editor/editor";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video-player";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { saveArticleAction, togglePublishAction, batchTogglePublishAction } from "./actions";

interface ArticleData {
  id: string;
  title: string;
  slug: string;
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
  siblingLanguages,
  currentLanguage,
}: {
  article: ArticleData;
  projectSlug: string;
  projectName: string;
  videoUrl: string | null;
  siblingLanguages: { id: string; language: string; status: string }[];
  currentLanguage: string;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [status, setStatus] = useState(article.status);
  const [languageStatuses, setLanguageStatuses] = useState<Record<string, string>>(
    Object.fromEntries(siblingLanguages.map((lang) => [lang.id, lang.status]))
  );
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

  async function handleLanguagePublishToggle(langId: string) {
    const currentStatus = languageStatuses[langId];
    const newPublish = currentStatus !== "published";
    // Optimistic update
    setLanguageStatuses((prev) => ({
      ...prev,
      [langId]: newPublish ? "published" : "draft",
    }));
    if (langId === article.id) {
      setStatus(newPublish ? "published" : "draft");
    }
    await batchTogglePublishAction([{ id: langId, publish: newPublish }]);
  }

  async function handlePublishAll(publish: boolean) {
    const updates = siblingLanguages.map((lang) => ({
      id: lang.id,
      publish,
    }));
    // Optimistic update
    setLanguageStatuses(
      Object.fromEntries(
        siblingLanguages.map((lang) => [lang.id, publish ? "published" : "draft"])
      )
    );
    setStatus(publish ? "published" : "draft");
    await batchTogglePublishAction(updates);
  }

  async function handleTranslate() {
    if (!window.confirm("This will overwrite the current content with a fresh translation from the English version. Continue?")) {
      return;
    }
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch(`/api/articles/${article.id}/translate`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Translation failed");
      }
      window.location.reload();
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : "Translation failed");
      setTranslating(false);
    }
  }

  const publicUrl = `/${projectSlug}/${article.slug}`;

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
      {siblingLanguages.length > 1 && (
        <Tabs value={currentLanguage}>
          <TabsList>
            {siblingLanguages.map((lang) => (
              <TabsTrigger key={lang.language} value={lang.language} asChild>
                <Link href={`/project/${projectSlug}/article/${article.slug}/edit?lang=${lang.language}`} className="flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full",
                    languageStatuses[lang.id] === "published" ? "bg-green-500" : "bg-muted-foreground/40"
                  )} />
                  {lang.language.toUpperCase()}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{article.title}</h1>
          <Badge variant={status === "published" ? "default" : "secondary"}>
            {status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {currentLanguage !== "en" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTranslate}
              disabled={translating}
            >
              {translating ? "Translating..." : "Re-translate from English"}
            </Button>
          )}
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
          {siblingLanguages.length <= 1 ? (
            <Button size="sm" onClick={handleTogglePublish}>
              {status === "published" ? "Unpublish" : "Publish"}
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  {(() => {
                    const publishedCount = Object.values(languageStatuses).filter(
                      (s) => s === "published"
                    ).length;
                    if (publishedCount === siblingLanguages.length) return "Published";
                    if (publishedCount > 0) return "Partially published";
                    return "Publish";
                  })()}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Publish languages</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {siblingLanguages.map((lang) => (
                  <DropdownMenuCheckboxItem
                    key={lang.id}
                    checked={languageStatuses[lang.id] === "published"}
                    onCheckedChange={() => handleLanguagePublishToggle(lang.id)}
                  >
                    {lang.language.toUpperCase()}
                    {lang.id === article.id && (
                      <span className="ml-1 text-muted-foreground">(current)</span>
                    )}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={
                    Object.values(languageStatuses).every((s) => s === "published")
                      ? true
                      : Object.values(languageStatuses).some((s) => s === "published")
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) => handlePublishAll(!!checked)}
                >
                  All languages
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {translateError && (
        <p className="text-sm text-destructive">{translateError}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Editor
          key={article.id}
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
