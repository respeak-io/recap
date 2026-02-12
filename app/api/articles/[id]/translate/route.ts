import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { translateTiptapJson } from "@/lib/ai/translate";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Get the target article
  const { data: article } = await supabase
    .from("articles")
    .select("*")
    .eq("id", id)
    .single();

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Find English sibling
  const { data: englishArticle } = await supabase
    .from("articles")
    .select("*")
    .eq("project_id", article.project_id)
    .eq("slug", article.slug)
    .eq("audience", article.audience)
    .eq("language", "en")
    .single();

  if (!englishArticle) {
    return NextResponse.json(
      { error: "No English source found" },
      { status: 404 }
    );
  }

  // Translate
  const { json, text, title } = await translateTiptapJson(
    englishArticle.content_json,
    englishArticle.content_text,
    article.language,
    englishArticle.title
  );

  // Update the target article
  await supabase
    .from("articles")
    .update({
      content_json: json,
      content_text: text,
      title: title ?? article.title,
    })
    .eq("id", id);

  return NextResponse.json({ success: true });
}
