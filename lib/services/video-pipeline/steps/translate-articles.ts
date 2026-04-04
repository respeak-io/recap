import { translateTiptapJson } from "@/lib/ai/translate";
import type { PipelineStep } from "../types";

export const translateArticles: PipelineStep = async (ctx, progress) => {
  const targetLanguages = ctx.languages.filter((l) => l !== "en");
  const progressPerLang = 0.4 / Math.max(targetLanguages.length, 1);
  let currentProgress = 0.55;

  for (const lang of targetLanguages) {
    // Checkpoint: check if translations already exist
    const { count: existingCount } = await ctx.db
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("video_id", ctx.videoId)
      .eq("language", lang);

    if (existingCount && existingCount > 0) {
      currentProgress += progressPerLang;
      continue;
    }

    await progress.update({
      step: "translating",
      step_message: `Translating to ${lang}...`,
      progress: currentProgress,
    });

    for (const article of ctx.articles!) {
      try {
        const {
          json: translatedJson,
          text: translatedText,
          title: translatedTitle,
        } = await translateTiptapJson(
          article.contentJson,
          article.contentText,
          lang,
          article.title
        );

        await ctx.db.from("articles").insert({
          project_id: ctx.projectId,
          video_id: ctx.videoId,
          chapter_id: article.chapterId,
          title: translatedTitle ?? article.title,
          slug: article.slug,
          language: lang,
          content_json: translatedJson,
          content_text: translatedText,
          status: "draft",
        });
      } catch (e) {
        console.error(
          `Translation of "${article.title}" to ${lang} failed:`,
          e
        );
      }
    }

    currentProgress += progressPerLang;
  }

  return ctx;
};
