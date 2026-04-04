import { translateVtt as translateVttContent } from "@/lib/ai/translate";
import type { PipelineStep } from "../types";

export const translateVtt: PipelineStep = async (ctx) => {
  const targetLanguages = ctx.languages.filter((l) => l !== "en");
  const vttLanguages = { ...ctx.vttLanguages };

  for (const lang of targetLanguages) {
    if (vttLanguages[lang]) continue;

    try {
      const translatedVtt = await translateVttContent(ctx.vtt!, lang);
      vttLanguages[lang] = translatedVtt;
    } catch (e) {
      console.error(`VTT translation to ${lang} failed:`, e);
    }
  }

  // Save all VTT translations
  await ctx.db
    .from("videos")
    .update({ vtt_languages: vttLanguages })
    .eq("id", ctx.videoId);

  return { ...ctx, vttLanguages };
};
