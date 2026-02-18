import { createClient } from "@/lib/supabase/server";
import { getPageViewStats, getSearchStats, type TimeRange } from "@/lib/queries/analytics";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { AnalyticsCharts } from "@/components/dashboard/analytics-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Search, Globe } from "lucide-react";
import { notFound } from "next/navigation";

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const { range = "30d" } = await searchParams;
  const timeRange = (["7d", "30d", "90d"].includes(range) ? range : "30d") as TimeRange;

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const [pageViewStats, searchStats] = await Promise.all([
    getPageViewStats(project.id, timeRange),
    getSearchStats(project.id, timeRange),
  ]);

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Analytics" }]}
      />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <div className="flex gap-1 rounded-lg border p-0.5 bg-muted">
            {(["7d", "30d", "90d"] as const).map((r) => (
              <a
                key={r}
                href={`/project/${slug}/analytics?range=${r}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  timeRange === r
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "90 days"}
              </a>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Views</CardTitle>
              <Eye className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pageViewStats.totalViews.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Searches</CardTitle>
              <Search className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{searchStats.totalSearches.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Languages Used</CardTitle>
              <Globe className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {pageViewStats.languageBreakdown.length || "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        <AnalyticsCharts
          dailyViews={pageViewStats.dailyViews}
          topArticles={pageViewStats.topArticles}
          languageBreakdown={pageViewStats.languageBreakdown}
          topQueries={searchStats.topQueries}
          zeroResultQueries={searchStats.zeroResultQueries}
        />
      </div>
    </>
  );
}
