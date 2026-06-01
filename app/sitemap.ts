import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, isLocale, localizeDocsPath } from "@/lib/docs-locale";

// Public docs content changes via the sync API without a redeploy, so the
// sitemap is generated per-request rather than baked at build time.
export const dynamic = "force-dynamic";

interface SitemapArticle {
  slug: string;
  language: string;
  status: string;
}
interface SitemapChapter {
  slug: string;
  articles: SitemapArticle[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("slug, chapters(slug, articles(slug, language, status))")
    .eq("is_public", true);

  const entries: MetadataRoute.Sitemap = [];

  for (const project of projects ?? []) {
    const chapters = (project.chapters ?? []) as SitemapChapter[];
    const allArticles = chapters.flatMap((c) => c.articles ?? []);
    const available = [
      ...new Set(
        allArticles.filter((a) => a.status === "published").map((a) => a.language),
      ),
    ].filter(isLocale);
    if (available.length === 0) continue;

    // Emit one <url> per (page, locale), each carrying the full hreflang alternate
    // set so search engines route readers to the right language variant.
    const addPage = (pathWithoutLocale: string, locales: string[]) => {
      const languages: Record<string, string> = {};
      for (const l of locales) {
        languages[l] = `${site}${localizeDocsPath(l, pathWithoutLocale)}`;
      }
      for (const l of locales) {
        entries.push({
          url: `${site}${localizeDocsPath(l, pathWithoutLocale)}`,
          alternates: { languages },
        });
      }
    };

    // Project index — available in every published locale.
    addPage(`/${project.slug}`, available);

    // Chapters render in every locale (via translation fallback).
    for (const ch of chapters) {
      addPage(`/${project.slug}/${ch.slug}`, available);
    }

    // Articles — only the locales the article is actually published in.
    const localesBySlug = new Map<string, Set<string>>();
    for (const a of allArticles) {
      if (a.status !== "published" || !isLocale(a.language)) continue;
      const set = localesBySlug.get(a.slug) ?? new Set<string>();
      set.add(a.language);
      localesBySlug.set(a.slug, set);
    }
    for (const [slug, locs] of localesBySlug) {
      addPage(`/${project.slug}/${slug}`, [...locs]);
    }
  }

  return entries;
}
