import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { projectId } = await request.json();

  // Verify user has access to project
  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .single();

  if (!project)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const videoId = crypto.randomUUID();
  const storagePath = `${project.org_id}/${projectId}/${videoId}.mp4`;

  // Create video record
  const { data: video } = await supabase
    .from("videos")
    .insert({
      project_id: projectId,
      title: "Untitled Video",
      storage_path: storagePath,
      status: "uploading",
    })
    .select()
    .single();

  // Generate signed upload URL
  const { data: uploadData } = await supabase.storage
    .from("videos")
    .createSignedUploadUrl(storagePath);

  return NextResponse.json({
    videoId: video?.id,
    uploadUrl: uploadData?.signedUrl,
    storagePath,
  });
}
