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
