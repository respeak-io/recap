"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Editor } from "@/editor/editor";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { KeywordInput } from "@/components/editor/keyword-input";
import { saveChapterAction } from "./actions";

interface ChapterEditorClientProps {
  chapter: {
    id: string;
    title: string;
    description: string;
    keywords: string[];
    slug: string;
    content_json: Record<string, unknown>;
  };
  projectSlug: string;
  projectName: string;
  projectId: string;
}

export function ChapterEditorClient({
  chapter,
  projectSlug,
  projectName,
  projectId,
}: ChapterEditorClientProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [description, setDescription] = useState(chapter.description);
  const [keywords, setKeywords] = useState<string[]>(chapter.keywords ?? []);
  const contentRef = useRef(chapter.content_json);

  const handleUpdate = useCallback((json: Record<string, unknown>) => {
    contentRef.current = json;
    setSaved(false);
  }, []);

  async function handleSave() {
    setSaving(true);
    await saveChapterAction(chapter.id, JSON.stringify(contentRef.current), description, keywords);
    setSaving(false);
    setSaved(true);
  }

  const publicUrl = `/${projectSlug}/${chapter.slug}`;

  return (
    <>
      <BreadcrumbNav
        projectName={projectName}
        projectSlug={projectSlug}
        items={[
          { label: "Articles", href: `/project/${projectSlug}/articles` },
          { label: chapter.title },
        ]}
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{chapter.title}</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={publicUrl} target="_blank">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                View
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : saved ? "Saved" : "Save"}
            </Button>
          </div>
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
          placeholder="Add a short description..."
          className="w-full text-sm text-muted-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
        />
        <KeywordInput
          value={keywords}
          onChange={(next) => { setKeywords(next); setSaved(false); }}
        />
        <Editor
          key={chapter.id}
          content={chapter.content_json}
          onUpdate={handleUpdate}
          projectId={projectId}
        />
      </div>
    </>
  );
}
