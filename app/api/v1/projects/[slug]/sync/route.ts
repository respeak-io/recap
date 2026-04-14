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

  // Update project-level fields if provided
  const projectUpdate: Record<string, unknown> = {};
  if (typeof body.name === "string") projectUpdate.name = body.name;
  if (typeof body.subtitle === "string") projectUpdate.subtitle = body.subtitle;
  if (body.translations !== undefined) projectUpdate.translations = body.translations;

  if (Object.keys(projectUpdate).length > 0) {
    await db.from("projects").update(projectUpdate).eq("id", project.id);
  }

  const incomingChapters: SyncChapter[] = body.chapters;
  const stats = {
    chapters: { created: 0, updated: 0, deleted: 0 },
    articles: { created: 0, updated: 0, deleted: 0 },
  };

  // Fetch existing chapters and articles
  const { data: existingChapters } = await db
    .from("chapters")
    .select("id, slug")
    .eq("project_id", project.id);

  const { data: existingArticles } = await db
    .from("articles")
    .select("id, slug, language, chapter_id")
    .eq("project_id", project.id);

  const existChapterMap = new Map((existingChapters ?? []).map((c) => [c.slug, c]));
  const existArticleMap = new Map(
    (existingArticles ?? []).map((a) => [`${a.chapter_id}:${a.slug}:${a.language}`, a])
  );

  const seenChapterSlugs = new Set<string>();
  const seenArticleKeys = new Set<string>();

  // Upsert chapters and their articles
  for (let ci = 0; ci < incomingChapters.length; ci++) {
    const ch = incomingChapters[ci];
    const chSlug = ch.slug || toSlug(ch.title);
    seenChapterSlugs.add(chSlug);

    const existing = existChapterMap.get(chSlug);
    let chapterId: string;

    const chKeywords = pickKeywords(ch.keywords, `chapters[${ci}]`);
    if (!chKeywords.ok) return chKeywords.res;

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
    const chapterContentJson = ch.content ? markdownToTiptapRaw(ch.content).doc : {};

    if (existing) {
      await db
        .from("chapters")
        .update({
          title: ch.title,
          description: ch.description ?? "",
          content_json: chapterContentJson,
          group: ch.group ?? null,
          translations,
          order: ci,
          ...(chKeywords.value !== undefined ? { keywords: chKeywords.value } : {}),
        })
        .eq("id", existing.id);
      chapterId = existing.id;
      stats.chapters.updated++;
    } else {
      const { data } = await db
        .from("chapters")
        .insert({
          project_id: project.id,
          title: ch.title,
          description: ch.description ?? "",
          content_json: chapterContentJson,
          slug: chSlug,
          group: ch.group ?? null,
          translations,
          order: ci,
          ...(chKeywords.value !== undefined ? { keywords: chKeywords.value } : {}),
        })
        .select("id")
        .single();
      chapterId = data!.id;
      stats.chapters.created++;
    }

    // Upsert articles within this chapter
    for (let ai = 0; ai < (ch.articles ?? []).length; ai++) {
      const art = ch.articles![ai];
      const artSlug = art.slug || toSlug(art.title);
      const lang = art.language || "en";
      const artKey = `${chapterId}:${artSlug}:${lang}`;
      seenArticleKeys.add(artKey);

      const { doc, text } = markdownToTiptapRaw(art.content);
      const existingArt = existArticleMap.get(artKey);

      const artKeywords = pickKeywords(art.keywords, `chapters[${ci}].articles[${ai}]`);
      if (!artKeywords.ok) return artKeywords.res;

      if (existingArt) {
        await db
          .from("articles")
          .update({
            title: art.title,
            description: art.description ?? "",
            content_json: doc,
            content_text: text,
            status: art.status || "draft",
            order: ai,
            updated_at: new Date().toISOString(),
            ...(artKeywords.value !== undefined ? { keywords: artKeywords.value } : {}),
          })
          .eq("id", existingArt.id);
        stats.articles.updated++;
      } else {
        await db.from("articles").insert({
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
          ...(artKeywords.value !== undefined ? { keywords: artKeywords.value } : {}),
        });
        stats.articles.created++;
      }
    }
  }

  // Delete chapters not in payload
  for (const [chSlug, ch] of existChapterMap) {
    if (!seenChapterSlugs.has(chSlug)) {
      await db.from("chapters").delete().eq("id", ch.id);
      stats.chapters.deleted++;
    }
  }

  // Clean up articles that were orphaned by chapter deletion (chapter_id set to null)
  const deletedChapterIds = new Set(
    [...existChapterMap.entries()]
      .filter(([slug]) => !seenChapterSlugs.has(slug))
      .map(([, ch]) => ch.id)
  );
  for (const [artKey, art] of existArticleMap) {
    if (art.chapter_id && deletedChapterIds.has(art.chapter_id) && !seenArticleKeys.has(artKey)) {
      await db.from("articles").delete().eq("id", art.id);
      stats.articles.deleted++;
    }
  }

  // Delete articles not in payload (only those whose chapter survived — deleted chapters cascade)
  const survivingChapterIds = new Set(
    [...existChapterMap.entries()]
      .filter(([slug]) => seenChapterSlugs.has(slug))
      .map(([, ch]) => ch.id)
  );
  for (const [artKey, art] of existArticleMap) {
    if (!seenArticleKeys.has(artKey)) {
      if (!art.chapter_id || survivingChapterIds.has(art.chapter_id)) {
        await db.from("articles").delete().eq("id", art.id);
        stats.articles.deleted++;
      }
    }
  }

  return Response.json(stats);
}
