import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();

  // Verify user has write access
  const { data: project } = await supabase
    .from("projects")
    .select("id, theme")
    .eq("id", id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Merge with existing theme to allow partial updates
  const existingTheme = (project.theme as Record<string, unknown>) ?? {};
  const updatedTheme = { ...existingTheme, ...body };

  const { error } = await supabase
    .from("projects")
    .update({ theme: updatedTheme })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, theme: updatedTheme });
}
