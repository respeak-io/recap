-- Public docs must be able to show videos to anonymous readers.
--
-- Until now the `videos` table was readable by org members only and the private
-- `videos` storage bucket by authenticated users only, so public docs pages
-- rendered without their videos for anyone who was not logged in.
--
-- Scope: ready videos of public projects (the same visibility rule as the
-- project itself). The bucket stays private; readers get short-lived signed
-- URLs generated per request (lib/docs/videos.ts).

create policy "videos_public_select" on videos for select using (
  status = 'ready'
  and exists (
    select 1 from projects
    where projects.id = videos.project_id and projects.is_public
  )
);

-- Storage paths have more than one layout (`<project>/…`, `<org>/<project>/…`),
-- so match objects through `videos.storage_path` instead of parsing the path.
create policy "videos_public_read" on storage.objects for select using (
  bucket_id = 'videos'
  and exists (
    select 1
    from public.videos v
    join public.projects p on p.id = v.project_id
    where v.storage_path = storage.objects.name
      and v.status = 'ready'
      and p.is_public
  )
);

-- Keeps the storage policy lookup cheap.
create index if not exists idx_videos_storage_path on videos (storage_path);
