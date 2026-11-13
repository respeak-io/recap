import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { buildSearchTsQueries } from "@/lib/search/query";
import { expandSearchTerms } from "@/lib/search/vocabulary";
import { RATE_LIMITS, checkRateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

type FallbackLevel = null | "or";

const MAX_QUERY_CHARS = 300;
const RESULT_LIMIT = 10;

/**
 * Docs search, ranked by relevance in one call to `search_articles_ranked`
 * (long terms that match nothing are first split into compound parts):
 * articles matching any meaningful term, ordered by one score (matched terms
 * + 2 x title relevance + body relevance). `fallback: "or"` tells the UI that
 * results are weak (no article contains two thirds of the terms).
 */
export async function GET(request: Request) {
  const limited = checkRateLimit(`search:${clientIp(request)}`, RATE_LIMITS.searchPerMinute);
  if (!limited.ok) {
    return tooManyRequests(limited.retryAfterSeconds, { articles: [], fallback: null, error: "rate_limited" });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.slice(0, MAX_QUERY_CHARS) ?? null;
  const projectId = searchParams.get("projectId");
  const lang = searchParams.get("lang");

  if (!query || !projectId) {
    return NextResponse.json({ articles: [], fallback: null });
  }

  const tsQueries = buildSearchTsQueries(query);
  if (!tsQueries) {
    return NextResponse.json({ articles: [], fallback: null });
  }

  // German compounds the docs never use ("akteneinträge") become their parts.
  const terms = await expandSearchTerms(tsQueries.terms, projectId, lang);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_articles_ranked", {
    p_project_id: projectId,
    p_terms: terms,
    p_lang: lang ?? null,
    p_limit: RESULT_LIMIT,
  });
  if (error) console.error("[search] ranked search failed:", error.message);

  const rows = (data ?? []) as ({ matched_terms?: number } & Record<string, unknown>)[];
  // "Partial matches" hint only when results are weak: no article contains at
  // least two thirds of the terms. Full-sentence questions rarely have one
  // article containing every word, and that alone is no reason for the hint.
  const strongMatch = Math.ceil((terms.length * 2) / 3);
  const fallback: FallbackLevel =
    rows.length > 0 && !rows.some((r) => (r.matched_terms ?? 0) >= strongMatch) ? "or" : null;
  const articles = rows.map(({ matched_terms: _matched, ...article }) => article);

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
