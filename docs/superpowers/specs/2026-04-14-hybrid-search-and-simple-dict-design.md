# Hybrid Search (AND→OR) + `simple` FTS Dictionary

**Date:** 2026-04-14
**Status:** Design approved, pending implementation plan
**Related:** builds on the FTS groundwork in `2026-04-14-search-keywords-and-full-page-ai-answers-design.md`

## Problem

Two compounding issues in the current search:

1. **The FTS is indexed with the `english` dictionary**, but a significant fraction of content is German (and multilingual content is a first-class feature of the platform). English stemming mistokenizes German words, so terms like "Berechtigung" or "bekommen" end up with incorrect or unrecognized stems. This silently degrades recall for non-English content.
2. **`websearch_to_tsquery` AND-joins multi-word queries.** A query like "chat zugriff bekommen" requires every token to match. Even when the document obviously covers the topic ("chat-zugriff" is prominent in the page), the presence of one unknown-to-the-doc word (`bekommen`) drops it to zero results. Longer, more natural-language queries systematically perform worse than short ones — the exact opposite of what users expect.

Together these produce the user-observed bug: `/experte/benutzer-und-rollen#zusatzliche-berechtigungen` contains "chat-zugriff" but is not returned for the search "chat zugriff bekommen", even though "chat zugriff" alone finds it.

## Goals

- Searching with longer, natural-language phrases yields useful results as long as *any* of the query words exist in some document.
- German (and other non-English) content tokenizes correctly and is findable.
- When the fallback is used, the user understands why the results may be less precise.
- Telemetry captures fallback usage so we can decide later whether to add trigram fuzzy matching (separate project).

## Non-goals

- Trigram / fuzzy / typo-tolerant matching (`pg_trgm`). Deferred until telemetry proves it's needed.
- Synonym dictionaries, custom stop words, language-specific config per article.
- Phrase matching, proximity operators, boosted fields beyond what already exists.
- UI changes beyond a single inline hint banner.

## Design

### 1. FTS dictionary: `english` → `simple`

The current `articles_build_fts(a articles)` function (defined in migration `20260414120000_add_keywords_and_rebuild_fts.sql`) uses `to_tsvector('english', ...)` for title, article keywords, content_text, and chapter keywords. All four `to_tsvector(...)` calls are switched to `to_tsvector('simple', ...)`.

`simple` is Postgres's language-agnostic config. It lowercases, splits on whitespace and punctuation (so `chat-zugriff` still tokenizes to `chat` and `zugriff`), and performs no stemming and no stop-word removal. Every token is stored verbatim.

**Effect.** German content indexes correctly. The `english` bias disappears. The per-language trade-off: no plural/inflection collapsing, so `rolle` and `rollen` are separate tokens. This is acceptable because the hybrid query in Section 2 compensates: a user searching "rollen" whose matches are all `rolle` will still fall through to the OR branch, which doesn't require *every* token to be present.

**Query side.** In `app/api/search/route.ts`, the `.textSearch(...)` call changes from `{ type: "websearch", config: "english" }` to `{ config: "simple" }`. The new `search_articles_loose` RPC (Section 2) also uses `simple` internally.

**Migration approach.** A new migration rebuilds the `fts` column once for all existing articles (same backfill pattern as the prior migration: disable `articles_updated_at`, `update articles set fts = articles_build_fts(articles)`, re-enable).

### 2. Hybrid AND→OR search

The search route in `app/api/search/route.ts` runs a two-stage query:

**Stage 1 — strict (AND):** Same as today — `textSearch("fts", cleanedQuery, { type: "websearch", config: "simple" })`, `.limit(10)`. Because `websearch_to_tsquery` ANDs multi-word queries, this returns documents that match *all* tokens with standard FTS ranking.

If Stage 1 returns ≥1 row, that's the response. `fallback: null`.

**Stage 2 — loose (OR):** Only runs if Stage 1 returns 0 rows. The route calls a new Postgres RPC:

