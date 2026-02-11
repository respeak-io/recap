import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Get video to find storage path
  const { data: video } = await supabase
    .from("videos")
    .select("storage_path")
    .eq("id", id)
    .single();

  // Delete from storage
  if (video?.storage_path) {
    await supabase.storage.from("videos").remove([video.storage_path]);
  }

  // Delete video record (cascade deletes segments)
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
