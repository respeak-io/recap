import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  loadManifest,
  validateManifest,
  getArticleLang,
  type SyncManifest,
} from "./manifest.js";
import { selectManifest, parseSelectors } from "./select.js";
import { buildLinkMap } from "./links.js";
import { processMarkdown } from "./markdown.js";
import { markdownToTiptapRaw } from "../markdown/markdown-to-tiptap.js";
import { buildPayload } from "./payload.js";
import { computeDiff, type DiffReport } from "./diff.js";
import { imageDimensions } from "./image-dimensions.js";
import {
  RecapClient,
  type RecapImage,
  type RemoteArticle,
  type SyncStats,
} from "./client.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

export interface SyncOptions {
  docsDir: string;
  url: string;
  apiKey: string;
  /**
   * Restrict the push to these chapter (`slug`) or article (`chapter/article`)
   * selectors. A scoped push is always additive — the unsent chapters/articles
   * are never pruned. Ignored by `diff`.
   */
  only?: string[];
  /**
   * Set false to push additively without `--only`: upsert everything local but
   * never delete remote items absent from the manifest. Defaults to a full
   * mirror. Ignored by `diff`.
   */
  prune?: boolean;
  onProgress?: (message: string) => void;
  onWarn?: (message: string) => void;
}

/**
 * Media tally for the push summary line. `deleted` counts remote images removed
 * because they are no longer in local `media/` (full mirror pushes only).
 */
export interface MediaStats {
  uploaded: number;
  reused: number;
  deleted: number;
}

export interface PushResult {
  stats: SyncStats;
  media: MediaStats;
  warnings: string[];
}

export interface DiffResult {
  report: DiffReport;
  warnings: string[];
}

/** Push the docs folder to its project: validate, upload media, then sync. */
export async function push(options: SyncOptions): Promise<PushResult> {
  const warnings: string[] = [];
  const onWarn = options.onWarn ?? ((m: string) => warnings.push(m));
  const onProgress = options.onProgress ?? (() => {});

  const manifest = await loadAndValidate(options.docsDir, onProgress, onWarn);
  const client = new RecapClient({ baseUrl: options.url, apiKey: options.apiKey });

  const {
    urls: imageUrls,
    media,
    remote: remoteImages,
    localFiles: localMedia,
  } = await syncMedia(manifest, client, options.docsDir, onProgress);

  onProgress("Building sync payload...");
  // Cross-links must resolve against the WHOLE doc set even on a scoped push, so
  // build the link map from the full manifest, then narrow what we actually send.
  const linkMap = buildLinkMap(manifest);
  const scoped = options.only?.length ? selectManifest(manifest, options.only) : manifest;
  const payload = await buildPayload(scoped, options.docsDir, imageUrls, linkMap, onWarn);

  // `--only` is inherently additive (a scoped push must never delete the rest);
  // `prune: false` opts a full push out of deletions too. Default stays a mirror.
  payload.prune = options.prune !== false && !options.only?.length;

  onProgress("Syncing documentation...");
  const stats = await client.sync(scoped.project_slug, payload);

  // Clean up after ourselves: a full mirror push also removes remote images that
  // are gone from local `media/`. Runs only after the sync succeeded, never on
  // additive pushes, and never when there is no local `media/` folder at all
  // (that folder simply doesn't manage media). An image whose URL still appears
  // anywhere in the pushed content is kept, as a safety net.
  if (payload.prune && remoteImages) {
    media.deleted = await pruneMedia(
      client,
      scoped.project_slug,
      remoteImages,
      localMedia,
      JSON.stringify(payload),
      onProgress,
      onWarn,
    );
  }

  return { stats, media, warnings };
}

