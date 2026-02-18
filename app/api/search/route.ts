import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const projectId = searchParams.get("projectId");
  const lang = searchParams.get("lang");

  if (!query || !projectId) {
    return NextResponse.json({ articles: [] });
  }

  const supabase = await createClient();

  let articlesQuery = supabase
    .from("articles")
    .select("id, title, slug, content_text, project_id")
    .eq("project_id", projectId)
    .eq("status", "published")
    .textSearch("fts", query, { type: "websearch", config: "english" })
    .limit(10);

  if (lang) {
    articlesQuery = articlesQuery.eq("language", lang);
  }

  const { data: articles } = await articlesQuery;

  // Log search event asynchronously (don't block response)
  supabase.from("search_events").insert({
    project_id: projectId,
    query: query,
    results_count: articles?.length ?? 0,
    language: lang ?? null,
  }).then(() => {});

  return NextResponse.json({
    articles: articles ?? [],
  });
}
