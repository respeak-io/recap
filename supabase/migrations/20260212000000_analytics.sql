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
