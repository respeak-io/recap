"use client";

import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const viewsChartConfig = {
  views: { label: "Views", color: "var(--chart-1)" },
} satisfies ChartConfig;

const audienceChartConfig = {
  views: { label: "Views", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface AnalyticsChartsProps {
  dailyViews: { day: string; views: number }[];
  topArticles: { article_slug: string; article_title: string; audience: string; views: number }[];
  audienceBreakdown: { audience: string; views: number }[];
  languageBreakdown: { language: string; views: number }[];
  topQueries: { query: string; count: number; avg_results: number }[];
  zeroResultQueries: { query: string; count: number }[];
}

export function AnalyticsCharts({
  dailyViews,
  topArticles,
  audienceBreakdown,
  languageBreakdown,
  topQueries,
  zeroResultQueries,
}: AnalyticsChartsProps) {
  return (
    <div className="space-y-6">
      {/* Row 1: Views over time */}
      <Card>
        <CardHeader>
          <CardTitle>Page Views</CardTitle>
          <CardDescription>Daily views over the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyViews.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No page views yet. Views will appear once visitors access your public docs.</p>
          ) : (
            <ChartContainer config={viewsChartConfig} className="h-[250px] w-full">
              <LineChart data={dailyViews} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })}
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="var(--color-views)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Row 2: Top articles + Audience breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Articles</CardTitle>
            <CardDescription>Most viewed documentation pages</CardDescription>
          </CardHeader>
          <CardContent>
            {topArticles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ChartContainer config={audienceChartConfig} className="h-[250px] w-full">
                <BarChart data={topArticles.slice(0, 8)} layout="vertical" accessibilityLayer>
                  <CartesianGrid horizontal={false} />
                  <YAxis
                    dataKey="article_title"
                    type="category"
                    width={150}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v.length > 25 ? v.slice(0, 25) + "..." : v}
                  />
                  <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="views" fill="var(--color-views)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audience Breakdown</CardTitle>
            <CardDescription>Views by target audience</CardDescription>
          </CardHeader>
          <CardContent>
            {audienceBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-3">
                {audienceBreakdown.map((item) => {
                  const max = Math.max(...audienceBreakdown.map((i) => Number(i.views)));
                  const pct = max > 0 ? (Number(item.views) / max) * 100 : 0;
                  return (
                    <div key={item.audience} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize">{item.audience}</span>
                        <span className="text-muted-foreground">{item.views}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-chart-2 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Language breakdown + Search */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Language Usage</CardTitle>
            <CardDescription>Which language versions are readers using</CardDescription>
          </CardHeader>
          <CardContent>
            {languageBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-3">
                {languageBreakdown.map((item) => {
                  const max = Math.max(...languageBreakdown.map((i) => Number(i.views)));
                  const pct = max > 0 ? (Number(item.views) / max) * 100 : 0;
                  return (
                    <div key={item.language} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.language}</span>
                        <span className="text-muted-foreground">{item.views}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-chart-3 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Search Queries</CardTitle>
            <CardDescription>What your readers are searching for</CardDescription>
          </CardHeader>
          <CardContent>
            {topQueries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No searches yet.</p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Top queries</p>
                  {topQueries.slice(0, 5).map((item) => (
                    <div key={item.query} className="flex justify-between text-sm">
                      <span className="truncate">&ldquo;{item.query}&rdquo;</span>
                      <span className="text-muted-foreground flex-shrink-0 ml-2">{item.count}x</span>
                    </div>
                  ))}
                </div>
                {zeroResultQueries.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-destructive">Content gaps (zero results)</p>
                    {zeroResultQueries.slice(0, 5).map((item) => (
                      <div key={item.query} className="flex justify-between text-sm">
                        <span className="truncate">&ldquo;{item.query}&rdquo;</span>
                        <span className="text-muted-foreground flex-shrink-0 ml-2">{item.count}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
