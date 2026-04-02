import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // "image" or "video"
  const needle = searchParams.get("needle"); // storage_path substring or videoGroupId

  if (!type || !needle) {
    return NextResponse.json({ error: "Missing type or needle" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, content_json")
    .eq("project_id", id);

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, slug, content_json")
    .eq("project_id", id);

  const usedIn: { type: string; title: string; slug: string }[] = [];

  for (const article of articles ?? []) {
    if (article.content_json && JSON.stringify(article.content_json).includes(needle)) {
      usedIn.push({ type: "article", title: article.title, slug: article.slug });
    }
  }

  for (const chapter of chapters ?? []) {
    if (chapter.content_json && JSON.stringify(chapter.content_json).includes(needle)) {
      usedIn.push({ type: "chapter", title: chapter.title, slug: chapter.slug });
    }
  }

  return NextResponse.json({ usedIn });
}
