import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ChapterEditorClient } from "./chapter-editor-client";

export default async function ChapterEditPage({
  params,
}: {
  params: Promise<{ slug: string; chapterSlug: string }>;
}) {
  const { slug, chapterSlug } = await params;
  const supabase = await createClient();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, description, keywords, slug, content_json, project_id, projects!inner(name)")
    .eq("projects.slug", slug)
    .eq("slug", chapterSlug)
    .single();

  if (!chapter) notFound();

  return (
    <ChapterEditorClient
      chapter={{
        id: chapter.id,
        title: chapter.title,
        description: chapter.description ?? "",
        keywords: chapter.keywords ?? [],
        slug: chapter.slug,
        content_json: chapter.content_json,
      }}
      projectSlug={slug}
      projectName={(chapter.projects as unknown as { name: string }).name}
      projectId={chapter.project_id}
    />
  );
}
