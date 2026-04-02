-- Images table for the media gallery
create table images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  alt_text text not null default '',
  width integer,
  height integer,
  size_bytes integer,
  created_at timestamptz not null default now()
);

create index images_project_id_idx on images (project_id);

-- Video i18n: language tag and group id so multiple language variants share a group
alter table videos add column language text not null default 'en';
alter table videos add column video_group_id uuid not null default gen_random_uuid();
alter table videos add constraint uq_video_group_language unique (video_group_id, language);

-- RLS for images table (same pattern as videos)
alter table images enable row level security;

-- Org members can select images in their projects
create policy "images_select" on images for select using (
  exists (select 1 from projects where projects.id = project_id and is_org_member(projects.org_id))
);

-- Public can select images (needed for public docs pages)
create policy "images_public_select" on images for select using (
  exists (select 1 from projects where projects.id = project_id and projects.is_public)
);

-- Org writers can insert images
create policy "images_insert" on images for insert with check (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);

-- Org writers can update images
create policy "images_update" on images for update using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);

-- Org writers can delete images
create policy "images_delete" on images for delete using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
