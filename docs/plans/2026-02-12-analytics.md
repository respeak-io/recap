# Docs Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add self-hosted, privacy-friendly analytics to vidtodoc so project owners can see page views, search queries, audience/language breakdown, and top articles — all stored in Supabase with zero external dependencies.

**Architecture:** A lightweight client-side tracker fires anonymous events to a `POST /api/analytics/track` endpoint that inserts into a `page_views` and `search_events` table. The dashboard replaces the "Analytics — Coming soon" card with real charts (bar, line) powered by server-side aggregation queries and shadcn chart components (built on Recharts). No cookies, no fingerprinting, no PII — just aggregate counters.

**Tech Stack:** Supabase (PostgreSQL), Next.js API routes, Recharts (via shadcn/ui charts), Tailwind CSS

---

### Task 1: Database Migration — Analytics Tables

**Files:**
- Create: `supabase/migrations/20260212000000_analytics.sql`

**Step 1: Write the migration**

```sql
-- Page view events (anonymous, no PII)
create table page_views (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  article_id uuid references articles(id) on delete set null,
  article_slug text not null,
  audience text,
  language text,
  referrer text,
  created_at timestamptz not null default now()
);

-- Index for fast time-range queries per project
create index page_views_project_created_idx on page_views (project_id, created_at desc);
create index page_views_article_idx on page_views (project_id, article_slug);

-- Search query events
create table search_events (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  query text not null,
  results_count integer not null default 0,
  audience text,
  language text,
  created_at timestamptz not null default now()
);

create index search_events_project_created_idx on search_events (project_id, created_at desc);

-- RLS: page_views
alter table page_views enable row level security;

-- Anyone can insert (public docs viewers create page views)
create policy "page_views_insert" on page_views for insert
with check (
  exists (select 1 from projects where projects.id = project_id and is_public)
);

-- Only org members can read analytics
create policy "page_views_select" on page_views for select using (
  exists (select 1 from projects where projects.id = project_id and is_org_member(projects.org_id))
);

-- RLS: search_events
alter table search_events enable row level security;

create policy "search_events_insert" on search_events for insert
with check (
  exists (select 1 from projects where projects.id = project_id and is_public)
);

create policy "search_events_select" on search_events for select using (
  exists (select 1 from projects where projects.id = project_id and is_org_member(projects.org_id))
);
```

**Step 2: Apply the migration locally**

Run: `cd /Users/Tim/Documents/Respeak_Experiments/vidtodoc && supabase db reset`
Expected: All migrations apply cleanly including the new analytics tables.

**Step 3: Commit**

```bash
git add supabase/migrations/20260212000000_analytics.sql
git commit -m "feat(analytics): add page_views and search_events tables with RLS"
```

---

### Task 2: Tracking API Endpoint

**Files:**
- Create: `app/api/analytics/track/route.ts`

**Step 1: Write the failing test**

No unit test for this route — we'll verify via manual curl. Skip to implementation.

**Step 2: Write the endpoint**

