import { segmentsToVtt } from "@/lib/vtt";
import type { PipelineStep } from "../types";

export const generateVtt: PipelineStep = async (ctx) => {
  const { data: currentVideo } = await ctx.db
    .from("videos")
    .select("vtt_content, vtt_languages")
    .eq("id", ctx.videoId)
    .single();

  const vttLanguages: Record<string, string> =
    (currentVideo?.vtt_languages as Record<string, string>) ?? {};

  let vtt: string;

  if (currentVideo?.vtt_content) {
    vtt = currentVideo.vtt_content;
  } else {
    vtt = segmentsToVtt(
      ctx.segments!.map((s) => ({
        start_time: s.start_time,
        end_time: s.end_time,
        spoken_content: s.spoken_content,
      }))
    );
    vttLanguages["en"] = vtt;

    await ctx.db
      .from("videos")
      .update({ vtt_content: vtt, vtt_languages: vttLanguages })
      .eq("id", ctx.videoId);
  }

  return { ...ctx, vtt, vttLanguages };
};
