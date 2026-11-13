import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { withDocsRevalidation } from "@/lib/docs/cache";

async function handlePatch(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const { error } = await supabase
    .from("chapters")
    .update({ group: body.group })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export const PATCH = withDocsRevalidation(handlePatch);
