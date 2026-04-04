import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { validateVideoFile, uploadVideo } from "@/lib/services/upload";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const validationError = validateVideoFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify project exists and user has access
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const language = (formData.get("language") as string) || "en";
  const videoGroupId = formData.get("videoGroupId") as string | null;

  try {
    const result = await uploadVideo(supabase, id, file, language, videoGroupId);

    // Re-fetch to get title and video_group_id for response
    const { data: video } = await supabase
      .from("videos")
      .select("id, title, video_group_id")
      .eq("id", result.id)
      .single();

    return NextResponse.json({
      videoId: video!.id,
      title: video!.title,
      videoGroupId: video!.video_group_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