/** Preview differences without mutating anything (`push --dry-run`). */
export async function diff(options: SyncOptions): Promise<DiffResult> {
  const warnings: string[] = [];
  const onWarn = options.onWarn ?? ((m: string) => warnings.push(m));
  const onProgress = options.onProgress ?? (() => {});

  const manifest = await loadAndValidate(options.docsDir, onProgress, onWarn);
  const client = new RecapClient({ baseUrl: options.url, apiKey: options.apiKey });
  // Rewriting cross-links during diff also surfaces unresolved `.md` links via
  // onWarn — the same check push does — so broken links are caught read-only.
  const linkMap = buildLinkMap(manifest);

  onProgress("Fetching remote project...");
  let remote;
  try {
    remote = await client.getProject(manifest.project_slug);
  } catch (err) {
    throw new Error(
      `Could not fetch remote project '${manifest.project_slug}': ${(err as Error).message}`,
    );
  }

  const remoteChapterSlugs = new Set(remote.chapters.map((c) => c.slug));
  const remoteArtKeysByChapter = new Map(
    remote.chapters.map((c) => [c.slug, new Set(c.articles.map((a) => `${a.slug}:${a.language}`))]),
  );

  const remoteArticles = new Map<string, RemoteArticle>();
  const localTexts = new Map<string, string>();
  const localFiles = new Map<string, string>();

  onProgress("Checking article content...");
  for (const chapter of manifest.chapters) {
    const remoteKeys = remoteArtKeysByChapter.get(chapter.slug);
    for (const article of chapter.articles) {
      for (const lang of manifest.languages) {
        const got = getArticleLang(article, lang);
        if (!got || !got.ok) continue;
        const key = `${article.slug}:${lang}`;
        const raw = await readFile(path.join(options.docsDir, got.value.file), "utf-8");
        // Render local content_text through the SAME pipeline as push/server:
        // process the markdown (strip H1, rewrite cross-links, swap media), then
        // run the shared markdown->Tiptap converter and take its plain text. A
        // truly-synced article is byte-identical to the remote content_text.
        const processed = processMarkdown(
          raw,
          got.value.file,
          linkMap,
          manifest.project_slug,
          {},
          onWarn,
        );
        localTexts.set(key, markdownToTiptapRaw(processed).text);
        localFiles.set(key, got.value.file);
        // Only fetch remote content for articles that exist on both sides.
        if (!remoteChapterSlugs.has(chapter.slug) || !remoteKeys?.has(key)) continue;
        const ra = await fetchArticleWithRetry(client, manifest.project_slug, article.slug, lang, onWarn);
        if (ra) remoteArticles.set(key, ra);
      }
    }
  }

  // Skip media comparison (rather than report false drift) if the list fails.
  let remoteImages: string[] | null;
  try {
    const list = await client.listImages(manifest.project_slug);
    remoteImages = list.images.map((i) => i.filename);
  } catch {
    remoteImages = null;
  }
  const localImages = await listLocalImages(options.docsDir);

  const report = computeDiff({
    manifest,
    remote,
    remoteArticles,
    remoteImages,
    localImages,
    localTexts,
    localFiles,
  });

  return { report, warnings };
}

export interface RemoveOptions {
  docsDir: string;
  url: string;
  apiKey: string;
  /** Chapter (`slug`) or article (`chapter/article`) selectors to delete. */
  selectors: string[];
  onProgress?: (message: string) => void;
}

export interface RemoveResult {
  /** Deleted whole-chapter slugs (articles cascade server-side). */
  chapters: string[];
  /** Deleted article selectors (`chapter/article`). */
  articles: string[];
}

/**
 * Delete chapters/articles from the remote project by slug selector — the
 * additive counterpart to a scoped `push`. Only `sync.json`'s `project_slug` is
 * read from the docs folder; the targets need not exist locally (you typically
 * run this after removing files). Whole-chapter deletes cascade to their
 * articles; article deletes remove every language sharing that slug.
 */
export async function remove(options: RemoveOptions): Promise<RemoveResult> {
  const manifest = await loadManifest(options.docsDir);
  const client = new RecapClient({ baseUrl: options.url, apiKey: options.apiKey });
  const onProgress = options.onProgress ?? (() => {});
  const { chapters, articles } = parseSelectors(options.selectors);

  const result: RemoveResult = { chapters: [], articles: [] };
  for (const ch of chapters) {
    onProgress(`Deleting chapter '${ch}'...`);
    await client.deleteChapter(manifest.project_slug, ch);
    result.chapters.push(ch);
  }
  for (const { chapter, article } of articles) {
    onProgress(`Deleting article '${chapter}/${article}'...`);
    await client.deleteArticle(manifest.project_slug, article);
    result.articles.push(`${chapter}/${article}`);
  }
  return result;
}

// --- internals ---

/**
 * Fetch one article for the content comparison. Transient failures (network,
 * 5xx, 429) get one retry; if that also fails the reason is surfaced as a
 * warning instead of being swallowed, and the article shows as "could not
 * fetch content" in the report.
 */
