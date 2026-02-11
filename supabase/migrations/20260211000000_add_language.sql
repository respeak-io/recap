-- Add language column to articles
alter table articles add column language text not null default 'en';

-- Update unique constraint to include language
alter table articles drop constraint articles_project_id_audience_slug_key;
alter table articles add constraint articles_project_id_audience_language_slug_key
  unique (project_id, audience, language, slug);

-- Add VTT storage per language on videos (JSON map of lang -> VTT string)
alter table videos add column vtt_languages jsonb not null default '{}';
