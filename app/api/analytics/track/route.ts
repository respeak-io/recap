import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { type, projectId, articleSlug, articleId, language, query, resultsCount } = body;

  if (!type || !projectId) {
    return NextResponse.json({ error: "Missing type or projectId" }, { status: 400 });
  }

  const supabase = await createClient();

  if (type === "page_view") {
    if (!articleSlug) {
      return NextResponse.json({ error: "Missing articleSlug" }, { status: 400 });
    }

    const referrer = request.headers.get("referer") ?? null;

    const { error } = await supabase.from("page_views").insert({
      project_id: projectId,
      article_id: articleId ?? null,
      article_slug: articleSlug,
      language: language ?? null,
      referrer,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "search") {
    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const { error } = await supabase.from("search_events").insert({
      project_id: projectId,
      query,
      results_count: resultsCount ?? 0,
      language: language ?? null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
