import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type FallbackLevel = null | "or";

function tokenize(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((t) => t.length > 0);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const projectId = searchParams.get("projectId");
  const lang = searchParams.get("lang");

  if (!query || !projectId) {
    return NextResponse.json({ articles: [], fallback: null });
  }

  const supabase = await createClient();

  const cleanedQuery = query.replace(/#/g, " ").replace(/\s+/g, " ").trim();
  if (!cleanedQuery) {
    return NextResponse.json({ articles: [], fallback: null });
  }

  // Stage 1 — strict AND via websearch_to_tsquery
  let strictQuery = supabase
    .from("articles")
    .select("id, title, slug, content_text, keywords, project_id, chapters(title, keywords)")
    .eq("project_id", projectId)
    .eq("status", "published")
    .textSearch("fts", cleanedQuery, { type: "websearch", config: "simple" })
    .limit(10);

  if (lang) strictQuery = strictQuery.eq("language", lang);

  const { data: strictHits, error: strictErr } = await strictQuery;
  if (strictErr) console.error("[search] strict stage failed:", strictErr.message);

  let articles = strictHits ?? [];
  let fallback: FallbackLevel = null;

  // Stage 2 — OR fallback via RPC
  if (articles.length === 0) {
    const tokens = tokenize(cleanedQuery);
    if (tokens.length > 0) {
      const orQuery = tokens.join(" | ");
      const { data: looseHits, error: looseErr } = await supabase.rpc(
        "search_articles_loose",
        {
          p_project_id: projectId,
          p_query: orQuery,
          p_lang: lang ?? null,
          p_limit: 10,
        }
      );
      if (looseErr) console.error("[search] loose stage failed:", looseErr.message);
      if (looseHits && looseHits.length > 0) {
        articles = looseHits;
        fallback = "or";
      }
    }
  }

  // Log event (fire-and-forget)
  supabase
    .from("search_events")
    .insert({
      project_id: projectId,
      query: query,
      results_count: articles.length,
      language: lang ?? null,
      fallback_level: fallback,
    })
    .then(() => {});

  return NextResponse.json({ articles, fallback });
}
