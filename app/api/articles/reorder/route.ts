import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { items } = await request.json();
  // items: Array<{ id: string; order: number; chapter_id: string | null }>
  const supabase = await createClient();

  for (const item of items) {
    await supabase
      .from("articles")
      .update({ order: item.order, chapter_id: item.chapter_id })
      .eq("id", item.id);
  }

  return NextResponse.json({ success: true });
}
