import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { extractHeadings } from "@/lib/extract-headings";
import { Toc } from "@/components/docs/toc";
import { DocsBreadcrumb } from "@/components/docs/docs-breadcrumb";
import { AnalyticsTracker } from "@/components/docs/analytics-tracker";
import { ChapterPage } from "@/components/docs/chapter-page";
import { PageNav, type NavItem } from "@/components/docs/page-nav";
import { notFound, redirect } from "next/navigation";
import { ArticleWithVideo } from "./article-with-video";
import {
  buildAlternates,
  isLocale,
  projectDefaultLocale,
} from "@/lib/docs-locale";

interface NavChapter {
  slug: string;
  title: string;
  description?: string;
  order: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  translations?: Record<string, { title?: string; description?: string; content_json?: any }> | null;
  articles: { slug: string; title: string; description?: string; language: string; status: string; order: number }[];
}

function buildNavList(chapters: NavChapter[], lang: string): NavItem[] {
  const items: NavItem[] = [];
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  for (const ch of sorted) {
    const title = ch.translations?.[lang]?.title ?? ch.title;
    const description = ch.translations?.[lang]?.description ?? ch.description;
    items.push({ title, description, slug: ch.slug });
    const arts = ch.articles
      .filter((a) => a.language === lang && a.status === "published")
      .sort((a, b) => a.order - b.order);
    for (const a of arts) {
      items.push({ title: a.title, description: a.description, slug: a.slug });
    }
  }
  return items;
}

async function resolveVideoUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contentJson: Record<string, unknown>,
  language: string,
  projectDefaultLanguage: string
): Promise<Record<string, string>> {
  const videoIds = new Set<string>();
  const videoGroupIds = new Set<string>();

  function walk(nodes: unknown[]) {
    for (const node of nodes) {
      const n = node as Record<string, unknown>;
      if (n.type === "projectVideo" && n.attrs) {
        const attrs = n.attrs as Record<string, unknown>;
        if (attrs.videoGroupId) videoGroupIds.add(attrs.videoGroupId as string);
        else if (attrs.videoId) videoIds.add(attrs.videoId as string);
      }
      if (Array.isArray(n.content)) walk(n.content);
    }
  }

  const content = (contentJson as Record<string, unknown>).content;
  if (Array.isArray(content)) walk(content);

  if (videoIds.size === 0 && videoGroupIds.size === 0) return {};

  const urls: Record<string, string> = {};

  // Handle legacy videoId references
  if (videoIds.size > 0) {
    const { data: legacyVideos } = await supabase
      .from("videos")
      .select("id, storage_path")
      .in("id", Array.from(videoIds))
      .eq("status", "ready");

    for (const video of legacyVideos ?? []) {
      if (video.storage_path) {
        const { data } = await supabase.storage
          .from("videos")
          .createSignedUrl(video.storage_path, 3600);
        if (data?.signedUrl) urls[video.id] = data.signedUrl;
      }
    }
  }

  // Handle videoGroupId references with language fallback
  if (videoGroupIds.size > 0) {
    const { data: groupVideos } = await supabase
      .from("videos")
      .select("id, video_group_id, language, storage_path, created_at")
      .in("video_group_id", Array.from(videoGroupIds))
      .eq("status", "ready");

    const grouped = new Map<string, typeof groupVideos>();
    for (const v of groupVideos ?? []) {
      const list = grouped.get(v.video_group_id) ?? [];
      list.push(v);
      grouped.set(v.video_group_id, list);
    }

    for (const [groupId, variants] of grouped) {
      if (!variants || variants.length === 0) continue;

      // Fallback chain: requested language -> project default -> oldest
      const match =
        variants.find((v) => v.language === language) ??
        variants.find((v) => v.language === projectDefaultLanguage) ??
        [...variants].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

      if (match?.storage_path) {
        const { data } = await supabase.storage
          .from("videos")
          .createSignedUrl(match.storage_path, 3600);
        if (data?.signedUrl) urls[groupId] = data.signedUrl;
      }
    }
  }

  return urls;
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
}: {
  params: Promise<{ locale: string; projectSlug: string; articleSlug: string }>;
}): Promise<Metadata> {
  const { locale, projectSlug, articleSlug } = await params;
  const lang = locale;
  const supabase = await createClient();

  // Languages this slug is published in — drives the hreflang alternates.
  const { data: variants } = await supabase
    .from("articles")
    .select("language, projects!inner(slug)")
    .eq("projects.slug", projectSlug)
    .eq("slug", articleSlug)
    .eq("status", "published");

  let available = [
    ...new Set((variants ?? []).map((v) => v.language)),
  ].filter(isLocale);

  // Chapters have no per-language rows; fall back to the project's published locales.
  if (available.length === 0) {
    const { data } = await supabase
      .from("projects")
      .select("articles(language, status)")
      .eq("slug", projectSlug)
      .eq("is_public", true)
      .single();
    available = [
      ...new Set(
        ((data?.articles ?? []) as { language: string; status: string }[])
          .filter((a) => a.status === "published")
          .map((a) => a.language),
      ),
    ].filter(isLocale);
  }

  const alternates = available.length
    ? buildAlternates({
        pathWithoutLocale: `/${projectSlug}/${articleSlug}`,
        available,
        currentLocale: locale,
      })
    : undefined;

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
    return { title: `${article.title} | ${projectName}`, alternates };
  }

  // Try chapter
  const { data: chapter } = await supabase
    .from("chapters")
    .select("title, translations, projects!inner(name)")
    .eq("projects.slug", projectSlug)
    .eq("slug", articleSlug)
    .single();

  if (chapter) {
    const projectName = (chapter.projects as unknown as { name: string }).name;
    const title =
      (chapter.translations as Record<string, { title?: string }> | null)?.[lang]
        ?.title ?? chapter.title;
    return { title: `${title} | ${projectName}`, alternates };
  }

  return { title: "Not Found" };
}

