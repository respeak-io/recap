import { createClient } from "@/lib/supabase/server";
import { ArticleRenderer, extractHeadings } from "@/components/docs/article-renderer";
import { Toc } from "@/components/docs/toc";
import { notFound } from "next/navigation";
import { ArticleWithVideo } from "./article-with-video";

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; articleSlug: string }>;
  searchParams: Promise<{ audience?: string }>;
}) {
  const { projectSlug, articleSlug } = await params;
  const { audience = "developers" } = await searchParams;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("*, videos(*), projects!inner(*)")
    .eq("projects.slug", projectSlug)
    .eq("slug", articleSlug)
    .eq("audience", audience)
    .eq("status", "published")
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

  const headings = extractHeadings(article.content_json);

  return (
    <div className="flex">
      <article className="flex-1 max-w-3xl mx-auto px-8 py-12 min-w-0">
        <ArticleWithVideo
          title={article.title}
          content={article.content_json}
          videoUrl={videoUrl}
        />
      </article>
      <Toc headings={headings} />
    </div>
  );
}
