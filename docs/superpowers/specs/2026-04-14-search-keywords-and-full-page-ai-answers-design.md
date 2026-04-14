# Search Keywords & Full-Page AI Answers

**Date:** 2026-04-14
**Status:** Design approved, pending implementation plan

## Problem

The current docs search (`/app/api/search/route.ts`) runs PostgreSQL full-text search over `title` and `content_text`. The AI answer route (`/app/api/search/answer/route.ts`) calls Gemini 2.5-Flash with the top results, but only passes a 1000-character preview per article. Two gaps:

1. **Search lacks user-curated signal.** Authors can't mark articles or chapters with explicit topic keywords, so an article titled "Error handling" never surfaces for the query "bug" even when the author knows it's the right target. Authors want to set these keywords themselves — often generated externally via their own AI pipeline — and have them influence ranking.
2. **AI answers see only previews.** A 1000-character slice often drops the actual answer, so Gemini either hallucinates or gives a generic summary. With a modern long-context model there is no technical reason to truncate the top 3 results.

## Goals

- Authors can add free-form keywords to articles and chapters (UI + v1 API).
- Keywords influence FTS ranking with Title-equivalent weight on the article they annotate, and lower weight for Chapter keywords bubbling into their Articles' search.
- AI answer receives the full `content_text` of exactly the top 3 search results, not 1000-character previews.
- Model upgraded from Gemini 2.5-Flash to Gemini 3 Flash across `generateText()`.
- The `docs-api` slash command (at `.claude/commands/docs-api.md`) documents the new `keywords` field and its normalization rules.

## Non-goals

- AI-generated keywords inside this app. Keyword generation happens externally; this app only exposes a read/write contract.
- `#hashtag` syntax in search queries. Keywords influence ranking via FTS weight; no parser changes.
- Tag facets, canonical tag lists, tag management UI, or cross-org tag normalization.
- Embeddings / vector search.
- Dynamic top-N for AI answer. Hard n=3.
- Auto-regeneration, stale-tracking, or change detection on content edits.

## Design

### 1. Data Model

Two new columns:

- `articles.keywords text[] not null default '{}'`
- `chapters.keywords text[] not null default '{}'`

**Rationale for `text[]` over a separate `keywords` or `article_keywords` table:** Keywords carry no own metadata (no description, no owner, no canonical parent). A normalized schema would add joins, upserts and cascade logic for no gain. Postgres array + GIN is idiomatic, fast, FTS-compatible, and trivially migratable if requirements shift later.

**Validation (enforced server-side in both internal actions and v1 route handlers):**

- Max 20 keywords per article/chapter.
- Max 40 characters per keyword.
- Normalization pipeline applied on write:
  1. `trim()` whitespace.
  2. Strip leading `#` characters.
  3. Lowercase.
  4. Deduplicate (first occurrence wins, order preserved).
  5. Drop empty strings.
- No Unicode restriction — umlauts, emoji, non-Latin scripts allowed.
- Validation failures return `400` with a structured error message identifying the offending keyword and the reason.

**Indexes:**

- `create index articles_keywords_gin on articles using gin(keywords);`
- `create index chapters_keywords_gin on chapters using gin(keywords);`

These support `@>`, `&&`, `?` array operators for potential future filter syntax. They are not on the main search path — that goes through FTS (Section 3).

### 2. Editor UI

#### Article editor (`app/(dashboard)/project/[slug]/article/[articleSlug]/edit/editor-page-client.tsx`)

Properties section gets a third field in order: **Title → Description → Keywords**.

#### Chapter editor

Same three-field ordering on the Chapter edit page. If the Chapter edit UI does not yet expose a Keywords section, it is added alongside the existing Title + Description controls.

#### Shared component

