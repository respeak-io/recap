import {
  uploadAndProcessVideo,
  extractVideoContent,
} from "@/lib/ai/gemini";
import type { PipelineStep, Segment } from "../types";

export const extractSegments: PipelineStep = async (ctx, progress) => {
  // Checkpoint: check if segments already exist from a previous attempt
  const { count: existingSegmentCount } = await ctx.db
    .from("video_segments")
    .select("id", { count: "exact", head: true })
    .eq("video_id", ctx.videoId);

  let segments: Segment[];

  if (existingSegmentCount && existingSegmentCount > 0) {
    await progress.update({
      step: "transcribing",
      step_message: "Reusing existing content extraction...",
      progress: 0.2,
    });

    const { data: existingSegments } = await ctx.db
      .from("video_segments")
      .select("*")
      .eq("video_id", ctx.videoId)
      .order("order", { ascending: true });

    segments = (existingSegments ?? []).map((s) => ({
      start_time: s.start_time,
      end_time: s.end_time,
      spoken_content: s.spoken_content,
      visual_context: s.visual_context,
    }));
  } else {
    const { data: video } = await ctx.db
      .from("videos")
      .select("storage_path")
      .eq("id", ctx.videoId)
      .single();

    const { data: urlData } = await ctx.db.storage
      .from("videos")
      .createSignedUrl(video!.storage_path, 3600);

    const fileInfo = await uploadAndProcessVideo(urlData!.signedUrl);

    await progress.update({
      step: "transcribing",
      step_message: "Extracting content from video...",
      progress: 0.2,
    });

    segments = (await extractVideoContent(
      fileInfo.uri!,
      fileInfo.mimeType!
    )) as Segment[];

    const segmentRows = segments.map((seg, i) => ({
      video_id: ctx.videoId,
      start_time: seg.start_time,
      end_time: seg.end_time,
      spoken_content: seg.spoken_content,
      visual_context: seg.visual_context,
      order: i,
    }));
    await ctx.db.from("video_segments").insert(segmentRows);
  }

  return { ...ctx, segments };
};
