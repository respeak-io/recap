import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  runVideoPipeline,
  createProgressReporter,
} from "@/lib/services/video-pipeline";
import { after } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { videoId, languages = ["en"] } = await request.json();

  const { data: video } = await supabase
    .from("videos")
    .select("*, projects(id)")
    .eq("id", videoId)
    .single();

  if (!video) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const projectId = (video.projects as { id: string }).id;

  // Create processing job
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      project_id: projectId,
      video_id: videoId,
      status: "pending",
      languages,
    })
    .select()
    .single();

  if (jobError || !job) {
    return Response.json({ error: "Failed to create job" }, { status: 500 });
  }

  // Mark video as processing
  await supabase.from("videos").update({ status: "processing" }).eq("id", videoId);

  // Run processing in background after response is sent
  after(async () => {
    const db = createServiceClient();
    const progress = createProgressReporter(db, job.id);

    try {
      await progress.update({
        status: "processing",
        step: "uploading",
        step_message: "Uploading video to AI...",
        progress: 0.05,
      });

      await db
        .from("processing_jobs")
        .update({ started_at: new Date().toISOString() })
        .eq("id", job.id);

      await runVideoPipeline(
        { db, videoId, projectId, languages },
        progress
      );

      await db
        .from("videos")
        .update({ status: "ready" })
        .eq("id", videoId);

      await progress.update({
        status: "completed",
        step: "complete",
        step_message: "Processing complete!",
        progress: 1.0,
      });

      await db
        .from("processing_jobs")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", job.id);
    } catch (error) {
      console.error("Video processing error:", error);
      await db
        .from("videos")
        .update({ status: "failed" })
        .eq("id", videoId);
      await db
        .from("processing_jobs")
        .update({
          status: "failed",
          step: "error",
          step_message:
            error instanceof Error ? error.message : "Processing failed",
          error_message:
            error instanceof Error ? error.message : "Processing failed",
          progress: 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  });

  // Return immediately with job ID
  return Response.json({ jobId: job.id });
}
