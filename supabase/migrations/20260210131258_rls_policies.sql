-- Enable RLS on all tables
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table projects enable row level security;
alter table chapters enable row level security;
alter table videos enable row level security;
alter table video_segments enable row level security;
alter table articles enable row level security;

-- Helper: check if user is member of org
create or replace function is_org_member(org uuid)
returns boolean as $$
  select exists (
    select 1 from organization_members
    where organization_members.org_id = org
    and organization_members.user_id = auth.uid()
  );
$$ language sql security definer;

-- Helper: check if user has write role in org
create or replace function is_org_writer(org uuid)
returns boolean as $$
  select exists (
    select 1 from organization_members
    where organization_members.org_id = org
    and organization_members.user_id = auth.uid()
    and organization_members.role in ('owner', 'editor')
  );
$$ language sql security definer;

-- Organizations: members can read, owners can update
create policy "org_select" on organizations for select using (is_org_member(id));
create policy "org_update" on organizations for update using (
  exists (
    select 1 from organization_members
    where org_id = organizations.id
    and user_id = auth.uid()
    and role = 'owner'
  )
);

-- Organization members: members can read their own org
create policy "members_select" on organization_members for select using (is_org_member(org_id));

-- Projects: org members can read, writers can insert/update/delete
create policy "projects_select" on projects for select using (is_org_member(org_id));
create policy "projects_insert" on projects for insert with check (is_org_writer(org_id));
create policy "projects_update" on projects for update using (is_org_writer(org_id));
create policy "projects_delete" on projects for delete using (is_org_writer(org_id));

-- Public project access (for published docs site, no auth required)
create policy "projects_public_select" on projects for select using (is_public = true);

-- Chapters: access through project's org
create policy "chapters_select" on chapters for select using (
  exists (select 1 from projects where projects.id = project_id and (is_org_member(projects.org_id) or projects.is_public))
);
create policy "chapters_insert" on chapters for insert with check (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "chapters_update" on chapters for update using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "chapters_delete" on chapters for delete using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);

-- Videos: access through project's org
create policy "videos_select" on videos for select using (
  exists (select 1 from projects where projects.id = project_id and is_org_member(projects.org_id))
);
create policy "videos_insert" on videos for insert with check (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "videos_update" on videos for update using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "videos_delete" on videos for delete using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);

-- Video segments: access through video's project's org
create policy "segments_select" on video_segments for select using (
  exists (
    select 1 from videos
    join projects on projects.id = videos.project_id
    where videos.id = video_id and is_org_member(projects.org_id)
  )
);
create policy "segments_insert" on video_segments for insert with check (
  exists (
    select 1 from videos
    join projects on projects.id = videos.project_id
    where videos.id = video_id and is_org_writer(projects.org_id)
  )
);

-- Articles: org members can read, writers can modify, public can read published
create policy "articles_select" on articles for select using (
  exists (select 1 from projects where projects.id = project_id and is_org_member(projects.org_id))
);
create policy "articles_public_select" on articles for select using (
  status = 'published' and exists (select 1 from projects where projects.id = project_id and is_public)
);
create policy "articles_insert" on articles for insert with check (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "articles_update" on articles for update using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "articles_delete" on articles for delete using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