```typescript
// app/api/analytics/track/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { type, projectId, articleSlug, articleId, audience, language, query, resultsCount } = body;

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
      audience: audience ?? null,
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
      audience: audience ?? null,
      language: language ?? null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

**Step 3: Verify via curl**

Run: `curl -X POST http://localhost:3000/api/analytics/track -H 'Content-Type: application/json' -d '{"type":"page_view","projectId":"test","articleSlug":"test"}'`
Expected: Either `{"ok":true}` or a foreign key error (expected since "test" isn't a real project id). The important thing is no 500 crash.

**Step 4: Commit**

```bash
git add app/api/analytics/track/route.ts
git commit -m "feat(analytics): add POST /api/analytics/track endpoint for page views and search events"
```

---

### Task 3: Client-Side Page View Tracker

**Files:**
- Create: `components/docs/analytics-tracker.tsx`
- Modify: `app/(docs)/[projectSlug]/[articleSlug]/page.tsx:42-58` (add tracker)

**Step 1: Create the tracker component**

```typescript
// components/docs/analytics-tracker.tsx
"use client";

import { useEffect, useRef } from "react";

interface AnalyticsTrackerProps {
  projectId: string;
  articleSlug: string;
  articleId: string;
  audience: string;
  language: string;
}

export function AnalyticsTracker({
  projectId,
  articleSlug,
  articleId,
  audience,
  language,
}: AnalyticsTrackerProps) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "page_view",
        projectId,
        articleSlug,
        articleId,
        audience,
        language,
      }),
    }).catch(() => {
      // Silently ignore tracking failures
    });
  }, [projectId, articleSlug, articleId, audience, language]);

  return null;
}
```

**Step 2: Add tracker to the article page**

In `app/(docs)/[projectSlug]/[articleSlug]/page.tsx`, add after the `<Toc>` component:

```typescript
// Add to imports:
import { AnalyticsTracker } from "@/components/docs/analytics-tracker";

// Add inside the return, after <Toc headings={headings} />:
<AnalyticsTracker
  projectId={article.project_id}
  articleSlug={articleSlug}
  articleId={article.id}
  audience={audience}
  language={lang}
/>
```

**Step 3: Verify tracker fires**

Run: `npm run dev`
Visit any published article page. Open browser DevTools > Network tab. Expected: A POST to `/api/analytics/track` with status 200.

**Step 4: Commit**

```bash
git add components/docs/analytics-tracker.tsx app/\(docs\)/\[projectSlug\]/\[articleSlug\]/page.tsx
git commit -m "feat(analytics): add client-side page view tracker on public article pages"
```

---

### Task 4: Search Event Tracking

**Files:**
- Modify: `app/api/search/route.ts:1-37` (add search event logging)

**Step 1: Add search tracking to the existing search API**

In `app/api/search/route.ts`, after the articles query succeeds, fire a search event insert:

```typescript
// After line 32 (after `const { data: articles } = await articlesQuery;`), add:

// Log search event asynchronously (don't block response)
const searchProjectId = projectId;
supabase.from("search_events").insert({
  project_id: searchProjectId,
  query: query,
  results_count: articles?.length ?? 0,
  audience: audience ?? null,
  language: lang ?? null,
}).then(() => {});
```

Note: The `lang` param needs to be read from searchParams. Add it:

```typescript
// At line 9, add:
const lang = searchParams.get("lang");
```

**Step 2: Verify search events are logged**

Run: `npm run dev`
Use the search dialog on a public docs page. After searching, check the `search_events` table in Supabase.

**Step 3: Commit**

```bash
git add app/api/search/route.ts
git commit -m "feat(analytics): log search events with query and result count"
```

---

### Task 5: Install Recharts (shadcn Charts)

**Files:**
- Modify: `package.json` (add recharts dependency)
- Create: `components/ui/chart.tsx` (shadcn chart component)

**Step 1: Add shadcn chart component and recharts**

```bash
cd /Users/Tim/Documents/Respeak_Experiments/vidtodoc
pnpm add recharts
npx shadcn@latest add chart
```

**Step 2: Verify build passes**

```bash
pnpm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add components/ui/chart.tsx package.json pnpm-lock.yaml
git commit -m "chore: add recharts and shadcn chart component"
```

---

### Task 6: Analytics Aggregation Queries

**Files:**
- Create: `lib/queries/analytics.ts`

**Step 1: Write the aggregation query helpers**

```typescript
// lib/queries/analytics.ts
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
```

**Step 2: Commit**

```bash
git add lib/queries/analytics.ts
git commit -m "feat(analytics): add server-side aggregation query helpers"
```

---

### Task 7: Database Functions for Analytics Aggregation

**Files:**
- Create: `supabase/migrations/20260212000001_analytics_functions.sql`

**Step 1: Write the RPC functions**

```sql
-- Daily page views grouped by date
create or replace function analytics_daily_views(
  p_project_id uuid,
  p_since timestamptz
)
returns table (day date, views bigint) as $$
  select
    date_trunc('day', created_at)::date as day,
    count(*) as views
  from page_views
  where project_id = p_project_id
    and created_at >= p_since
  group by day
  order by day;
$$ language sql security definer;

-- Top articles by view count
create or replace function analytics_top_articles(
  p_project_id uuid,
  p_since timestamptz,
  p_limit integer
)
returns table (article_slug text, article_title text, audience text, views bigint) as $$
  select
    pv.article_slug,
    coalesce(a.title, pv.article_slug) as article_title,
    pv.audience,
    count(*) as views
  from page_views pv
  left join articles a on a.id = pv.article_id
  where pv.project_id = p_project_id
    and pv.created_at >= p_since
  group by pv.article_slug, a.title, pv.audience
  order by views desc
  limit p_limit;
$$ language sql security definer;

-- Audience breakdown (pie/bar chart)
create or replace function analytics_audience_breakdown(
  p_project_id uuid,
  p_since timestamptz
)
returns table (audience text, views bigint) as $$
  select
    coalesce(audience, 'unknown') as audience,
    count(*) as views
  from page_views
  where project_id = p_project_id
    and created_at >= p_since
  group by audience
  order by views desc;
$$ language sql security definer;

-- Language breakdown
create or replace function analytics_language_breakdown(
  p_project_id uuid,
  p_since timestamptz
)
returns table (language text, views bigint) as $$
  select
    coalesce(language, 'unknown') as language,
    count(*) as views
  from page_views
  where project_id = p_project_id
    and created_at >= p_since
  group by language
  order by views desc;
$$ language sql security definer;

-- Top search queries
create or replace function analytics_top_searches(
  p_project_id uuid,
  p_since timestamptz,
  p_limit integer
)
returns table (query text, count bigint, avg_results numeric) as $$
  select
    query,
    count(*) as count,
    round(avg(results_count), 1) as avg_results
  from search_events
  where project_id = p_project_id
    and created_at >= p_since
  group by query
  order by count desc
  limit p_limit;
$$ language sql security definer;

-- Zero-result searches (content gaps)
create or replace function analytics_zero_result_searches(
  p_project_id uuid,
  p_since timestamptz,
  p_limit integer
)
returns table (query text, count bigint) as $$
  select
    query,
    count(*) as count
  from search_events
  where project_id = p_project_id
    and created_at >= p_since
    and results_count = 0
  group by query
  order by count desc
  limit p_limit;
$$ language sql security definer;
```

**Step 2: Apply migration**

Run: `cd /Users/Tim/Documents/Respeak_Experiments/vidtodoc && supabase db reset`
Expected: Clean reset with all functions created.

**Step 3: Commit**

```bash
git add supabase/migrations/20260212000001_analytics_functions.sql
git commit -m "feat(analytics): add PostgreSQL aggregation functions for dashboard charts"
```

---

### Task 8: Analytics Dashboard Page

**Files:**
- Create: `app/(dashboard)/project/[slug]/analytics/page.tsx`
- Create: `components/dashboard/analytics-charts.tsx`

**Step 1: Create the analytics charts client component**

```typescript
// components/dashboard/analytics-charts.tsx
"use client";

import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
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
```

**Step 2: Create the analytics page**

```typescript
// app/(dashboard)/project/[slug]/analytics/page.tsx
import { createClient } from "@/lib/supabase/server";
import { getPageViewStats, getSearchStats, type TimeRange } from "@/lib/queries/analytics";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { AnalyticsCharts } from "@/components/dashboard/analytics-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Search, TrendingUp, Globe } from "lucide-react";
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
        <div className="grid gap-4 md:grid-cols-4">
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
              <CardTitle className="text-sm font-medium">Top Audience</CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">
                {pageViewStats.audienceBreakdown[0]?.audience ?? "—"}
              </div>
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
          audienceBreakdown={pageViewStats.audienceBreakdown}
          languageBreakdown={pageViewStats.languageBreakdown}
          topQueries={searchStats.topQueries}
          zeroResultQueries={searchStats.zeroResultQueries}
        />
      </div>
    </>
  );
}
```

**Step 3: Verify the page renders**

Run: `npm run dev`
Visit `http://localhost:3000/project/<slug>/analytics`. Expected: Summary cards + chart areas (showing empty states if no data).

**Step 4: Commit**

```bash
git add app/\(dashboard\)/project/\[slug\]/analytics/ components/dashboard/analytics-charts.tsx
git commit -m "feat(analytics): add analytics dashboard page with charts and time range selector"
```

---

### Task 9: Wire Analytics into Dashboard Navigation

**Files:**
- Modify: `components/dashboard/app-sidebar.tsx` (add Analytics nav item)
- Modify: `app/(dashboard)/project/[slug]/page.tsx:178-189` (replace "Coming soon" card with link)

**Step 1: Add Analytics nav item to sidebar**

In `components/dashboard/app-sidebar.tsx`, add to the `projectNav` array (after the "Articles" entry):

```typescript
import { BarChart3 } from "lucide-react";

// In the projectNav array, add after the Articles item:
{
  title: "Analytics",
  href: `/project/${currentProjectSlug}/analytics`,
  icon: BarChart3,
},
```

**Step 2: Replace "Coming soon" card on overview page**

In `app/(dashboard)/project/[slug]/page.tsx`, replace the Analytics "Coming soon" card (lines ~178-189) with a link to the analytics page:

```typescript
import { BarChart3 } from "lucide-react";

// Replace the Analytics card:
<Card>
  <CardHeader>
    <CardTitle className="text-base">Analytics</CardTitle>
    <CardDescription>Docs performance</CardDescription>
  </CardHeader>
  <CardContent>
    <Button variant="outline" className="justify-start w-full" asChild>
      <Link href={`/project/${slug}/analytics`}>
        <BarChart3 className="mr-2 size-4" />
        View Analytics
      </Link>
    </Button>
  </CardContent>
</Card>
```

**Step 3: Verify navigation works**

Run: `npm run dev`
Click "Analytics" in the sidebar. Expected: Navigates to analytics page. Click "View Analytics" on overview. Expected: Same destination.

**Step 4: Commit**

```bash
git add components/dashboard/app-sidebar.tsx app/\(dashboard\)/project/\[slug\]/page.tsx
git commit -m "feat(analytics): add analytics to dashboard sidebar and overview quick actions"
```

---

## Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Database migration: page_views + search_events tables | — |
| 2 | POST /api/analytics/track endpoint | 1 |
| 3 | Client-side page view tracker | 2 |
| 4 | Search event tracking in existing search API | 1 |
| 5 | Install Recharts + shadcn chart component | — |
| 6 | Analytics aggregation query helpers | 7 |
| 7 | Database functions for aggregation (RPC) | 1 |
| 8 | Analytics dashboard page with charts | 5, 6, 7 |
| 9 | Wire analytics into sidebar + overview | 8 |
