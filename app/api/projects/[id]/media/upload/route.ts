import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { validateImageFile, uploadImage } from "@/lib/services/upload";

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

  const validationError = validateImageFile(file);
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

  try {
    const result = await uploadImage(supabase, id, file);
    return NextResponse.json({ url: result.publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
