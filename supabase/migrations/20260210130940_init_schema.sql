-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Organizations
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- Organization members
create table organization_members (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Projects (a docs site)
create table projects (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  is_public boolean not null default true,
  password_hash text,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

-- Chapters (sidebar grouping)
create table chapters (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  slug text not null,
  "order" integer not null default 0,
  unique (project_id, slug)
);

-- Videos
create table videos (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  storage_path text,
  vtt_content text,
  duration_seconds integer,
  status text not null default 'uploading' check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

-- Video segments (intermediate extraction from Gemini)
create table video_segments (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references videos(id) on delete cascade,
  start_time numeric not null,
  end_time numeric not null,
  spoken_content text,
  visual_context text,
  "order" integer not null default 0
);

-- Articles
create table articles (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  video_id uuid references videos(id) on delete set null,
  chapter_id uuid references chapters(id) on delete set null,
  title text not null,
  slug text not null,
  audience text not null default 'developers',
  content_json jsonb not null default '{}',
  content_text text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, audience, slug)
);

-- Full-text search index on articles
alter table articles add column fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content_text, '')), 'B')
  ) stored;

create index articles_fts_idx on articles using gin(fts);

-- Full-text search index on video VTT content
alter table videos add column fts tsvector
  generated always as (
    to_tsvector('english', coalesce(vtt_content, ''))
  ) stored;

create index videos_fts_idx on videos using gin(fts);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger articles_updated_at
  before update on articles
  for each row execute function update_updated_at();

-- Auto-create organization on user signup
create or replace function handle_new_user()
returns trigger as $$
declare
  org_id uuid;
begin
  insert into organizations (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.id::text
  )
  returning id into org_id;

  insert into organization_members (org_id, user_id, role)
  values (org_id, new.id, 'owner');

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
