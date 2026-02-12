import { createClient } from "@/lib/supabase/server";

export type TimeRange = "7d" | "30d" | "90d";

function getDateThreshold(range: TimeRange): string {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function getPageViewStats(projectId: string, range: TimeRange) {
  const supabase = await createClient();
  const since = getDateThreshold(range);

  // Total views
  const { count: totalViews } = await supabase
    .from("page_views")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gte("created_at", since);

  // Views per day
  const { data: dailyViews } = await supabase
    .rpc("analytics_daily_views", { p_project_id: projectId, p_since: since });

  // Top articles
  const { data: topArticles } = await supabase
    .rpc("analytics_top_articles", { p_project_id: projectId, p_since: since, p_limit: 10 });

  // Audience breakdown
  const { data: audienceBreakdown } = await supabase
    .rpc("analytics_audience_breakdown", { p_project_id: projectId, p_since: since });

  // Language breakdown
  const { data: languageBreakdown } = await supabase
    .rpc("analytics_language_breakdown", { p_project_id: projectId, p_since: since });

  return {
    totalViews: totalViews ?? 0,
    dailyViews: dailyViews ?? [],
    topArticles: topArticles ?? [],
    audienceBreakdown: audienceBreakdown ?? [],
    languageBreakdown: languageBreakdown ?? [],
  };
}

export async function getSearchStats(projectId: string, range: TimeRange) {
  const supabase = await createClient();
  const since = getDateThreshold(range);

  const { count: totalSearches } = await supabase
    .from("search_events")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gte("created_at", since);

  const { data: topQueries } = await supabase
    .rpc("analytics_top_searches", { p_project_id: projectId, p_since: since, p_limit: 10 });

  const { data: zeroResultQueries } = await supabase
    .rpc("analytics_zero_result_searches", { p_project_id: projectId, p_since: since, p_limit: 10 });

  return {
    totalSearches: totalSearches ?? 0,
    topQueries: topQueries ?? [],
    zeroResultQueries: zeroResultQueries ?? [],
  };
}
