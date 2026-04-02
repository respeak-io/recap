import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; imageId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id, imageId } = await params;
  const body = await request.json();
  const supabase = await createClient();

  if (body.altText === undefined) {
    return NextResponse.json({ error: "Missing altText" }, { status: 400 });
  }

  const { error } = await supabase
    .from("images")
    .update({ alt_text: body.altText })
    .eq("id", imageId)
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, imageId } = await params;
  const supabase = await createClient();

  // Get storage path before deleting row
  const { data: image } = await supabase
    .from("images")
    .select("storage_path")
    .eq("id", imageId)
    .eq("project_id", id)
    .single();

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // Delete storage file
  const { error: storageError } = await supabase.storage.from("assets").remove([image.storage_path]);
  if (storageError) {
    console.error("[media/images] Failed to delete storage file:", storageError.message);
  }

  // Delete DB row
  const { error: deleteError } = await supabase.from("images").delete().eq("id", imageId).eq("project_id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
