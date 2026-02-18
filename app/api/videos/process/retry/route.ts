import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { jobId } = await request.json();

  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  // Look up the failed job to get videoId and languages
  const { data: failedJob } = await supabase
    .from("processing_jobs")
    .select("video_id, languages, status")
    .eq("id", jobId)
    .single();

  if (!failedJob) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (failedJob.status !== "failed") {
    return Response.json(
      { error: "Only failed jobs can be retried" },
      { status: 400 }
    );
  }

  // Re-trigger processing by calling the main process endpoint logic.
  // The idempotent steps will skip any work that was already completed.
  const origin = new URL(request.url).origin;
  const processRes = await fetch(`${origin}/api/videos/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({
      videoId: failedJob.video_id,
      languages: failedJob.languages,
    }),
  });

  if (!processRes.ok) {
    const err = await processRes.json();
    return Response.json(
      { error: err.error ?? "Failed to retry" },
      { status: 500 }
    );
  }

  const { jobId: newJobId } = await processRes.json();
  return Response.json({ jobId: newJobId });
}
