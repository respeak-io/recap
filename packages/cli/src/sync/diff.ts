import { getArticleLang, type SyncManifest, type ArticleLang } from "./manifest.js";
import type { RemoteProject, RemoteArticle, RemoteArticleSummary } from "./client.js";

export interface DiffInput {
  manifest: SyncManifest;
  remote: RemoteProject;
  /** key `${slug}:${lang}` -> fetched remote article (with content_text) */
  remoteArticles: Map<string, RemoteArticle>;
  /** null when the remote image list could not be fetched (skip media comparison). */
  remoteImages: string[] | null;
  localImages: string[];
  /**
   * key `${slug}:${lang}` -> local `content_text`, rendered with the SAME
   * markdown->Tiptap converter the server uses. A truly-synced article is
   * therefore byte-identical to the remote `content_text`.
   */
  localTexts: Map<string, string>;
  /** key `${slug}:${lang}` -> repo-relative markdown file (for verbose output) */
  localFiles: Map<string, string>;
}

/** A per-article content difference, carrying both rendered texts for `--verbose`. */
export interface ContentDiff {
  slug: string;
  lang: string;
  file: string;
  local: string;
  remote: string;
}

export interface DiffReport {
  diffs: string[];
  info: string[];
  contentDiffs: ContentDiff[];
}

/**
 * Mirror server-side keyword normalization (strip leading `#`, trim, lowercase,
 * dedupe, drop empty) so keyword comparisons don't report cosmetic differences.
 * Reimplemented here because the standalone CLI cannot import the app's
 * `@/lib/keywords` at publish time.
 */
