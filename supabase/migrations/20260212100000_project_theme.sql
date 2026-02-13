-- Add theme JSONB column to projects
-- Structure:
-- {
--   "logo_path": "string | null",          -- Storage path in assets bucket
--   "favicon_path": "string | null",       -- Storage path in assets bucket
--   "colors": {
--     "primary": "#hex",                   -- Brand primary color
--     "primary_foreground": "#hex",        -- Text on primary
--     "background": "#hex",               -- Page background
--     "foreground": "#hex",               -- Body text color
--     "accent": "#hex",                   -- Accent/link color
--     "sidebar_background": "#hex",       -- Sidebar bg
--     "sidebar_foreground": "#hex"        -- Sidebar text
--   },
--   "font": "inter" | "system" | "geist" | "ibm-plex" | "source-serif",
--   "custom_css": "string | null",        -- Raw CSS overrides
--   "hide_powered_by": boolean
-- }
alter table projects add column theme jsonb not null default '{}';

-- Create assets storage bucket (public, since logos/favicons are shown on public docs)
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true);

-- Anyone can read public assets
create policy "assets_public_read" on storage.objects for select
using (bucket_id = 'assets');

-- Authenticated users can upload assets
create policy "assets_upload" on storage.objects for insert
with check (
  bucket_id = 'assets'
  and auth.role() = 'authenticated'
);

-- Authenticated users can update their assets
create policy "assets_update" on storage.objects for update
using (
  bucket_id = 'assets'
  and auth.role() = 'authenticated'
);

-- Authenticated users can delete their assets
create policy "assets_delete" on storage.objects for delete
using (
  bucket_id = 'assets'
  and auth.role() = 'authenticated'
);
