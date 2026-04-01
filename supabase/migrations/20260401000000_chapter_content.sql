-- Add content fields to chapters for editable category pages
alter table chapters add column content_json jsonb not null default '{}';
