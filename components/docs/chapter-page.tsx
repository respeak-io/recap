import Link from "next/link";
import { DocsBreadcrumb } from "./docs-breadcrumb";
import { ArticleRenderer } from "./article-renderer";
import { PageNav, type NavItem } from "./page-nav";

interface ChapterPageProps {
  projectName: string;
  projectSlug: string;
  chapterTitle: string;
  chapterDescription?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contentJson?: any;
  articles: { id: string; title: string; description?: string; slug: string }[];
  prev?: NavItem | null;
  next?: NavItem | null;
  lang: string;
}

function hasContent(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const doc = json as { content?: unknown[] };
  return Array.isArray(doc.content) && doc.content.length > 0;
}

export function ChapterPage({
  projectName,
  projectSlug,
  chapterTitle,
  chapterDescription,
  contentJson,
  articles,
  prev,
  next,
  lang,
}: ChapterPageProps) {
  const qs = lang !== "en" ? `?lang=${lang}` : "";

  return (
    <div className="flex-1 max-w-[720px] mx-auto px-8 py-12 min-w-0">
      <DocsBreadcrumb
        projectName={projectName}
        projectSlug={projectSlug}
        chapterTitle={chapterTitle}
      />
      <h1 className="text-3xl font-bold mt-4 mb-2">{chapterTitle}</h1>
      {chapterDescription && (
        <p className="text-lg text-muted-foreground mb-6">{chapterDescription}</p>
      )}
      {!chapterDescription && <div className="mb-6" />}
      {hasContent(contentJson) && (
        <div className="mb-8">
          <ArticleRenderer content={contentJson} />
        </div>
      )}
      {articles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/${projectSlug}/${article.slug}${qs}`}
              className="group rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50"
            >
              <p className="font-medium text-card-foreground group-hover:text-accent-foreground">
                {article.title}
              </p>
              {article.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  {article.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No articles in this chapter yet.</p>
      )}
      <PageNav prev={prev} next={next} projectSlug={projectSlug} lang={lang} />
    </div>
  );
}
