import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; videoId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id, videoId } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("videos")
    .update(updates)
    .eq("id", videoId)
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, videoId } = await params;
  const supabase = await createClient();

  const { data: video } = await supabase
    .from("videos")
    .select("storage_path")
    .eq("id", videoId)
    .eq("project_id", id)
    .single();

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const { error: storageError } = await supabase.storage.from("videos").remove([video.storage_path]);
  if (storageError) {
    console.error("[media/videos] Failed to delete storage file:", storageError.message);
  }

  const { error: deleteError } = await supabase.from("videos").delete().eq("id", videoId).eq("project_id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