```sql
create or replace function search_articles_loose(
  p_project_id uuid,
  p_query text,       -- pre-sanitized OR tsquery, e.g. 'chat | zugriff | bekommen'
  p_lang text,
  p_limit int default 10
) returns table (
  id uuid, title text, slug text, content_text text,
  keywords text[], project_id uuid,
  chapters jsonb
)
language sql stable as $$
  select
    a.id, a.title, a.slug, a.content_text, a.keywords, a.project_id,
    (select to_jsonb(c) from chapters c where c.id = a.chapter_id) as chapters
  from articles a
  where a.project_id = p_project_id
    and a.status = 'published'
    and (p_lang is null or a.language = p_lang)
    and a.fts @@ to_tsquery('simple', p_query)
  order by ts_rank_cd(a.fts, to_tsquery('simple', p_query)) desc
  limit p_limit;
$$;
```

**Why an RPC.** Supabase's `.textSearch()` client helper wraps `websearch_to_tsquery` (AND). To get an OR-joined query that also sorts by `ts_rank_cd`, we need raw SQL. The RPC keeps the app-side code small and lets the query planner optimize.

**Token sanitization.** Before constructing the OR query, the route must sanitize each token to avoid `to_tsquery` syntax errors. Tokens are produced by:

```typescript
const tokens = cleanedQuery
  .split(/\s+/)
  .map(t => t.replace(/[^\p{L}\p{N}_-]/gu, ""))  // keep letters, numbers, _ and -
  .filter(t => t.length > 0);

if (tokens.length === 0) return { articles: [], fallback: null };

const orQuery = tokens.join(" | ");
```

