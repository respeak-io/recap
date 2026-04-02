-- Add translations JSONB to projects for multilingual title/subtitle
-- Same pattern as chapters.translations
-- Structure: { "de": { "name": "...", "subtitle": "..." }, "fr": { ... } }
alter table projects add column translations jsonb;