export function normalizeKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const n = raw.replace(/^#+/, "").trim().toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Compute the structural, metadata, content and media differences between the
 * local manifest and the remote project, without mutating anything. Pure: it
 * takes already-fetched remote data, so it is easy to unit-test. Mirrors the
 * reference `compare_with_remote.py`.
 */
export function computeDiff(input: DiffInput): DiffReport {
  const { manifest, remote, remoteArticles, remoteImages, localImages, localTexts, localFiles } =
    input;
  const diffs: string[] = [];
  const info: string[] = [];
  const contentDiffs: ContentDiff[] = [];
  const languages = manifest.languages;

  // --- Project metadata ---
  if ((manifest.name ?? "") !== (remote.name ?? "")) {
    diffs.push(`Project name: remote=${q(remote.name)}, local=${q(manifest.name)}`);
  }
  if ((manifest.subtitle ?? "") !== (remote.subtitle ?? "")) {
    diffs.push(`Project subtitle: remote=${q(remote.subtitle)}, local=${q(manifest.subtitle)}`);
  }

  // `?? {}` guards against an explicit null (e.g. a freshly-created project
  // whose `translations` field is null rather than absent).
  const localT = manifest.translations ?? {};
  const remoteT = remote.translations ?? {};
  for (const lang of union(Object.keys(localT), Object.keys(remoteT))) {
    for (const field of ["name", "subtitle"] as const) {
      const lv = localT[lang]?.[field] ?? "";
      const rv = remoteT[lang]?.[field] ?? "";
      if (lv !== rv) {
        diffs.push(`Project translations.${lang}.${field}: remote=${q(rv)}, local=${q(lv)}`);
      }
    }
  }

  // --- Chapters ---
  const remoteChapters = new Map(remote.chapters.map((c) => [c.slug, c]));
  const localChapters = new Map(manifest.chapters.map((c) => [c.slug, c]));

  for (const slug of sorted(localChapters.keys())) {
    if (!remoteChapters.has(slug)) diffs.push(`Chapter '${slug}' — missing on remote`);
  }
  for (const slug of sorted(remoteChapters.keys())) {
    if (!localChapters.has(slug)) {
      diffs.push(`Chapter '${slug}' — exists on remote but not in sync.json`);
    }
  }

  const commonChapters = sorted(localChapters.keys()).filter((s) => remoteChapters.has(s));
  for (const slug of commonChapters) {
    const lc = localChapters.get(slug)!;
    const rc = remoteChapters.get(slug)!;

    if ((lc.title ?? "") !== (rc.title ?? "")) {
      diffs.push(`Chapter '${slug}' title: remote=${q(rc.title)}, local=${q(lc.title)}`);
    }
    if ((lc.description ?? "") !== (rc.description ?? "")) {
      diffs.push(`Chapter '${slug}' description: remote=${q(rc.description)}, local=${q(lc.description)}`);
    }
    if ((lc.group ?? "") !== (rc.group ?? "")) {
      diffs.push(`Chapter '${slug}' group: remote=${q(rc.group)}, local=${q(lc.group)}`);
    }
    const lk = normalizeKeywords(lc.keywords);
    const rk = normalizeKeywords(rc.keywords);
    if (!arrEq(lk, rk)) diffs.push(`Chapter '${slug}' keywords: remote=${arr(rk)}, local=${arr(lk)}`);

    const lt = lc.translations ?? {};
    const rt = rc.translations ?? {};
    for (const lang of union(Object.keys(lt), Object.keys(rt))) {
      for (const field of ["title", "group", "description"] as const) {
        const lv = lt[lang]?.[field] ?? "";
        const rv = rt[lang]?.[field] ?? "";
        if (lv !== rv) {
          diffs.push(`Chapter '${slug}' translations.${lang}.${field}: remote=${q(rv)}, local=${q(lv)}`);
        }
      }
    }

    // Articles (structural + metadata).
    const remoteArts = new Map<string, RemoteArticleSummary>();
    for (const a of rc.articles) remoteArts.set(`${a.slug}:${a.language}`, a);
    const localArts = new Map<string, ArticleLang>();
    for (const article of lc.articles) {
      for (const lang of languages) {
        const got = getArticleLang(article, lang);
        if (got && got.ok) localArts.set(`${article.slug}:${lang}`, got.value);
      }
    }

    for (const key of sorted(localArts.keys())) {
      const { slug: aSlug, lang } = splitKey(key);
      const ra = remoteArts.get(key);
      if (!ra) {
        diffs.push(`Article '${aSlug}' (${lang}) — missing on remote`);
        continue;
      }
      const la = localArts.get(key)!;
      if ((la.title ?? "") !== (ra.title ?? "")) {
        diffs.push(`Article '${aSlug}' (${lang}) title: remote=${q(ra.title)}, local=${q(la.title)}`);
      }
      if ((la.description ?? "") !== (ra.description ?? "")) {
        diffs.push(`Article '${aSlug}' (${lang}) description: remote=${q(ra.description)}, local=${q(la.description)}`);
      }
      const lkw = normalizeKeywords(la.keywords);
      const rkw = normalizeKeywords(ra.keywords);
      if (!arrEq(lkw, rkw)) {
        diffs.push(`Article '${aSlug}' (${lang}) keywords: remote=${arr(rkw)}, local=${arr(lkw)}`);
      }
    }
    for (const key of sorted(remoteArts.keys())) {
      if (!localArts.has(key)) {
        const { slug: aSlug, lang } = splitKey(key);
        diffs.push(`Article '${aSlug}' (${lang}) — on remote but not in sync.json`);
      }
    }
  }

  // --- Content ---
  // `localTexts` is rendered through the same converter the server uses, so a
  // synced article is byte-identical to the remote `content_text`. Any
  // remaining difference is a genuine content change (not formatting noise),
  // which is why this is a plain equality check rather than a fuzzy overlap.
  let matches = 0;
  let differing = 0;
  let skipped = 0;
  for (const slug of commonChapters) {
    const lc = localChapters.get(slug)!;
    const remoteArtKeys = new Set(
      remoteChapters.get(slug)!.articles.map((a) => `${a.slug}:${a.language}`),
    );
    for (const article of lc.articles) {
      for (const lang of languages) {
        const got = getArticleLang(article, lang);
        if (!got || !got.ok) continue;
        const key = `${article.slug}:${lang}`;
        // Skip articles missing on remote — already reported structurally.
        if (!remoteArtKeys.has(key)) continue;
        const localText = localTexts.get(key);
        if (localText === undefined) continue;
        const ra = remoteArticles.get(key);
        if (!ra || ra.content_text === undefined) {
          info.push(`Article '${article.slug}' (${lang}) — could not fetch content`);
          skipped++;
          continue;
        }
        const remoteNorm = collapse(ra.content_text);
        const localNorm = collapse(localText);
        if (remoteNorm === localNorm) {
          matches++;
          continue;
        }
        differing++;
        const file = localFiles.get(key) ?? "";
        diffs.push(
          `Article '${article.slug}' (${lang}) content differs${file ? `  [${file}]` : ""}`,
        );
        contentDiffs.push({ slug: article.slug, lang, file, local: localNorm, remote: remoteNorm });
      }
    }
  }
  let summary = `Content: ${matches} match, ${differing} differ`;
  if (skipped) summary += `, ${skipped} skipped`;
  info.push(summary);

  // --- Media ---
  if (remoteImages === null) {
    // Couldn't list remote images — skip rather than report false drift.
    info.push("Media comparison skipped (could not list remote images)");
  } else {
    const remoteSet = new Set(remoteImages);
    const localSet = new Set(localImages);
    for (const f of sorted(localSet).filter((x) => !remoteSet.has(x))) {
      diffs.push(`Image '${f}' — local but not on remote`);
    }
    for (const f of sorted(remoteSet).filter((x) => !localSet.has(x))) {
      info.push(`Image '${f}' — on remote but not in local media/`);
    }
  }

  return { diffs, info, contentDiffs };
}

// --- helpers ---

function q(v: unknown): string {
  return JSON.stringify(v ?? "");
}

function arr(a: string[]): string {
  return JSON.stringify(a);
}

function arrEq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function union(a: string[], b: string[]): string[] {
  return sorted(new Set([...a, ...b]));
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

function splitKey(key: string): { slug: string; lang: string } {
  const idx = key.lastIndexOf(":");
  return { slug: key.slice(0, idx), lang: key.slice(idx + 1) };
}
