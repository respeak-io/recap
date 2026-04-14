-- Add keywords columns to articles and chapters
alter table articles add column keywords text[] not null default '{}';
alter table chapters add column keywords text[] not null default '{}';

-- GIN indexes for array operations (future filter syntax)
create index articles_keywords_gin on articles using gin(keywords);
create index chapters_keywords_gin on chapters using gin(keywords);

-- Drop the existing stored generated fts column and its index
drop index if exists articles_fts_idx;
alter table articles drop column fts cascade;

-- Re-create fts as a regular (trigger-populated) tsvector column
alter table articles add column fts tsvector;
create index articles_fts_idx on articles using gin(fts);

-- Function that builds the fts vector for a single article row
create or replace function articles_build_fts(a articles)
returns tsvector
language sql
volatile
as $$
  select
    setweight(to_tsvector('english', coalesce(a.title, '')), 'A')
    || setweight(
         to_tsvector('english', array_to_string(coalesce(a.keywords, '{}'::text[]), ' ')),
         'A'
       )
    || setweight(to_tsvector('english', coalesce(a.content_text, '')), 'B')
    || setweight(
         to_tsvector(
           'english',
           coalesce(
             (select array_to_string(c.keywords, ' ')
                from chapters c
                where c.id = a.chapter_id),
             ''
           )
         ),
         'C'
       );
$$;

-- Trigger on articles: rebuild fts when any contributing field changes
create or replace function articles_fts_trigger()
returns trigger
language plpgsql
as $$
begin
  new.fts := articles_build_fts(new);
  return new;
end;
$$;

create trigger articles_fts_update
  before insert or update of title, content_text, keywords, chapter_id
  on articles
  for each row
  execute function articles_fts_trigger();

-- Trigger on chapters: when keywords change, re-index affected articles
create or replace function chapters_keywords_propagate_trigger()
returns trigger
language plpgsql
as $$
begin
  if new.keywords is distinct from old.keywords then
    update articles
    set fts = articles_build_fts(articles)
    where chapter_id = new.id;
  end if;
  return new;
end;
$$;

create trigger chapters_keywords_propagate
  after update of keywords
  on chapters
  for each row
  execute function chapters_keywords_propagate_trigger();

-- Note: when chapters_keywords_propagate runs `update articles set fts = ...`,
-- the articles_fts_update trigger does NOT re-fire because that trigger has a
-- column-level filter (`update of title, content_text, keywords, chapter_id`)
-- and `fts` is not in that list. Scale assumption: a chapter holds 10–50
-- articles in normal use, so the cascade is bounded and cheap.

-- Backfill fts for all existing articles.
-- articles_updated_at trigger (before update on articles) exists and would
-- corrupt updated_at for every row; disable it for the duration of the backfill.
alter table articles disable trigger articles_updated_at;
update articles set fts = articles_build_fts(articles);
alter table articles enable trigger articles_updated_at;
