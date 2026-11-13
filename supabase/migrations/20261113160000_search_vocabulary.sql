-- Search vocabulary of a project: every distinct word in the search index of
-- its published articles (optionally one language).
--
-- /api/search uses it to split German compounds that never occur in the docs
-- into words that do ("akteneinträge" -> "akte" + "einträge"), because the
-- `simple` text-search config only matches word prefixes.
--
-- Returns one text[] rather than `setof text`: PostgREST caps result rows
-- (max-rows, 1000 by default), which would silently truncate the vocabulary.
--
-- Runs with the caller's rights (not security definer): ts_stat executes the
-- inner query as the caller, so RLS limits anonymous visitors to published
-- articles of public projects.

create or replace function docs_search_vocabulary(p_project_id uuid, p_lang text default null)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(word order by word), '{}')
  from ts_stat(format(
    'select fts from articles where project_id = %L and status = %L%s',
    p_project_id,
    'published',
    case when p_lang is null then '' else format(' and language = %L', p_lang) end
  ))
  where length(word) >= 3;
$$;
