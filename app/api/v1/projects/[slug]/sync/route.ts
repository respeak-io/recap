import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject, toSlug } from "@/lib/api-v1-helpers";
import { markdownToTiptapRaw } from "@/lib/ai/markdown-to-tiptap";
import { validateKeywords } from "@/lib/keywords";

interface SyncChapter {
  title: string;
  description?: string;
  content?: string;
  slug?: string;
  group?: string;
  keywords?: string[];
  translations?: Record<string, { title?: string; group?: string; description?: string; content?: string }>;
  articles?: SyncArticle[];
}

interface SyncArticle {
  title: string;
  description?: string;
  slug?: string;
  content: string;
  language?: string;
  status?: string;
  keywords?: string[];
}

function pickKeywords(
  input: unknown,
  path: string
): { ok: true; value?: string[] } | { ok: false; res: Response } {
  if (input === undefined) return { ok: true };
  const result = validateKeywords(input);
  if (!result.ok) {
    return { ok: false, res: apiError(`${path}: ${result.error}`, "VALIDATION_ERROR", 422) };
  }
  return { ok: true, value: result.value };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  if (!body.chapters || !Array.isArray(body.chapters)) {
    return apiError("chapters array is required", "VALIDATION_ERROR", 422);
  }

  // Mirror by default: anything absent from the payload is deleted. A scoped or
  // additive push sends `prune: false` to keep the unsent chapters/articles —
  // omitting the field preserves the historical full-mirror behavior.
  const prune = body.prune !== false;

  const incomingChapters: SyncChapter[] = body.chapters;

  // --- Validation pass: reject the whole payload before writing anything. ---
  // Keyword limits and duplicate slugs used to be checked mid-loop, so a bad
  // chapter at index N left chapters 0..N-1 (and project fields) half-applied.
  const chapterKeywords: (string[] | undefined)[] = [];
  const articleKeywords: (string[] | undefined)[][] = [];
  const chapterSlugs: string[] = [];
  const articleSlugs: string[][] = [];
  const firstSeenChapter = new Map<string, number>();
  const firstSeenArticle = new Map<string, string>();
  for (let ci = 0; ci < incomingChapters.length; ci++) {
    const ch = incomingChapters[ci];
    const chSlug = ch.slug || toSlug(ch.title);
    const chPath = `chapters[${ci}] '${chSlug}'`;
    if (firstSeenChapter.has(chSlug)) {
      return apiError(
        `${chPath}: duplicate chapter slug (also chapters[${firstSeenChapter.get(chSlug)}])`,
        "VALIDATION_ERROR",
        422
      );
    }
    firstSeenChapter.set(chSlug, ci);
    chapterSlugs.push(chSlug);

    const chKeywords = pickKeywords(ch.keywords, chPath);
    if (!chKeywords.ok) return chKeywords.res;
    chapterKeywords.push(chKeywords.value);

    const kws: (string[] | undefined)[] = [];
    const slugs: string[] = [];
    for (let ai = 0; ai < (ch.articles ?? []).length; ai++) {
      const art = ch.articles![ai];
      const artSlug = art.slug || toSlug(art.title);
      const lang = art.language || "en";
      const artPath = `${chPath}.articles[${ai}] '${artSlug}' (${lang})`;
      // Articles are unique per (project, language, slug) in the DB, regardless
      // of chapter — the same slug+language twice in one payload can't be stored.
      const artKey = `${artSlug}:${lang}`;
      if (firstSeenArticle.has(artKey)) {
        return apiError(
          `${artPath}: duplicate article slug+language (also in chapter '${firstSeenArticle.get(artKey)}')`,
          "VALIDATION_ERROR",
          422
        );
      }
      firstSeenArticle.set(artKey, chSlug);
      const artKeywords = pickKeywords(art.keywords, artPath);
      if (!artKeywords.ok) return artKeywords.res;
      kws.push(artKeywords.value);
      slugs.push(artSlug);
    }
    articleKeywords.push(kws);
    articleSlugs.push(slugs);
  }

  // Any failed write aborts the sync with a 500 instead of being counted as a
  // success. (Supabase returns errors rather than throwing; previously they were
  // ignored, so e.g. a unique-constraint violation on insert was reported as
  // "created" and the original row then pruned.)
  const failed = (what: string, error: { message: string }) =>
    apiError(`Sync aborted: ${what}: ${error.message}`, "INTERNAL", 500);

  // Update project-level fields if provided
  const projectUpdate: Record<string, unknown> = {};
  if (typeof body.name === "string") projectUpdate.name = body.name;
  if (typeof body.subtitle === "string") projectUpdate.subtitle = body.subtitle;
  if (body.translations !== undefined) projectUpdate.translations = body.translations;

  if (Object.keys(projectUpdate).length > 0) {
    const { error } = await db.from("projects").update(projectUpdate).eq("id", project.id);
    if (error) return failed("updating project", error);
  }

  const stats = {
    chapters: { created: 0, updated: 0, deleted: 0 },
    articles: { created: 0, updated: 0, deleted: 0 },
  };

  // Fetch existing chapters and articles
  const { data: existingChapters, error: chFetchError } = await db
    .from("chapters")
    .select("id, slug")
    .eq("project_id", project.id);
  if (chFetchError) return failed("fetching chapters", chFetchError);

  const { data: existingArticles, error: artFetchError } = await db
    .from("articles")
    .select("id, slug, language, chapter_id")
    .eq("project_id", project.id);
  if (artFetchError) return failed("fetching articles", artFetchError);

  const existChapterMap = new Map((existingChapters ?? []).map((c) => [c.slug, c]));
  // Keyed by slug+language — the DB's uniqueness key — NOT by chapter. An
  // article whose slug now sits under a different chapter is the same row and
  // gets moved (chapter_id updated), rather than re-inserted (which violates the
  // unique constraint) and its original pruned.
  const existArticleMap = new Map(
    (existingArticles ?? []).map((a) => [`${a.slug}:${a.language}`, a])
  );

  const seenChapterSlugs = new Set<string>();
  const seenArticleKeys = new Set<string>();

  // Upsert chapters and their articles
  for (let ci = 0; ci < incomingChapters.length; ci++) {
    const ch = incomingChapters[ci];
    const chSlug = chapterSlugs[ci];
    seenChapterSlugs.add(chSlug);

    const existing = existChapterMap.get(chSlug);
    let chapterId: string;
    const chKeywords = chapterKeywords[ci];

    const translations = ch.translations
      ? Object.fromEntries(
          Object.entries(ch.translations).map(([lang, t]) => {
            const { content, ...rest } = t;
            return [lang, {
              ...rest,
              ...(content ? { content_json: markdownToTiptapRaw(content).doc } : {}),
            }];
          })
        )
      : null;
    // Default-language (en) chapter content: preserve-on-omit, same as keywords.
    // Only write content_json when `content` is explicitly provided so a sync
    // that omits it never clobbers the stored doc (the bug the reference client
    // worked around by PATCHing each chapter's content after sync).
    const chapterContentJson = ch.content ? markdownToTiptapRaw(ch.content).doc : undefined;

    if (existing) {
      const { error } = await db
        .from("chapters")
        .update({
          title: ch.title,
          description: ch.description ?? "",
          group: ch.group ?? null,
          translations,
          order: ci,
          ...(chapterContentJson !== undefined ? { content_json: chapterContentJson } : {}),
          ...(chKeywords !== undefined ? { keywords: chKeywords } : {}),
        })
        .eq("id", existing.id);
      if (error) return failed(`updating chapter '${chSlug}'`, error);
      chapterId = existing.id;
      stats.chapters.updated++;
    } else {
      const { data, error } = await db
        .from("chapters")
        .insert({
          project_id: project.id,
          title: ch.title,
          description: ch.description ?? "",
          content_json: chapterContentJson ?? { type: "doc", content: [] },
          slug: chSlug,
          group: ch.group ?? null,
          translations,
          order: ci,
          ...(chKeywords !== undefined ? { keywords: chKeywords } : {}),
        })
        .select("id")
        .single();
      if (error || !data) {
        return failed(`creating chapter '${chSlug}'`, error ?? { message: "no row returned" });
      }
      chapterId = data.id;
      stats.chapters.created++;
    }

    // Upsert articles within this chapter
    for (let ai = 0; ai < (ch.articles ?? []).length; ai++) {
      const art = ch.articles![ai];
      const artSlug = articleSlugs[ci][ai];
      const lang = art.language || "en";
      const artKey = `${artSlug}:${lang}`;
      seenArticleKeys.add(artKey);

      const { doc, text } = markdownToTiptapRaw(art.content);
      const existingArt = existArticleMap.get(artKey);
      const artKeywords = articleKeywords[ci][ai];

      if (existingArt) {
        const { error } = await db
          .from("articles")
          .update({
            chapter_id: chapterId,
            title: art.title,
            description: art.description ?? "",
            content_json: doc,
            content_text: text,
            status: art.status || "draft",
            order: ai,
            updated_at: new Date().toISOString(),
            ...(artKeywords !== undefined ? { keywords: artKeywords } : {}),
          })
          .eq("id", existingArt.id);
        if (error) return failed(`updating article '${artSlug}' (${lang})`, error);
        stats.articles.updated++;
      } else {
        const { error } = await db.from("articles").insert({
          project_id: project.id,
          chapter_id: chapterId,
          title: art.title,
          description: art.description ?? "",
          slug: artSlug,
          language: lang,
          content_json: doc,
          content_text: text,
          status: art.status || "draft",
          order: ai,
          ...(artKeywords !== undefined ? { keywords: artKeywords } : {}),
        });
        if (error) return failed(`creating article '${artSlug}' (${lang})`, error);
        stats.articles.created++;
      }
    }
  }

  // Pruning is skipped for additive/scoped pushes (`prune: false`): only the
  // upserts above happen, and chapters/articles absent from the payload are left
  // untouched. All moves already happened above, so nothing that is still in
  // the payload can be caught by the deletes below.
  if (prune) {
    // Delete articles not in payload (by slug+language, wherever they live —
    // including ones in chapters about to be deleted, and chapter-less ones).
    for (const [artKey, art] of existArticleMap) {
      if (!seenArticleKeys.has(artKey)) {
        const { error } = await db.from("articles").delete().eq("id", art.id);
        if (error) return failed(`deleting article '${art.slug}' (${art.language})`, error);
        stats.articles.deleted++;
      }
    }

    // Delete chapters not in payload. Their remaining articles (if any) were
    // either moved above or deleted just now.
    for (const [chSlug, ch] of existChapterMap) {
      if (!seenChapterSlugs.has(chSlug)) {
        const { error } = await db.from("chapters").delete().eq("id", ch.id);
        if (error) return failed(`deleting chapter '${chSlug}'`, error);
        stats.chapters.deleted++;
      }
    }
  }

  return Response.json(stats);
}
