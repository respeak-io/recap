-- Processing jobs table: tracks async video processing progress
create table processing_jobs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  step text,
  step_message text,
  progress numeric not null default 0,
  error_message text,
  languages text[] not null default '{en}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger processing_jobs_updated_at
  before update on processing_jobs
  for each row execute function update_updated_at();

-- RLS
alter table processing_jobs enable row level security;

create policy "processing_jobs_select" on processing_jobs for select using (
  exists (select 1 from projects where projects.id = project_id and is_org_member(projects.org_id))
);
create policy "processing_jobs_insert" on processing_jobs for insert with check (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "processing_jobs_update" on processing_jobs for update using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