A new `components/editor/keyword-input.tsx` (or `components/docs/keyword-input.tsx` — pick whichever matches the existing file tree; the former is preferred since it's editor-specific) with signature:

```tsx
<KeywordInput value={string[]} onChange={(next: string[]) => void} />
```

Used by both Article and Chapter editors so normalization and limits stay in one place.

**Chip-input behavior:**

- Text input field with rendered chips alongside.
- `Enter` or `,` commits current input as a chip.
- `Backspace` with empty input removes the last chip.
- Each chip has an `×` remove affordance.
- Duplicates are silently discarded (no error).
- On paste: comma-separated content is split into multiple chips.
- At 20 chips the input becomes disabled and shows an inline "Max 20 keywords" hint.
- Normalization (Section 1) is applied as chips are added so the visual state matches what the server will persist.

**Persistence:**

- `keywords` is added to the existing `saveArticleAction` and `saveChapterAction` signatures — no separate save flow, no dedicated save button.
- Form dirty-state includes keyword changes.

### 3. Search Integration

#### FTS column rebuild

Current `articles.fts`:
```
setweight(to_tsvector('english', title), 'A')
|| setweight(to_tsvector('english', content_text), 'B')
```

New `articles.fts` additionally includes:
- Article keywords at weight `A`: `setweight(to_tsvector('english', array_to_string(keywords, ' ')), 'A')`
- Chapter keywords at weight `C`: `setweight(to_tsvector('english', array_to_string(parent_chapter.keywords, ' ')), 'C')`

#### Trigger-based population

Postgres does not permit subqueries inside generated columns, so the FTS column is populated by triggers:

- `articles_fts_update` — `before insert or update of title, content_text, keywords, chapter_id` on `articles`. Reads the current `chapter.keywords` via a scoped subquery and writes the full `tsvector`.
- `chapters_keywords_propagate` — `after update of keywords` on `chapters`. Re-runs the FTS build on every article with that `chapter_id` (bulk `update articles set fts = ... where chapter_id = NEW.id`).

Typical chapters hold 10–50 articles, so re-indexing on chapter keyword change is trivially cheap.

#### Search route

`/app/api/search/route.ts` is largely unchanged — `textSearch("fts", query, { type: "websearch", config: "english" })` still runs. Response shape gains `keywords: string[]` per article for optional UI display. No query parsing changes.

`#` characters in the query string are stripped silently so `#onboarding fehler` and `onboarding fehler` behave identically. This preserves future headroom for a dedicated `#tag` filter syntax without breaking current behavior.

#### Migration

Single migration `supabase/migrations/20260414_add_keywords_and_rebuild_fts.sql`:

1. `alter table articles add column keywords text[] not null default '{}';`
2. `alter table chapters add column keywords text[] not null default '{}';`
3. `create index` GIN indexes on both columns.
4. Drop old `fts` generated column (if generated) or drop old FTS triggers; replace with the new trigger-based build described above.
5. Backfill: `update articles set title = title;` — a no-op write that fires the trigger and rebuilds `fts` for every existing row. (Alternatively `update articles set fts = <inline expression>` if preferred.)
6. No backfill needed for chapter keywords since they default to empty.

### 4. AI Answer with Full Pages + Model Upgrade

#### `/app/api/search/answer/route.ts`

Current behavior: top-N articles, each truncated to `content_text.slice(0, 1000)`, passed to `gemini-2.5-flash`.

New behavior:

- **Input contract:** exactly top 3 articles from the search response. No fallback to fewer, no dynamic N.
- **Per-article payload:**
  - `title`
  - `chapter.title`
  - `keywords` (article's own) + chapter's `keywords`
  - Full `content_text` (no slice).
- **Hard guardrail:** if `content_text.length > 100_000`, truncate to 100 000 chars and append a prompt-level note `"[article truncated at 100k chars]"`. This cap is defensive against pathological inputs; normal articles are far smaller.

#### Prompt update

The existing prompt tells the model it's receiving snippets. The new prompt states explicitly: "The following articles are provided in full. Quote specifically, cite titles, use `[video:MM:SS]` timestamps where present."

Timestamp conventions (`[video:MM:SS]`) and streaming behavior are unchanged.

#### Model upgrade — Gemini 3 Flash

Update the model identifier in `lib/ai/generate.ts` (and `lib/ai/gemini.ts` if relevant) from `gemini-2.5-flash` to Gemini 3 Flash.

**Model ID verification required before implementation.** The exact string (e.g. `gemini-3-flash`, `gemini-3.0-flash`, or `gemini-flash-latest`) is not yet present in Context7's indexed Google Gen AI SDK docs. Before code lands, the implementer must verify the current ID via:

- https://ai.google.dev/gemini-api/docs/models — canonical model list
- https://googleapis.github.io/js-genai — SDK reference

If Gemini 3 Flash is not yet GA at implementation time, fall back to the latest stable Gemini model that exceeds 2.5-Flash (e.g. `gemini-flash-latest` alias), log the choice in the implementation plan, and flag it for the user.

Because `generateText()` is the central binding, the upgrade applies to all callers (video pipeline, translation, search answer). This is intentional: one consistent model across AI calls. If any callsite later needs to pin a specific older model, the implementer can add an optional `{ model?: string }` override parameter to `generateText()` — not required at this point.

### 5. v1 API + Skill Documentation

#### Endpoint surface

No new endpoints. Existing v1 routes are extended:

- `GET /api/v1/projects/:slug/articles/:articleSlug` — response gains `keywords: string[]`.
- `PATCH /api/v1/projects/:slug/articles/:articleSlug` — body accepts optional `keywords?: string[]`.
- `GET /api/v1/projects/:slug/chapters/:chapterSlug` — response gains `keywords: string[]`.
- `PATCH /api/v1/projects/:slug/chapters/:chapterSlug` — body accepts optional `keywords?: string[]`.
- `POST /api/v1/projects/:slug/articles` and `POST /api/v1/projects/:slug/chapters` — accept optional `keywords?: string[]` on create (default `[]`).
- List endpoints returning articles/chapters include `keywords` in each item.

Auth and org-scoping are unchanged.

#### Write semantics

- `keywords` is **replace**, not merge. `PATCH { keywords: ["a", "b"] }` sets the array to exactly `["a", "b"]`. `PATCH { keywords: [] }` clears it.
- Omitting `keywords` from the PATCH body leaves the existing array untouched (standard PATCH behavior for optional fields).
- Server applies the same normalization as the editor (Section 1). Clients may send raw values (`"#Onboarding"`, `"  error  "`, duplicates) — the server normalizes.

#### Tests

**Unit / normalization (`__tests__/lib/`):**
- Trim, lowercase, strip `#`, dedupe, drop empties, preserve order.
- Reject at 21 keywords, at 41-char keyword.

**Internal routes (`__tests__/api/`):**
- `saveArticleAction` / `saveChapterAction`: keywords persist; empty array clears.

**v1 routes (`__tests__/api/v1/`):**
- PATCH with `keywords: ["#Foo", "bar", "Foo", ""]` persists `["foo", "bar"]`.
- PATCH without `keywords` key does not clear existing array.
- PATCH with 21 keywords returns 400 with structured error.
- PATCH with a 41-char keyword returns 400.
- Cross-org access rejected.
- List + GET endpoints include `keywords` in response.

#### `docs-api` command update

Target file: `.claude/commands/docs-api.md`.

Additions:

- `keywords` field added to Article and Chapter schemas in the **Read** and **Update** sections.
- A new "Keywords" subsection explaining:
  - Replace-semantics.
  - Server-side normalization (`trim`, strip `#`, lowercase, dedupe).
  - Limits: max 20 keywords, max 40 characters each.
  - That clients are free to pre-normalize but are not required to.
- Example request body for `PATCH` that includes `keywords`.

The command does **not** document keyword generation strategy — that belongs to the API consumer's own pipeline.

## Testing Strategy

All tests are vitest and follow existing patterns in `__tests__/`.

- **Migration sanity:** a one-off SQL integration test (or manual verification in staging) that (a) the new GIN indexes are present, (b) a sample article with keywords ranks above a keyword-less article for a keyword query, (c) a chapter keyword change updates its articles' FTS.
- **Normalization:** table-driven unit tests in `__tests__/lib/keywords.test.ts`.
- **Editor component:** minimal component test for `KeywordInput` covering enter-to-add, backspace-to-remove, paste-split, max-20 block.
- **API:** v1 and internal route tests as enumerated above.

## Open Questions

- None at design time. Model-ID verification is a pre-implementation checklist item, not an open design question.

## Rollout

Single PR. No feature flag — keywords default to empty so existing content continues to rank exactly as before until an author adds keywords. The model upgrade is the only behavior change for users who don't touch keywords; it applies immediately on merge.
