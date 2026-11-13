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

  // Article and its sibling language versions in parallel (siblings are looked
  // up through the project slug so they don't wait for the article's project_id).
  const [{ data: article }, { data: siblingLanguages }] = await Promise.all([
    supabase
      .from("articles")
      .select("*, keywords, projects!inner(*), videos(*)")
      .eq("projects.slug", slug)
      .eq("slug", articleSlug)
      .eq("language", lang)
      .single(),
    supabase
      .from("articles")
      .select("id, language, status, projects!inner(slug)")
      .eq("projects.slug", slug)
      .eq("slug", articleSlug),
  ]);

  if (!article) notFound();

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
        description: article.description ?? "",
        keywords: article.keywords ?? [],
        slug: article.slug,
        status: article.status,
        content_json: article.content_json,
        videos: article.videos,
      }}
      projectSlug={slug}
      projectName={article.projects.name}
      projectId={article.project_id}
      videoUrl={videoUrl}
      siblingLanguages={(siblingLanguages ?? []).map(({ id, language, status }) => ({ id, language, status }))}
      currentLanguage={lang}
    />
  );
}