async function fetchArticleWithRetry(
  client: RecapClient,
  projectSlug: string,
  articleSlug: string,
  lang: string,
  onWarn: (message: string) => void,
): Promise<RemoteArticle | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await client.getArticle(projectSlug, articleSlug, lang);
    } catch (err) {
      lastError = err;
    }
  }
  onWarn(
    `Could not fetch remote article '${articleSlug}' (${lang}): ${(lastError as Error)?.message ?? lastError}`,
  );
  return null;
}

async function loadAndValidate(
  docsDir: string,
  onProgress: (message: string) => void,
  onWarn: (message: string) => void,
): Promise<SyncManifest> {
  const manifest = await loadManifest(docsDir);
  onProgress("Validating sync.json...");
  const report = validateManifest(manifest, docsDir);
  for (const w of report.warnings) onWarn(w);
  if (report.errors.length > 0) {
    throw new Error(`Validation failed:\n${report.errors.map((e) => `  ✗ ${e}`).join("\n")}`);
  }
  return manifest;
}

async function syncMedia(
  manifest: SyncManifest,
  client: RecapClient,
  docsDir: string,
  onProgress: (message: string) => void,
): Promise<{
  urls: Record<string, string>;
  media: MediaStats;
  /** Remote images before upload; null when there is no local `media/` folder. */
  remote: RecapImage[] | null;
  localFiles: Set<string>;
}> {
  const mediaDir = path.join(docsDir, "media");
  if (!existsSync(mediaDir)) {
    return { urls: {}, media: { uploaded: 0, reused: 0, deleted: 0 }, remote: null, localFiles: new Set() };
  }
  const localFiles = (await readdir(mediaDir))
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort();

  onProgress(`Uploading ${localFiles.length} media file(s)...`);
  const existing = new Map<string, RecapImage>();
  const list = await client.listImages(manifest.project_slug);
  for (const img of list.images) existing.set(img.filename, img);

  const urls: Record<string, string> = {};
  let uploaded = 0;
  let reused = 0;
  for (const filename of localFiles) {
    const filepath = path.join(mediaDir, filename);
    const ex = existing.get(filename);
    if (ex) {
      urls[filename] = ex.url;
      reused++;
      if (!ex.width || !ex.height) {
        const dim = imageDimensions(await readFile(filepath));
        if (dim) await client.patchImage(manifest.project_slug, ex.id, dim);
      }
    } else {
      onProgress(`Uploading ${filename}...`);
      const result = await client.uploadImage(manifest.project_slug, filepath);
      urls[filename] = result.url;
      uploaded++;
      const dim = imageDimensions(await readFile(filepath));
      if (dim) await client.patchImage(manifest.project_slug, result.imageId, dim);
    }
  }
  return {
    urls,
    media: { uploaded, reused, deleted: 0 },
    remote: list.images,
    localFiles: new Set(localFiles),
  };
}

/**
 * Delete remote images that are no longer in local `media/`. Images still
 * referenced by URL in the pushed content are kept (and reported). Returns the
 * number actually deleted; per-image failures become warnings.
 */
async function pruneMedia(
  client: RecapClient,
  projectSlug: string,
  remote: RecapImage[],
  localFiles: Set<string>,
  pushedContent: string,
  onProgress: (message: string) => void,
  onWarn: (message: string) => void,
): Promise<number> {
  const orphans: RecapImage[] = [];
  for (const img of remote) {
    if (localFiles.has(img.filename)) continue;
    if (pushedContent.includes(img.url)) {
      onWarn(`Kept remote image '${img.filename}': not in media/ but still referenced by URL`);
      continue;
    }
    orphans.push(img);
  }
  if (orphans.length === 0) return 0;

  onProgress(`Deleting ${orphans.length} unused remote image(s)...`);
  const result = await client.deleteImages(projectSlug, orphans.map((img) => img.id));
  const names = new Map(orphans.map((img) => [img.id, img.filename]));
  for (const e of result.errors ?? []) {
    onWarn(`Could not delete remote image '${names.get(e.id) ?? e.id}': ${e.error}`);
  }
  return result.deleted?.length ?? 0;
}

async function listLocalImages(docsDir: string): Promise<string[] | null> {
  const mediaDir = path.join(docsDir, "media");
  if (!existsSync(mediaDir)) return null;
  return (await readdir(mediaDir)).filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()));
}
