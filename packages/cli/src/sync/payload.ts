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
  description?: string;
  keywords?: string[];
}

export interface SyncChapterPayload {
  slug: string;
  title: string;
  description: string;
  group: string;
  content?: string;
  keywords?: string[];
  translations: Record<string, { title?: string; group?: string; description?: string; content?: string }>;
  articles: SyncArticlePayload[];
}

export interface SyncPayload {
  name?: string;
  subtitle?: string;
  translations?: Record<string, { name?: string; subtitle?: string }>;
  chapters: SyncChapterPayload[];
}

/**
 * Build the declarative sync payload from the manifest. Chapters are sorted by
 * `order`; the default-language chapter `_index` becomes the top-level
 * `content` (persisted inline by the fixed `/sync` endpoint), other languages
 * become `translations.<lang>.content`. Articles are emitted one entry per
 * language, published. All markdown is H1-stripped, cross-link-rewritten and
 * media-swapped via `processMarkdown`.
 */
export async function buildPayload(
  manifest: SyncManifest,
  docsDir: string,
  imageUrls: Record<string, string>,
  linkMap: LinkMap,
  onWarn?: (message: string) => void,
): Promise<SyncPayload> {
  const read = async (relPath: string): Promise<string> => {
    const raw = await readFile(path.join(docsDir, relPath), "utf-8");
    return processMarkdown(raw, relPath, linkMap, manifest.project_slug, imageUrls, onWarn);
  };

  const payload: SyncPayload = { chapters: [] };
  if (manifest.name !== undefined) payload.name = manifest.name;
  if (manifest.subtitle !== undefined) payload.subtitle = manifest.subtitle;
  if (manifest.translations !== undefined) payload.translations = manifest.translations;

  const chapters = [...manifest.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const chapter of chapters) {
    const ch: SyncChapterPayload = {
      slug: chapter.slug,
      title: chapter.title,
      description: chapter.description ?? "",
      group: chapter.group ?? "",
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
