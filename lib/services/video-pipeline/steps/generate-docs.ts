import { generateText } from "@/lib/ai/generate";
import { getDocGenerationPrompt } from "@/lib/ai/prompts";
import { markdownToTiptap } from "@/lib/ai/markdown-to-tiptap";
import slugify from "slugify";
import type { PipelineStep, ArticleData } from "../types";
import { sanitizeJsonResponse } from "../utils";

export const generateDocs: PipelineStep = async (ctx, progress) => {
  // Checkpoint: check if English articles already exist
  const { data: existingEnArticles } = await ctx.db
    .from("articles")
    .select("id, title, slug, chapter_id, content_json, content_text")
    .eq("video_id", ctx.videoId)
    .eq("language", "en");

  const articles: ArticleData[] = [];

  if (existingEnArticles && existingEnArticles.length > 0) {
    await progress.update({
      step: "generating_docs",
      step_message: "Reusing existing documentation...",
      progress: 0.5,
    });

    for (const a of existingEnArticles) {
      articles.push({
        chapterId: a.chapter_id,
        title: a.title,
        slug: a.slug,
        contentJson: a.content_json as Record<string, unknown>,
        contentText: a.content_text,
      });
    }
  } else {
    await progress.update({
      step: "generating_docs",
      step_message: "Generating documentation...",
      progress: 0.3,
    });

    const prompt = getDocGenerationPrompt(ctx.segments!);

    const responseText = await generateText(prompt, { json: true });
    const sanitizedJson = sanitizeJsonResponse(responseText);
    const doc = JSON.parse(sanitizedJson);

    for (const chapter of doc.chapters) {
      const chapterSlug = slugify(chapter.title, {
        lower: true,
        strict: true,
      });

      const { data: chapterRow } = await ctx.db
        .from("chapters")
        .upsert(
          {
            project_id: ctx.projectId,
            title: chapter.title,
            slug: chapterSlug,
          },
          { onConflict: "project_id,slug" }
        )
        .select()
        .single();

      const contentText = chapter.sections
        .map(
          (s: { heading: string; content: string }) =>
            `${s.heading}\n${s.content}`
        )
        .join("\n\n");

      const articleSlug = slugify(chapter.title, {
        lower: true,
        strict: true,
      });
      const contentJson = markdownToTiptap(chapter.sections);

      await ctx.db.from("articles").insert({
        project_id: ctx.projectId,
        video_id: ctx.videoId,
        chapter_id: chapterRow?.id,
        title: chapter.title,
        slug: articleSlug,
        language: "en",
        content_json: contentJson,
        content_text: contentText,
        status: "draft",
      });

      articles.push({
        chapterId: chapterRow?.id ?? null,
        title: chapter.title,
        slug: articleSlug,
        contentJson,
        contentText,
      });
    }
  }

  return { ...ctx, articles };
};
