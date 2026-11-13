import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { isLocale } from "@/lib/docs-locale";
import { DOCS_CACHE_TAG, DOCS_REVALIDATE_SECONDS } from "./cache";

/**
 * Cached data layer for the public docs site.
 *
 * Every query here runs as the anonymous role (no cookies), so the results are
 * identical for every visitor and can be shared through the Next.js data cache.
 * Entries are tagged with {@link DOCS_CACHE_TAG} and purged by `revalidateDocs()`
 * on every write path; each function is additionally wrapped in React `cache()`
 * so the layout, page and `generateMetadata` share one lookup per request.
 *
 * Errors are thrown (never returned as `null`) so a transient database failure
 * is not cached as "project does not exist".
 */

type Translations<T> = Record<string, T> | null;

export interface DocsArticleSummary {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  language: string;
  order: number;
}

export interface DocsChapterSummary {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  order: number;
  group: string | null;
  /** Per-locale title/description/group only; translated chapter bodies are left out. */
  translations: Translations<{ title?: string; description?: string; group?: string }>;
  /** Published articles in this chapter, all languages, sorted by `order`. */
  articles: DocsArticleSummary[];
}

export interface DocsProject {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  translations: Translations<{ name?: string; subtitle?: string }>;
  theme: Record<string, unknown> | null;
  /** Chapters sorted by `order`. */
  chapters: DocsChapterSummary[];
  /** Locales with at least one published article (including chapterless ones). */
  locales: string[];
  /** Published `slug -> locales[]` for every article, used for hreflang and locale redirects. */
  articleLocales: Record<string, string[]>;
}

export interface DocsArticle {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  language: string;
  video_id: string | null;
  content_json: Record<string, unknown>;
  chapter: {
    title: string;
    slug: string;
    translations: Translations<{ title?: string }>;
  } | null;
}

export interface DocsChapter {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  content_json: Record<string, unknown> | null;
  translations: Translations<{
    title?: string;
    description?: string;
    content_json?: Record<string, unknown>;
  }>;
}

const cacheOptions = {
  tags: [DOCS_CACHE_TAG],
  revalidate: DOCS_REVALIDATE_SECONDS,
};

function byOrder<T extends { order: number }>(a: T, b: T) {
  return a.order - b.order;
}

function pickChapterLabels(
  translations: unknown,
): DocsChapterSummary["translations"] {
  if (!translations || typeof translations !== "object") return null;
  const out: NonNullable<DocsChapterSummary["translations"]> = {};
  for (const [lang, value] of Object.entries(translations as Record<string, Record<string, unknown>>)) {
    if (!value || typeof value !== "object") continue;
    out[lang] = {
      title: value.title as string | undefined,
      description: value.description as string | undefined,
      group: value.group as string | undefined,
    };
  }
  return out;
}

const fetchDocsProject = unstable_cache(
  async (slug: string): Promise<DocsProject | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("projects")
      .select(
        'id, name, slug, subtitle, translations, theme, ' +
          'chapters(id, title, slug, description, order, "group", translations, ' +
          'articles(id, title, description, slug, language, status, "order")), ' +
          "all_articles:articles(slug, language, status)",
      )
      .eq("slug", slug)
      .eq("is_public", true)
      // Slugs are unique per org only (`unique (org_id, slug)`), and docs URLs
      // carry no org. If two orgs publish the same slug, the oldest project keeps
      // the URL instead of the lookup erroring.
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`docs project lookup failed: ${error.message}`);
    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    const chapters: DocsChapterSummary[] = ((row.chapters ?? []) as Record<string, unknown>[])
      .map((ch) => ({
        id: ch.id as string,
        title: ch.title as string,
        slug: ch.slug as string,
        description: (ch.description as string | null) ?? null,
        order: ch.order as number,
        group: (ch.group as string | null) ?? null,
        translations: pickChapterLabels(ch.translations),
        articles: ((ch.articles ?? []) as (DocsArticleSummary & { status: string })[])
          .filter((a) => a.status === "published")
          .map(({ id, title, description, slug, language, order }) => ({
            id,
            title,
            description: description ?? null,
            slug,
            language,
            order,
          }))
          .sort(byOrder),
      }))
      .sort(byOrder);

    const articleLocales: Record<string, string[]> = {};
    const locales = new Set<string>();
    for (const a of (row.all_articles ?? []) as { slug: string; language: string; status: string }[]) {
      if (a.status !== "published" || !isLocale(a.language)) continue;
      locales.add(a.language);
      const list = (articleLocales[a.slug] ??= []);
      if (!list.includes(a.language)) list.push(a.language);
    }

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      subtitle: row.subtitle ?? null,
      translations: row.translations ?? null,
      theme: row.theme ?? null,
      chapters,
      locales: [...locales],
      articleLocales,
    };
  },
  ["docs-project"],
  cacheOptions,
);

const fetchDocsArticle = unstable_cache(
  async (projectId: string, slug: string, language: string): Promise<DocsArticle | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("articles")
      .select("id, title, description, slug, language, video_id, content_json, chapters(title, slug, translations)")
      .eq("project_id", projectId)
      .eq("slug", slug)
      .eq("language", language)
      .eq("status", "published")
      .maybeSingle();

    if (error) throw new Error(`docs article lookup failed: ${error.message}`);
    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    const ch = row.chapters as { title: string; slug: string; translations: unknown } | null;
    const labels = pickChapterLabels(ch?.translations);
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      slug: row.slug,
      language: row.language,
      video_id: row.video_id ?? null,
      content_json: row.content_json ?? { type: "doc", content: [] },
      chapter: ch
        ? {
            title: ch.title,
            slug: ch.slug,
            translations: labels
              ? Object.fromEntries(Object.entries(labels).map(([l, v]) => [l, { title: v.title }]))
              : null,
          }
        : null,
    };
  },
  ["docs-article"],
  cacheOptions,
);

const fetchDocsChapter = unstable_cache(
  async (projectId: string, slug: string): Promise<DocsChapter | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("chapters")
      .select("id, title, slug, description, content_json, translations")
      .eq("project_id", projectId)
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw new Error(`docs chapter lookup failed: ${error.message}`);
    return (data as DocsChapter | null) ?? null;
  },
  ["docs-chapter"],
  cacheOptions,
);

/** Public project with its navigation tree (published articles only). */
export const getDocsProject = cache((slug: string) => fetchDocsProject(slug));

/** A published article in one language, or `null`. */
export const getDocsArticle = cache((projectId: string, slug: string, language: string) =>
  fetchDocsArticle(projectId, slug, language),
);

/** A chapter page (locale-agnostic; translations carry per-locale bodies), or `null`. */
export const getDocsChapter = cache((projectId: string, slug: string) =>
  fetchDocsChapter(projectId, slug),
);
