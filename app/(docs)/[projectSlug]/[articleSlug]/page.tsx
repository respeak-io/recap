import { createClient } from "@/lib/supabase/server";
import { extractHeadings } from "@/lib/extract-headings";
import { Toc } from "@/components/docs/toc";
import { DocsBreadcrumb } from "@/components/docs/docs-breadcrumb";
import { AnalyticsTracker } from "@/components/docs/analytics-tracker";
import { notFound } from "next/navigation";
import { ArticleWithVideo } from "./article-with-video";

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; articleSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { projectSlug, articleSlug } = await params;
  const { lang = "en" } = await searchParams;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("*, videos(*), projects!inner(*), chapters(title)")
    .eq("projects.slug", projectSlug)
    .eq("slug", articleSlug)
    .eq("language", lang)
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
    <div className="flex gap-8">
      <article className="flex-1 max-w-[720px] mx-auto px-8 py-12 min-w-0">
        <DocsBreadcrumb
          projectName={article.projects.name}
          projectSlug={projectSlug}
          chapterTitle={article.chapters?.title}
          articleTitle={article.title}
        />
        <ArticleWithVideo
          title={article.title}
          content={article.content_json}
          videoUrl={videoUrl}
        />
      </article>
      <Toc headings={headings} />
      <AnalyticsTracker
        projectId={article.project_id}
        articleSlug={articleSlug}
        articleId={article.id}
        language={lang}
      />
    </div>
  );
}
