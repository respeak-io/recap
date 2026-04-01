import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { extractHeadings } from "@/lib/extract-headings";
import { Toc } from "@/components/docs/toc";
import { DocsBreadcrumb } from "@/components/docs/docs-breadcrumb";
import { AnalyticsTracker } from "@/components/docs/analytics-tracker";
import { ChapterPage } from "@/components/docs/chapter-page";
import { PageNav, type NavItem } from "@/components/docs/page-nav";
import { notFound } from "next/navigation";
import { ArticleWithVideo } from "./article-with-video";

interface NavChapter {
  slug: string;
  title: string;
  order: number;
  translations?: Record<string, { title?: string }> | null;
  articles: { slug: string; title: string; language: string; status: string; order: number }[];
}

function buildNavList(chapters: NavChapter[], lang: string): NavItem[] {
  const items: NavItem[] = [];
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  for (const ch of sorted) {
    const title = ch.translations?.[lang]?.title ?? ch.title;
    items.push({ title, slug: ch.slug });
    const arts = ch.articles
      .filter((a) => a.language === lang && a.status === "published")
      .sort((a, b) => a.order - b.order);
    for (const a of arts) {
      items.push({ title: a.title, slug: a.slug });
    }
  }
  return items;
}

function findPrevNext(navList: NavItem[], currentSlug: string) {
  const idx = navList.findIndex((item) => item.slug === currentSlug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? navList[idx - 1] : null,
    next: idx < navList.length - 1 ? navList[idx + 1] : null,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; articleSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { projectSlug, articleSlug } = await params;
  const { lang = "en" } = await searchParams;
  const supabase = await createClient();

  // Try article first
  const { data: article } = await supabase
    .from("articles")
    .select("title, projects!inner(name)")
    .eq("projects.slug", projectSlug)
    .eq("slug", articleSlug)
    .eq("language", lang)
    .eq("status", "published")
    .single();

  if (article) {
    const projectName = (article.projects as unknown as { name: string }).name;
    return { title: `${article.title} | ${projectName}` };
  }

  // Try chapter
  const { data: chapter } = await supabase
    .from("chapters")
    .select("title, projects!inner(name)")
    .eq("projects.slug", projectSlug)
    .eq("slug", articleSlug)
    .single();

  if (chapter) {
    const projectName = (chapter.projects as unknown as { name: string }).name;
    return { title: `${chapter.title} | ${projectName}` };
  }

  return { title: "Not Found" };
}

export default async function ArticleOrChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; articleSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { projectSlug, articleSlug } = await params;
  const { lang = "en" } = await searchParams;
  const supabase = await createClient();

  // Resolve project ID first
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) notFound();

  // Fetch nav tree for prev/next (used by both article and chapter pages)
  const { data: navChapters } = await supabase
    .from("chapters")
    .select("slug, title, order, translations, articles(slug, title, language, status, \"order\")")
    .eq("project_id", project.id)
    .order("order");

  const navList = buildNavList((navChapters ?? []) as NavChapter[], lang);
  const { prev, next } = findPrevNext(navList, articleSlug);

  // Try article first
  const { data: article } = await supabase
    .from("articles")
    .select("*, videos(*), chapters(title)")
    .eq("project_id", project.id)
    .eq("slug", articleSlug)
    .eq("language", lang)
    .eq("status", "published")
    .single();

  if (article) {
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
            projectName={project.name}
            projectSlug={projectSlug}
            chapterTitle={article.chapters?.title}
            articleTitle={article.title}
          />
          <ArticleWithVideo
            title={article.title}
            description={article.description}
            content={article.content_json}
            videoUrl={videoUrl}
          />
          <PageNav prev={prev} next={next} projectSlug={projectSlug} lang={lang} />
        </article>
        <Toc headings={headings} />
        <AnalyticsTracker
          projectId={project.id}
          articleSlug={articleSlug}
          articleId={article.id}
          language={lang}
        />
      </div>
    );
  }

  // Try chapter
  const { data: chapter } = await supabase
    .from("chapters")
    .select("*, articles(id, title, description, slug, language, status, \"order\")")
    .eq("project_id", project.id)
    .eq("slug", articleSlug)
    .single();

  if (!chapter) notFound();

  const chapterTitle =
    chapter.translations?.[lang]?.title ?? chapter.title;

  const articles = (chapter.articles ?? [])
    .filter(
      (a: { language: string; status: string }) =>
        a.language === lang && a.status === "published"
    )
    .sort(
      (a: { order: number }, b: { order: number }) => a.order - b.order
    );

  return (
    <ChapterPage
      projectName={project.name}
      projectSlug={projectSlug}
      chapterTitle={chapterTitle}
      chapterDescription={chapter.description}
      contentJson={chapter.content_json}
      articles={articles}
      prev={prev}
      next={next}
      lang={lang}
    />
  );
}
