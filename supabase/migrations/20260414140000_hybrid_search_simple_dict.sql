-- 1. Rebuild articles_build_fts with 'simple' dictionary
--    (language-agnostic — no stemming, no stop words, multilingual-safe)
create or replace function articles_build_fts(a articles)
returns tsvector
language sql
volatile
as $$
  select
    setweight(to_tsvector('simple', coalesce(a.title, '')), 'A')
    || setweight(
         to_tsvector('simple', array_to_string(coalesce(a.keywords, '{}'::text[]), ' ')),
         'A'
       )
    || setweight(to_tsvector('simple', coalesce(a.content_text, '')), 'B')
    || setweight(
         to_tsvector(
           'simple',
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

-- 2. Rebuild fts for all existing articles, without bumping updated_at
alter table articles disable trigger articles_updated_at;
update articles set fts = articles_build_fts(articles);
alter table articles enable trigger articles_updated_at;

-- 3. RPC for OR-joined fallback search, ranked by ts_rank_cd
create or replace function search_articles_loose(
  p_project_id uuid,
  p_query text,
  p_lang text,
  p_limit int default 10
) returns table (
  id uuid,
  title text,
  slug text,
  content_text text,
  keywords text[],
  project_id uuid,
  chapters jsonb
)
language sql
stable
as $$
  select
    a.id, a.title, a.slug, a.content_text, a.keywords, a.project_id,
    (select jsonb_build_object('title', c.title, 'keywords', c.keywords)
       from chapters c
       where c.id = a.chapter_id) as chapters
  from articles a
  where a.project_id = p_project_id
    and a.status = 'published'
    and (p_lang is null or a.language = p_lang)
    and a.fts @@ to_tsquery('simple', p_query)
  order by ts_rank_cd(a.fts, to_tsquery('simple', p_query)) desc
  limit p_limit;
$$;

-- 4. Telemetry column on search_events
alter table search_events add column if not exists fallback_level text;
