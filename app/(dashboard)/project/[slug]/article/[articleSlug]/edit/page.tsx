import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EditorPageClient } from "./editor-page-client";

export default async function ArticleEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; articleSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug, articleSlug } = await params;
  const { lang = "en" } = await searchParams;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("*, projects!inner(*), videos(*)")
    .eq("projects.slug", slug)
    .eq("slug", articleSlug)
    .eq("language", lang)
    .single();

  if (!article) notFound();

  // Fetch sibling language versions
  const { data: siblingLanguages } = await supabase
    .from("articles")
    .select("id, language, status")
    .eq("project_id", article.project_id)
    .eq("slug", articleSlug);

  // Get signed URL for video if present
  let videoUrl: string | null = null;
  if (article.videos?.storage_path) {
    const { data } = await supabase.storage
      .from("videos")
      .createSignedUrl(article.videos.storage_path, 3600);
    videoUrl = data?.signedUrl ?? null;
  }

  return (
    <EditorPageClient
      article={{
        id: article.id,
        title: article.title,
        slug: article.slug,
        status: article.status,
        content_json: article.content_json,
        videos: article.videos,
      }}
      projectSlug={slug}
      projectName={article.projects.name}
      videoUrl={videoUrl}
      siblingLanguages={siblingLanguages ?? []}
      currentLanguage={lang}
    />
  );
}
