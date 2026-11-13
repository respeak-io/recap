-- Ranked docs search used by /api/search.
--
-- Replaces the previous two-stage search (unranked strict AND via
-- websearch_to_tsquery, then a ranked OR fallback). Articles match when they
-- contain ANY of the terms; they are ordered by:
--   1. how many distinct terms they contain (coverage),
--   2. + 2 × title relevance (a title hit is the strongest signal),
--   3. + length-normalized body relevance (tie-breaker).
-- Terms are prefix-matched (`term:*`), which also covers the half-typed last
-- word in search-as-you-type. The caller removes stop words; this function
-- strips anything but letters and digits so input can never form tsquery syntax.

create or replace function search_articles_ranked(
  p_project_id uuid,
  p_terms text[],
  p_lang text,
  p_limit int default 10
) returns table (
  id uuid,
  title text,
  slug text,
  content_text text,
  keywords text[],
  project_id uuid,
  chapters jsonb,
  matched_terms int
)
language sql
stable
as $$
  with terms as (
    select distinct lower(regexp_replace(t, '[^[:alnum:]]', '', 'g')) as term
    from unnest(p_terms) as t
  ),
  usable as (
    select term, to_tsquery('simple', term || ':*') as tq
    from terms
    where term <> ''
  ),
  any_query as (
    select to_tsquery('simple', string_agg(term || ':*', ' | ')) as tq from usable
  )
  select
    a.id, a.title, a.slug, a.content_text, a.keywords, a.project_id,
    (select jsonb_build_object('title', c.title, 'keywords', c.keywords)
       from chapters c
       where c.id = a.chapter_id) as chapters,
    (select count(*) from usable u where a.fts @@ u.tq)::int as matched_terms
  from articles a, any_query q
  where q.tq is not null
    and a.project_id = p_project_id
    and a.status = 'published'
    and (p_lang is null or a.language = p_lang)
    and a.fts @@ q.tq
  order by
    (select count(*) from usable u where a.fts @@ u.tq)
      + 2 * ts_rank_cd(to_tsvector('simple', a.title), q.tq)
      + ts_rank_cd(a.fts, q.tq, 1) desc,
    a.title
  limit least(greatest(p_limit, 1), 50);
$$;