export default async function ArticleOrChapterPage({
  params,
}: {
  params: Promise<{ locale: string; projectSlug: string; articleSlug: string }>;
}) {
  const { locale, projectSlug, articleSlug } = await params;
  const lang = locale;
  const supabase = await createClient();

  // Resolve project ID first
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, translations")
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) notFound();

  const projectTranslations = project.translations as Record<string, { name?: string }> | null;
  const resolvedProjectName = projectTranslations?.[lang]?.name || project.name;

  // Fetch nav tree for prev/next (used by both article and chapter pages)
  const { data: navChapters } = await supabase
    .from("chapters")
    .select("slug, title, description, order, translations, articles(slug, title, description, language, status, \"order\")")
    .eq("project_id", project.id)
    .order("order");

  const navList = buildNavList((navChapters ?? []) as NavChapter[], lang);
  const { prev, next } = findPrevNext(navList, articleSlug);

  // Try article first
  const { data: article } = await supabase
    .from("articles")
    .select("*, videos(*), chapters(title, slug, translations)")
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

    const embeddedVideoUrls = await resolveVideoUrls(supabase, article.content_json, lang, "en");

    const headings = extractHeadings(article.content_json);

    return (
      <div className="flex gap-8">
        <article className="flex-1 max-w-[720px] mx-auto px-8 py-12 min-w-0">
          <DocsBreadcrumb
            projectName={resolvedProjectName}
            projectSlug={projectSlug}
            locale={locale}
            chapterTitle={article.chapters?.translations?.[lang]?.title ?? article.chapters?.title}
            chapterSlug={article.chapters?.slug}
            articleTitle={article.title}
          />
          <ArticleWithVideo
            title={article.title}
            description={article.description}
            content={article.content_json}
            videoUrl={videoUrl}
            videoUrls={embeddedVideoUrls}
            locale={locale}
          />
          <PageNav prev={prev} next={next} projectSlug={projectSlug} locale={locale} />
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

  // Try chapter next. Chapters are locale-agnostic (they render in every locale via
  // translation fallback), so a chapter matching this slug wins over redirecting the
  // reader to an article variant in another language.
  const { data: chapter } = await supabase
    .from("chapters")
    .select("*, articles(id, title, description, slug, language, status, \"order\")")
    .eq("project_id", project.id)
    .eq("slug", articleSlug)
    .single();

  if (!chapter) {
    // No article in this locale and no chapter: if this slug is published as an
    // article in another locale, send the reader there (e.g. an English deep-link
    // to a German-only article → `/de/…`); otherwise 404.
    const { data: otherVariants } = await supabase
      .from("articles")
      .select("language")
      .eq("project_id", project.id)
      .eq("slug", articleSlug)
      .eq("status", "published");

    const otherLocales = [
      ...new Set((otherVariants ?? []).map((v) => v.language)),
    ].filter(isLocale);
    if (otherLocales.length > 0) {
      redirect(`/${projectDefaultLocale(otherLocales)}/${projectSlug}/${articleSlug}`);
    }

    notFound();
  }

  const chapterTitle =
    chapter.translations?.[lang]?.title ?? chapter.title;
  const chapterDescription =
    chapter.translations?.[lang]?.description ?? chapter.description;

  const articles = (chapter.articles ?? [])
    .filter(
      (a: { language: string; status: string }) =>
        a.language === lang && a.status === "published"
    )
    .sort(
      (a: { order: number }, b: { order: number }) => a.order - b.order
    );

  const chapterContentJson = chapter.translations?.[lang]?.content_json ?? chapter.content_json;
  const chapterVideoUrls = chapterContentJson
    ? await resolveVideoUrls(supabase, chapterContentJson as Record<string, unknown>, lang, "en")
    : {};

  return (
    <ChapterPage
      projectName={project.name}
      projectSlug={projectSlug}
      locale={locale}
      chapterTitle={chapterTitle}
      chapterDescription={chapterDescription}
      contentJson={chapterContentJson}
      articles={articles}
      prev={prev}
      next={next}
      videoUrls={chapterVideoUrls}
    />
  );
}
