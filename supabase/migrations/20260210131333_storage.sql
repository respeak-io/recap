-- Create videos bucket
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false);

-- Storage policies: authenticated users can upload videos
create policy "videos_upload" on storage.objects for insert
with check (
  bucket_id = 'videos'
  and auth.role() = 'authenticated'
);

-- Authenticated users can read videos
create policy "videos_read" on storage.objects for select
using (
  bucket_id = 'videos'
  and auth.role() = 'authenticated'
);
