import type { Metadata } from "next";
import { extractHeadings } from "@/lib/extract-headings";
import { Toc } from "@/components/docs/toc";
import { DocsBreadcrumb } from "@/components/docs/docs-breadcrumb";
import { AnalyticsTracker } from "@/components/docs/analytics-tracker";
import { ChapterPage } from "@/components/docs/chapter-page";
import { PageNav, type NavItem } from "@/components/docs/page-nav";
import { notFound, redirect } from "next/navigation";
import { ArticleWithVideo } from "./article-with-video";
import { buildAlternates, projectDefaultLocale } from "@/lib/docs-locale";
import { getDocsArticle, getDocsChapter, getDocsProject, type DocsProject } from "@/lib/docs/data";
import { resolveDocsVideoUrls } from "@/lib/docs/videos";

/** Language used for embedded-video fallback when a variant is missing. */
const PROJECT_DEFAULT_LANGUAGE = "en";

type Params = Promise<{ locale: string; projectSlug: string; articleSlug: string }>;

function buildNavList(project: DocsProject, lang: string): NavItem[] {
  const items: NavItem[] = [];
  for (const ch of project.chapters) {
    const title = ch.translations?.[lang]?.title ?? ch.title;
    const description = ch.translations?.[lang]?.description ?? ch.description ?? undefined;
    items.push({ title, description, slug: ch.slug });
    for (const a of ch.articles) {
      if (a.language !== lang) continue;
      items.push({ title: a.title, description: a.description ?? undefined, slug: a.slug });
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

/**
 * What this slug resolves to in this locale. Article wins over chapter; a
 * chapter wins over redirecting to an article variant in another language
 * (chapters are locale-agnostic and render in every locale).
 */
function resolveSlug(project: DocsProject, slug: string, lang: string) {
  const articleLangs = project.articleLocales[slug] ?? [];
  if (articleLangs.includes(lang)) return { kind: "article" as const, articleLangs };
  if (project.chapters.some((ch) => ch.slug === slug)) return { kind: "chapter" as const, articleLangs };
  return { kind: "missing" as const, articleLangs };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, projectSlug, articleSlug } = await params;
  const lang = locale;
  const project = await getDocsProject(projectSlug);
  if (!project) return { title: "Not Found" };

  const target = resolveSlug(project, articleSlug, lang);

  // hreflang: the languages this slug is published in; chapters have no
  // per-language rows, so they fall back to the project's published locales.
  const available = target.articleLangs.length > 0 ? target.articleLangs : project.locales;
  const alternates = available.length
    ? buildAlternates({
        pathWithoutLocale: `/${projectSlug}/${articleSlug}`,
        available,
        currentLocale: locale,
      })
    : undefined;

  if (target.kind === "article") {
    const article = await getDocsArticle(project.id, articleSlug, lang);
    if (article) return { title: `${article.title} | ${project.name}`, alternates };
  }

  const chapter = project.chapters.find((ch) => ch.slug === articleSlug);
  if (chapter) {
    const title = chapter.translations?.[lang]?.title ?? chapter.title;
    return { title: `${title} | ${project.name}`, alternates };
  }

  return { title: "Not Found" };
}

export default async function ArticleOrChapterPage({ params }: { params: Params }) {
  const { locale, projectSlug, articleSlug } = await params;
  const lang = locale;

  const project = await getDocsProject(projectSlug);
  if (!project) notFound();

  const resolvedProjectName = project.translations?.[lang]?.name || project.name;
  const { prev, next } = findPrevNext(buildNavList(project, lang), articleSlug);
  const target = resolveSlug(project, articleSlug, lang);

  if (target.kind === "article") {
    const article = await getDocsArticle(project.id, articleSlug, lang);
    if (article) {
      const { primaryUrl, embeddedUrls } = await resolveDocsVideoUrls({
        contentJson: article.content_json,
        primaryVideoId: article.video_id,
        language: lang,
        projectDefaultLanguage: PROJECT_DEFAULT_LANGUAGE,
      });

      const headings = extractHeadings(article.content_json);

      return (
        <div className="flex gap-8">
          <article className="flex-1 max-w-[720px] mx-auto px-8 py-12 min-w-0">
            <DocsBreadcrumb
              projectName={resolvedProjectName}
              projectSlug={projectSlug}
              locale={locale}
              chapterTitle={article.chapter?.translations?.[lang]?.title ?? article.chapter?.title}
              chapterSlug={article.chapter?.slug}
              articleTitle={article.title}
            />
            <ArticleWithVideo
              title={article.title}
              description={article.description ?? undefined}
              content={article.content_json}
              videoUrl={primaryUrl}
              videoUrls={embeddedUrls}
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
  }

  const chapterSummary = project.chapters.find((ch) => ch.slug === articleSlug);
  const chapter = chapterSummary ? await getDocsChapter(project.id, articleSlug) : null;

  if (!chapter || !chapterSummary) {
    // No article in this locale and no chapter: if this slug is published as an
    // article in another locale, send the reader there (e.g. an English deep-link
    // to a German-only article → `/de/…`); otherwise 404.
    const otherLocales = target.articleLangs.filter((l) => l !== lang);
    if (otherLocales.length > 0) {
      redirect(`/${projectDefaultLocale(otherLocales)}/${projectSlug}/${articleSlug}`);
    }
    notFound();
  }

  const chapterTitle = chapter.translations?.[lang]?.title ?? chapter.title;
  const chapterDescription =
    chapter.translations?.[lang]?.description ?? chapter.description ?? undefined;
  const articles = chapterSummary.articles
    .filter((a) => a.language === lang)
    .map((a) => ({ ...a, description: a.description ?? undefined }));

  const chapterContentJson = chapter.translations?.[lang]?.content_json ?? chapter.content_json;
  const { embeddedUrls: chapterVideoUrls } = await resolveDocsVideoUrls({
    contentJson: chapterContentJson,
    language: lang,
    projectDefaultLanguage: PROJECT_DEFAULT_LANGUAGE,
  });

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
