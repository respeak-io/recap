import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  loadManifest,
  validateManifest,
  getArticleLang,
  type SyncManifest,
} from "./manifest.js";
import { buildLinkMap } from "./links.js";
import { toPlainText } from "./markdown.js";
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
  onProgress?: (message: string) => void;
  onWarn?: (message: string) => void;
}

export interface PushResult {
  stats: SyncStats;
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

  const imageUrls = await syncMedia(manifest, client, options.docsDir, onProgress);

  onProgress("Building sync payload...");
  const linkMap = buildLinkMap(manifest);
  const payload = await buildPayload(manifest, options.docsDir, imageUrls, linkMap, onWarn);

  onProgress("Syncing documentation...");
  const stats = await client.sync(manifest.project_slug, payload);

  return { stats, warnings };
}

/** Preview differences without mutating anything (`push --dry-run`). */
export async function diff(options: SyncOptions): Promise<DiffResult> {
  const warnings: string[] = [];
  const onWarn = options.onWarn ?? ((m: string) => warnings.push(m));
  const onProgress = options.onProgress ?? (() => {});

  const manifest = await loadAndValidate(options.docsDir, onProgress, onWarn);
  const client = new RecapClient({ baseUrl: options.url, apiKey: options.apiKey });

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

  onProgress("Checking article content...");
  for (const chapter of manifest.chapters) {
    const remoteKeys = remoteArtKeysByChapter.get(chapter.slug);
    for (const article of chapter.articles) {
      for (const lang of manifest.languages) {
        const got = getArticleLang(article, lang);
        if (!got || !got.ok) continue;
        const key = `${article.slug}:${lang}`;
        const raw = await readFile(path.join(options.docsDir, got.value.file), "utf-8");
        localTexts.set(key, toPlainText(raw));
        // Only fetch remote content for articles that exist on both sides.
        if (!remoteChapterSlugs.has(chapter.slug) || !remoteKeys?.has(key)) continue;
        const ra = await client.getArticle(manifest.project_slug, article.slug, lang);
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
  });

  return { report, warnings };
}

// --- internals ---

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
): Promise<Record<string, string>> {
  const mediaDir = path.join(docsDir, "media");
  if (!existsSync(mediaDir)) return {};
  const localFiles = (await readdir(mediaDir))
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort();
  if (localFiles.length === 0) return {};

  onProgress(`Uploading ${localFiles.length} media file(s)...`);
  const existing = new Map<string, RecapImage>();
  const list = await client.listImages(manifest.project_slug);
  for (const img of list.images) existing.set(img.filename, img);

  const urls: Record<string, string> = {};
  for (const filename of localFiles) {
    const filepath = path.join(mediaDir, filename);
    const ex = existing.get(filename);
    if (ex) {
      urls[filename] = ex.url;
      if (!ex.width || !ex.height) {
        const dim = imageDimensions(await readFile(filepath));
        if (dim) await client.patchImage(manifest.project_slug, ex.id, dim);
      }
    } else {
      onProgress(`Uploading ${filename}...`);
      const result = await client.uploadImage(manifest.project_slug, filepath);
      urls[filename] = result.url;
      const dim = imageDimensions(await readFile(filepath));
      if (dim) await client.patchImage(manifest.project_slug, result.imageId, dim);
    }
  }
  return urls;
}

async function listLocalImages(docsDir: string): Promise<string[]> {
  const mediaDir = path.join(docsDir, "media");
  if (!existsSync(mediaDir)) return [];
  return (await readdir(mediaDir)).filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()));
}
