import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

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

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
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

  const ext = file.name.split(".").pop() ?? "png";
  const storagePath = `${id}/content/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(storagePath, file);

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Track the image in the database
  const { error: insertError } = await supabase.from("images").insert({
    project_id: id,
    storage_path: storagePath,
    filename: file.name,
    size_bytes: file.size,
  });
  if (insertError) {
    console.error("[media/upload] Failed to track image in DB:", insertError.message);
  }

  const { data: urlData } = supabase.storage
    .from("assets")
    .getPublicUrl(storagePath);

  return NextResponse.json({ url: urlData.publicUrl });
}
