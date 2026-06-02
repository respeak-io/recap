import type { SyncManifest, Chapter } from "./manifest.js";

/**
 * Parsed `--only` selectors, split into whole-chapter and single-article
 * buckets. Grammar: a bare `chapter-slug` selects the whole chapter; a
 * `chapter-slug/article-slug` selects one article within it. Leading/trailing
 * slashes and surrounding whitespace are tolerated; empty selectors are dropped.
 */
export interface Selection {
  /** Whole-chapter selectors — every article in the chapter. */
  chapters: string[];
  /** Single-article selectors. */
  articles: { chapter: string; article: string }[];
}

/** Split raw `--only` selectors into chapter-level and article-level buckets. */
export function parseSelectors(selectors: string[]): Selection {
  const chapters: string[] = [];
  const articles: { chapter: string; article: string }[] = [];
  for (const raw of selectors) {
    const sel = raw.trim().replace(/^\/+|\/+$/g, "");
    if (!sel) continue;
    const slash = sel.indexOf("/");
    if (slash === -1) {
      chapters.push(sel);
    } else {
      articles.push({ chapter: sel.slice(0, slash), article: sel.slice(slash + 1) });
    }
  }
  return { chapters, articles };
}

/**
 * Narrow a manifest to the chapters/articles named by `--only` selectors.
 * Surviving chapters keep all their chapter-level fields (title, content,
 * keywords, translations) so a scoped push still nests its article under an
 * up-to-date chapter shell. Throws when any selector matches nothing in the
 * manifest, so a typo fails loudly instead of silently pushing zero items.
 */
export function selectManifest(manifest: SyncManifest, selectors: string[]): SyncManifest {
  const { chapters: wholeList, articles } = parseSelectors(selectors);
  const whole = new Set(wholeList);
  const wantByChapter = new Map<string, Set<string>>();
  for (const { chapter, article } of articles) {
    let set = wantByChapter.get(chapter);
    if (!set) {
      set = new Set();
      wantByChapter.set(chapter, set);
    }
    set.add(article);
  }

  const matchedChapters = new Set<string>();
  const matchedArticles = new Set<string>();
  const out: Chapter[] = [];

  for (const chapter of manifest.chapters) {
    const isWhole = whole.has(chapter.slug);
    const wantArts = wantByChapter.get(chapter.slug);
    if (!isWhole && !wantArts) continue;
    matchedChapters.add(chapter.slug);

    if (isWhole) {
      out.push(chapter);
      // A whole-chapter selection also satisfies any article selectors for it.
      if (wantArts) for (const a of wantArts) matchedArticles.add(`${chapter.slug}/${a}`);
      continue;
    }

    const kept = chapter.articles.filter((a) => wantArts!.has(a.slug));
    for (const a of kept) matchedArticles.add(`${chapter.slug}/${a.slug}`);
    out.push({ ...chapter, articles: kept });
  }

  const unmatched: string[] = [];
  for (const ch of whole) if (!matchedChapters.has(ch)) unmatched.push(ch);
  for (const { chapter, article } of articles) {
    if (!matchedArticles.has(`${chapter}/${article}`)) unmatched.push(`${chapter}/${article}`);
  }
  if (unmatched.length > 0) {
    throw new Error(`--only matched nothing in sync.json for: ${unmatched.join(", ")}`);
  }

  return { ...manifest, chapters: out };
}
