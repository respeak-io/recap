import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EditorPageClient } from "./editor-page-client";

export default async function ArticleEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; articleSlug: string }>;
  searchParams: Promise<{ audience?: string }>;
}) {
  const { slug, articleSlug } = await params;
  const { audience = "developers" } = await searchParams;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("*, projects!inner(*), videos(*)")
    .eq("projects.slug", slug)
    .eq("slug", articleSlug)
    .eq("audience", audience)
    .single();

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
        audience: article.audience,
        status: article.status,
        content_json: article.content_json,
        videos: article.videos,
      }}
      videoUrl={videoUrl}
    />
  );
}