**Chapter join shape.** The RPC returns a single `chapters jsonb` object (matching what Supabase's nested-select produces for a `chapter_id` FK), so the frontend needs no shape change. Confirm during implementation that `{ title: "...", keywords: [...] }` fits the existing `SearchResult["chapters"]` type; if not, extend the select clause in the RPC to project only those fields.

**Route response shape** changes minimally:

```typescript
{
  articles: SearchResult[],
  fallback: null | "or"
}
```

Consumer code (just `search-dialog.tsx`) reads `fallback` to drive Section 3.

**Edge cases.**
- Query with only punctuation / special chars → `tokens.length === 0` → return empty immediately, log `results_count: 0` with `fallback_level: null`.
- Stage 2 returns zero rows → `articles: [], fallback: null` (we don't log `"none"` as a fallback level — it collides semantically with "no fallback ran").
- Supabase error in either stage → logged via `console.error`, route returns `{ articles: [], fallback: null }` (same graceful-degradation behavior as today).

### 3. UI hint for fallback results

In `components/docs/search-dialog.tsx`:

Add `fallback` to the state the dialog tracks alongside `results` and `aiAnswer`:

```tsx
const [fallback, setFallback] = useState<"or" | null>(null);
// ...after fetch:
setFallback(data.fallback ?? null);
```

Above the results list, render a single-line hint when fallback occurred *and* there are results to show:

```tsx
{fallback === "or" && results.length > 0 && (
  <div className="px-3 py-2 text-xs text-muted-foreground border-b">
    Keine genauen Treffer für „{query}". Ähnliche Resultate:
  </div>
)}
```

**Styling.** Uses existing Tailwind primitives (`text-muted-foreground`, `text-xs`, `border-b`) — matches the visual weight of other dialog chrome.

**i18n.** The search dialog currently mixes hardcoded German and English strings; the hint follows that pattern. If during implementation a translation mechanism is already wired (e.g. a dictionary keyed on `currentLang`), add the string there. Otherwise it stays hardcoded as a German-leaning default with an English fallback:

```typescript
const hint = currentLang === "en"
  ? `No exact matches for "${query}". Similar results:`
  : `Keine genauen Treffer für „${query}". Ähnliche Resultate:`;
```

**Explicitly out of scope.**
- Per-result "similar" badges.
- Split sections ("exact matches" / "similar matches").
- "Did you mean?" spelling suggestions.
- Hint when results are empty — the existing "no results" state already handles that.

### 4. Telemetry

Extend the `search_events` table with one nullable column:

```sql
alter table search_events
  add column fallback_level text;
-- null: strict AND succeeded (or no results at all)
-- "or": OR fallback produced the returned results
```

No index. Used for ad-hoc analytics, not latency-sensitive queries.

In the search route's existing `search_events.insert(...)` call, add the column:

```typescript
supabase.from("search_events").insert({
  project_id: projectId,
  query: query,                // original user input, unmodified
  results_count: articles.length,
  language: lang ?? null,
  fallback_level: fallback,    // null | "or"
}).then(() => {});
```

**Why the original `query` and not `cleanedQuery`.** Future analysis needs to see what users *actually typed*, including things like stray `#` characters that today get stripped. The normalization pipeline is an implementation detail that could change; the raw input is durable.

**What this enables** (not to be built now):

```sql
-- Fallback ratio over the last 30 days
select
  count(*) filter (where fallback_level is null) as strict,
  count(*) filter (where fallback_level = 'or')  as or_fallback,
  count(*) filter (where results_count = 0)      as zero_results
from search_events
where created_at > now() - interval '30 days';

-- Top zero-result queries — candidates for trigram / typo tolerance
select query, count(*) as n
from search_events
where results_count = 0 and created_at > now() - interval '30 days'
group by query order by n desc limit 50;
```

## Migration plan

One migration file: `supabase/migrations/20260414140000_hybrid_search_simple_dict.sql`.

Contents, in order:
1. `create or replace function articles_build_fts(...)` — same definition as today but with `'simple'` in all four `to_tsvector(...)` calls.
2. Backfill: disable `articles_updated_at` trigger, `update articles set fts = articles_build_fts(articles)`, re-enable.
3. `create or replace function search_articles_loose(...)` — the new RPC.
4. `alter table search_events add column fallback_level text;`

No schema changes to `articles` / `chapters`. No new indexes (existing `articles_fts_idx` GIN index on `fts` continues to serve both stages).

## Testing strategy

- **Unit tests for the route.** Mock Supabase and RPC; verify (a) Stage 1 returns strict results with `fallback: null`; (b) Stage 1 zero → Stage 2 is called; (c) Stage 2 results return `fallback: "or"`; (d) both zero returns `[]` with `fallback: null`; (e) token sanitization strips problematic characters before OR construction; (f) empty-after-sanitization query short-circuits to `[]`.
- **Manual SQL smoke test after migration.** Run in psql against the local DB:
  - Seed an article with `content_text = 'Benutzer können Chat-Zugriff bekommen'`.
  - Confirm `textSearch('fts', 'chat zugriff', {config:'simple'})` returns it.
  - Confirm Stage-1 for `'chat zugriff bekommen'` returns it (all tokens present).
  - Remove "bekommen" from content_text, re-index; confirm Stage-1 drops to 0.
  - Confirm `search_articles_loose(..., 'chat | zugriff | bekommen', ...)` returns it.
- **No integration test for `search_events.fallback_level`.** Telemetry writes are fire-and-forget in the current code; the column existing and the insert-body including the key is sufficient verification.

## Rollout

Single PR, single migration, no feature flag. The dictionary change is a one-time re-index triggered by the migration's backfill, preserving `updated_at`. The hybrid query is a net-superset of the current behavior: every query that returned results before continues to return the same results (Stage 1 is unchanged semantically, just `simple` instead of `english`). Queries that returned zero before may now return OR-fallback results — strictly an improvement in recall.

## Open questions

- None at design time. The RPC return-shape matching with the frontend's `SearchResult` type is a minor risk flagged for the implementer to verify during Task 1.

## Follow-up (not in this spec)

- Analyze 4–6 weeks of `fallback_level` + zero-result data before deciding on trigram.
- If German plural/inflection collapsing becomes important, consider a `german` config for German-only articles (language-aware build function). Not needed today.
