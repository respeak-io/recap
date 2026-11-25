import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_LANGUAGE, getArticleLang, type SyncManifest } from "./manifest.js";
import { processMarkdown } from "./markdown.js";
import type { LinkMap } from "./links.js";

export interface SyncArticlePayload {
  slug: string;
  title: string;
  content: string;
  language: string;
  status: string;
  /** Position within the chapter in the full manifest, all languages counted. */
  order: number;
  description?: string;
  keywords?: string[];
}

export interface SyncChapterPayload {
  slug: string;
  title: string;
  description: string;
  group: string;
  /** Position in the full manifest. */
  order: number;
  content?: string;
  keywords?: string[];
  translations: Record<string, { title?: string; group?: string; description?: string; content?: string }>;
  articles: SyncArticlePayload[];
}

export interface SyncPayload {
  name?: string;
  subtitle?: string;
  translations?: Record<string, { name?: string; subtitle?: string }>;
  /**
   * When false, the server skips its deletion passes — chapters/articles absent
   * from this payload are preserved instead of pruned. Omitted (or true) keeps
   * the default full-mirror behavior.
   */
  prune?: boolean;
  chapters: SyncChapterPayload[];
}

/** Chapters in sidebar order: the manifest's `order`, then array position. */
export function sortChapters(manifest: SyncManifest) {
  return [...manifest.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Sort positions as a full push of `manifest` would assign them: chapters by
 * slug, articles by `chapter/article/language`.
 */
function manifestPositions(manifest: SyncManifest) {
  const chapters = new Map<string, number>();
  const articles = new Map<string, number>();
  sortChapters(manifest).forEach((chapter, ci) => {
    chapters.set(chapter.slug, ci);
    let position = 0;
    for (const article of chapter.articles) {
      for (const lang of manifest.languages) {
        if (!getArticleLang(article, lang)?.ok) continue;
        articles.set(`${chapter.slug}/${article.slug}/${lang}`, position++);
      }
    }
  });
  return { chapters, articles };
}

/**
 * Build the declarative sync payload from the manifest. Chapters are sorted by
 * `order`; the default-language chapter `_index` becomes the top-level
 * `content` (persisted inline by the fixed `/sync` endpoint), other languages
 * become `translations.<lang>.content`. Articles are emitted one entry per
 * language, published. All markdown is H1-stripped, cross-link-rewritten and
 * media-swapped via `processMarkdown`.
 *
 * A scoped push passes the narrowed manifest plus `fullManifest`, so every item
 * carries its position in the whole project instead of in the selection.
 */
export async function buildPayload(
  manifest: SyncManifest,
  docsDir: string,
  imageUrls: Record<string, string>,
  linkMap: LinkMap,
  onWarn?: (message: string) => void,
  fullManifest: SyncManifest = manifest,
): Promise<SyncPayload> {
  const read = async (relPath: string): Promise<string> => {
    const raw = await readFile(path.join(docsDir, relPath), "utf-8");
    return processMarkdown(raw, relPath, linkMap, manifest.project_slug, imageUrls, onWarn);
  };

  const payload: SyncPayload = { chapters: [] };
  if (manifest.name !== undefined) payload.name = manifest.name;
  if (manifest.subtitle !== undefined) payload.subtitle = manifest.subtitle;
  if (manifest.translations !== undefined) payload.translations = manifest.translations;

  const positions = manifestPositions(fullManifest);

  for (const chapter of sortChapters(manifest)) {
    const ch: SyncChapterPayload = {
      slug: chapter.slug,
      title: chapter.title,
      description: chapter.description ?? "",
      group: chapter.group ?? "",
      order: positions.chapters.get(chapter.slug)!,
      translations: { ...(chapter.translations ?? {}) },
      articles: [],
    };
    if (chapter.keywords !== undefined) ch.keywords = chapter.keywords;

    // Chapter content: default language inline, others via translations.
    for (const [lang, relPath] of Object.entries(chapter.content ?? {})) {
      const processed = await read(relPath);
      if (!processed) continue;
      if (lang === DEFAULT_LANGUAGE) {
        ch.content = processed;
      } else {
        ch.translations[lang] = { ...(ch.translations[lang] ?? {}), content: processed };
      }
    }

    // Articles: one entry per language variant.
    for (const article of chapter.articles) {
      for (const lang of manifest.languages) {
        const got = getArticleLang(article, lang);
        if (!got || !got.ok) continue;
        const entry = got.value;
        const art: SyncArticlePayload = {
          slug: article.slug,
          title: entry.title,
          content: await read(entry.file),
          language: lang,
          status: "published",
          order: positions.articles.get(`${chapter.slug}/${article.slug}/${lang}`)!,
        };
        if (entry.description) art.description = entry.description;
        if (entry.keywords !== undefined) art.keywords = entry.keywords;
        ch.articles.push(art);
      }
    }

    payload.chapters.push(ch);
  }

  return payload;
}
