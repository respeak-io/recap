import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const assetType = formData.get("type") as string; // "logo" or "favicon"

  if (!file || !assetType) {
    return NextResponse.json({ error: "Missing file or type" }, { status: 400 });
  }

  if (!["logo", "favicon"].includes(assetType)) {
    return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
  }

  // Validate file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify project exists and user has access
  const { data: project } = await supabase
    .from("projects")
    .select("id, theme")
    .eq("id", id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const ext = file.name.split(".").pop() ?? "png";
  const storagePath = `${id}/${assetType}.${ext}`;

  // Upload to assets bucket (upsert to replace existing)
  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(storagePath, file, { upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("assets")
    .getPublicUrl(storagePath);

  // Update project theme with the asset path
  const existingTheme = (project.theme as Record<string, unknown>) ?? {};
  const themeKey = assetType === "logo" ? "logo_path" : "favicon_path";
  const updatedTheme = { ...existingTheme, [themeKey]: storagePath };

  await supabase
    .from("projects")
    .update({ theme: updatedTheme })
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    path: storagePath,
    publicUrl: urlData.publicUrl,
  });
}
