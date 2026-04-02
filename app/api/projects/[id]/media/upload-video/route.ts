import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

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

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File must be a video (MP4, WebM, or MOV)" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 25MB)" },
      { status: 400 }
    );
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

  // Derive title from filename (minus extension)
  const title = file.name.replace(/\.[^.]+$/, "") || "Untitled Video";

  const ext = file.name.split(".").pop() ?? "mp4";
  const storagePath = `${id}/${randomUUID()}.${ext}`;

  // Upload to videos bucket
  const { error: uploadError } = await supabase.storage
    .from("videos")
    .upload(storagePath, file);

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Create videos table row with status 'ready'
  const { data: video, error: insertError } = await supabase
    .from("videos")
    .insert({
      project_id: id,
      title,
      storage_path: storagePath,
      status: "ready",
    })
    .select("id, title")
    .single();

  if (insertError) {
    // Clean up uploaded file if DB insert fails
    await supabase.storage.from("videos").remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ videoId: video.id, title: video.title });
}
