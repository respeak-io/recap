import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject, toSlug } from "@/lib/api-v1-helpers";
import { markdownToTiptapRaw } from "@/lib/ai/markdown-to-tiptap";

interface SyncChapter {
  title: string;
  description?: string;
  content?: string;
  slug?: string;
  group?: string;
  translations?: Record<string, { title?: string; group?: string }>;
  articles?: SyncArticle[];
}

interface SyncArticle {
  title: string;
  description?: string;
  slug?: string;
  content: string;
  language?: string;
  status?: string;
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

    const translations = ch.translations ?? null;
    const chapterContentJson = ch.content ? markdownToTiptapRaw(ch.content).doc : {};

    if (existing) {
      await db
        .from("chapters")
        .update({ title: ch.title, description: ch.description ?? "", content_json: chapterContentJson, group: ch.group ?? null, translations, order: ci })
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
