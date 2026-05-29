import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod/v4";

// The default language. Top-level chapter `content` and the project default
// are served in this language on the docs site; other languages are carried as
// translations. Matches the server's `language ?? "en"` default.
export const DEFAULT_LANGUAGE = "en";

export const MANIFEST_FILENAME = "sync.json";

// --- Schema ---

export const ProjectTranslationSchema = z.object({
  name: z.string().optional(),
  subtitle: z.string().optional(),
});

export const ChapterTranslationSchema = z.object({
  title: z.string().optional(),
  group: z.string().optional(),
  description: z.string().optional(),
});

export const ArticleLangSchema = z.object({
  title: z.string(),
  file: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
});
export type ArticleLang = z.infer<typeof ArticleLangSchema>;

// An article has a shared `slug` plus one object per language (keyed by language
// code). Language entries are validated structurally in `validateManifest`
// (and lazily via `getArticleLang`), so the schema only pins `slug` and lets the
// per-language objects pass through.
export const ArticleSchema = z.object({ slug: z.string() }).catchall(z.unknown());
export type Article = z.infer<typeof ArticleSchema>;

export const ChapterSchema = z.object({
  slug: z.string(),
  title: z.string(),
  group: z.string().optional(),
  order: z.number().optional(),
  description: z.string().optional(),
  // language code -> repo-relative path to the chapter's `_index.md`
  content: z.record(z.string(), z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  translations: z.record(z.string(), ChapterTranslationSchema).optional(),
  articles: z.array(ArticleSchema).default([]),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const SyncManifestSchema = z.object({
  project_slug: z.string(),
  languages: z.array(z.string()).default(["en", "de"]),
  name: z.string().optional(),
  subtitle: z.string().optional(),
  translations: z.record(z.string(), ProjectTranslationSchema).optional(),
  chapters: z.array(ChapterSchema),
});
export type SyncManifest = z.infer<typeof SyncManifestSchema>;

// --- Loading ---

export function manifestPath(docsDir: string): string {
  return path.join(docsDir, MANIFEST_FILENAME);
}

export async function loadManifest(docsDir: string): Promise<SyncManifest> {
  const file = manifestPath(docsDir);
  if (!existsSync(file)) {
    throw new Error(`No ${MANIFEST_FILENAME} found in ${docsDir}`);
  }
  const raw = await readFile(file, "utf-8");
  return parseManifest(raw);
}

export function parseManifest(raw: string): SyncManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${MANIFEST_FILENAME} is not valid JSON: ${(err as Error).message}`);
  }
  const result = SyncManifestSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`${MANIFEST_FILENAME} failed validation:\n${issues}`);
  }
  return result.data;
}

// --- Per-language article access ---

export type ArticleLangResult =
  | { ok: true; value: ArticleLang }
  | { ok: false; error: string };

/**
 * Resolve a language variant of an article. Returns null when the language is
 * not present on the article (a normal case — not every article exists in every
 * language), or a validation result describing the per-language object.
 */
export function getArticleLang(article: Article, lang: string): ArticleLangResult | null {
  const entry = (article as Record<string, unknown>)[lang];
  if (entry === undefined) return null;
  const parsed = ArticleLangSchema.safeParse(entry);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  return { ok: true, value: parsed.data };
}

// --- Validation against the docs folder ---

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

/**
 * Check the manifest against the actual docs folder:
 * - every referenced markdown file exists (error)
 * - orphan `.md` files under each language dir that are not referenced (warning)
 * - per-language article objects are well-formed (error)
 * Mirrors the reference `validate()`.
 */
export function validateManifest(manifest: SyncManifest, docsDir: string): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const referenced = new Set<string>();

  for (const chapter of manifest.chapters) {
    for (const [lang, rel] of Object.entries(chapter.content ?? {})) {
      referenced.add(rel);
      if (!existsSync(path.join(docsDir, rel))) {
        errors.push(`Missing file: ${rel} (chapter '${chapter.slug}' ${lang} content)`);
      }
    }

    for (const article of chapter.articles) {
      for (const lang of manifest.languages) {
        const got = getArticleLang(article, lang);
        if (got === null) continue;
        if (!got.ok) {
          errors.push(`Invalid article '${article.slug}' (${lang}): ${got.error}`);
          continue;
        }
        const rel = got.value.file;
        referenced.add(rel);
        if (!existsSync(path.join(docsDir, rel))) {
          errors.push(`Missing file: ${rel} (article '${article.slug}' ${lang})`);
        }
      }
    }
  }

  for (const langDir of manifest.languages) {
    const base = path.join(docsDir, langDir);
    if (!existsSync(base)) continue;
    for (const abs of walkMarkdown(base)) {
      const rel = path.relative(docsDir, abs).split(path.sep).join("/");
      if (!referenced.has(rel)) {
        warnings.push(`Orphaned file (not in ${MANIFEST_FILENAME}): ${rel}`);
      }
    }
  }

  return { errors, warnings };
}

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdown(abs));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      out.push(abs);
    }
  }
  return out.sort();
}
