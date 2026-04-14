# Hybrid Search + Simple FTS Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "longer query = worse results" bug and make FTS correct for German content by switching to the `simple` dictionary, adding an OR fallback when strict AND returns zero results, and recording which strategy served each query.

**Architecture:** One migration rebuilds `articles.fts` with `to_tsvector('simple', ...)` in `articles_build_fts()`, creates a `search_articles_loose` RPC for OR-joined queries sorted by `ts_rank_cd`, and adds a `fallback_level text` column to `search_events`. The search route becomes a two-stage pipeline: `textSearch` first (AND via `websearch_to_tsquery`, config `simple`); on empty results, the RPC runs with a sanitized OR-joined tsquery. The response gains a `fallback: null | "or"` field. The search dialog renders a single-line hint when `fallback === "or"` and results exist.

**Tech Stack:** Postgres (FTS + tsvector triggers + RPC), Next.js App Router (Supabase client), Vitest, React 19 / Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-14-hybrid-search-and-simple-dict-design.md`

---

## Task 1: DB migration — `simple` dict rebuild, loose-search RPC, telemetry column

**Files:**
- Create: `supabase/migrations/20260414140000_hybrid_search_simple_dict.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260414140000_hybrid_search_simple_dict.sql`:

```sql
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
--    p_query must already be a valid tsquery string like 'chat | zugriff | bekommen'
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
--    null = strict AND served the request (or no results at all)
--    'or' = OR fallback served the request
alter table search_events add column if not exists fallback_level text;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`

Expected: migration applies cleanly, existing migrations still pass. If Docker/Supabase CLI isn't running, start it first: `npx supabase start`.

- [ ] **Step 3: Smoke-test the `simple` rebuild**

Run in psql against the local DB — get the DB URL via `npx supabase status -o env | grep DB_URL`:

```sql
-- Pick an article and set content_text with a German compound term
update articles
set title = 'Rollen und Rechte',
    content_text = 'Benutzer können Chat-Zugriff bekommen über ihre Rolle.'
where id = (select id from articles limit 1);

-- Verify fts tokens are lowercased German, no stemming
select title, fts
from articles
where id = (select id from articles limit 1);
-- Expect: fts contains 'chat-zugriff':NB (split + raw), 'bekommen':NB, 'zugriff':NB, 'rolle':?, 'chat':?
-- (exact positions depend on text length — just confirm the raw German words appear, not english stems)
```

- [ ] **Step 4: Smoke-test the loose-search RPC**

```sql
-- Strict AND (websearch) via built-in:
select id, title from articles
where fts @@ websearch_to_tsquery('simple', 'chat zugriff bekommen')
  and project_id = (select project_id from articles limit 1)
  and status = 'published';
-- Should return the article above (all three tokens present).

-- Remove 'bekommen' from content_text; strict AND should drop to 0:
update articles
set content_text = 'Benutzer können Chat-Zugriff über ihre Rolle.'
where id = (select id from articles limit 1);

select count(*) from articles
where fts @@ websearch_to_tsquery('simple', 'chat zugriff bekommen')
  and project_id = (select project_id from articles limit 1)
  and status = 'published';
-- Expect: 0

-- Loose RPC should still return it:
select id, title
from search_articles_loose(
  (select project_id from articles limit 1),
  'chat | zugriff | bekommen',
  null,
  10
);
-- Expect: 1 row.
```

- [ ] **Step 5: Verify `search_events` column**

```sql
\d search_events
-- Expect: fallback_level text column present, default null.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260414140000_hybrid_search_simple_dict.sql
git commit --no-gpg-sign -m "feat(db): switch FTS to simple dict, add loose-search RPC + fallback telemetry"
```

---

## Task 2: Search route — hybrid pipeline + fallback field + telemetry

**Files:**
- Modify: `app/api/search/route.ts`
- Test: `__tests__/api/search-hybrid.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/search-hybrid.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

function makeRequest(q: string, projectId = "p1", lang = "de") {
  const url = `http://localhost/api/search?q=${encodeURIComponent(q)}&projectId=${projectId}&lang=${lang}`;
  return new Request(url);
}

describe("GET /api/search — hybrid pipeline", () => {
  let supa: ReturnType<typeof mockSupabase>;

  beforeEach(() => {
    supa = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(
      supa.client as unknown as Awaited<ReturnType<typeof createClient>>
    );
  });

  it("returns strict hits with fallback: null when stage 1 has results", async () => {
    supa.setTable("articles", {
      data: [
        { id: "a1", title: "Chat Zugriff", slug: "chat", content_text: "...", keywords: [], project_id: "p1", chapters: { title: "C", keywords: [] } },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const res = await GET(makeRequest("chat zugriff"));
    const body = await res.json();

    expect(body.articles).toHaveLength(1);
    expect(body.fallback).toBeNull();
    // RPC must not have been called
    expect(supa.client.rpc).not.toHaveBeenCalled();
  });

  it("falls back to OR RPC when strict returns empty", async () => {
    supa.setTable("articles", { data: [], error: null });
    supa.client.rpc = vi.fn().mockResolvedValue({
      data: [
        { id: "a1", title: "Chat Zugriff", slug: "chat", content_text: "...", keywords: [], project_id: "p1", chapters: { title: "C", keywords: [] } },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const res = await GET(makeRequest("chat zugriff bekommen"));
    const body = await res.json();

    expect(body.articles).toHaveLength(1);
    expect(body.fallback).toBe("or");
    expect(supa.client.rpc).toHaveBeenCalledWith(
      "search_articles_loose",
      expect.objectContaining({
        p_project_id: "p1",
        p_query: "chat | zugriff | bekommen",
        p_lang: "de",
      })
    );
  });

  it("returns empty with fallback: null when both stages empty", async () => {
    supa.setTable("articles", { data: [], error: null });
    supa.client.rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    const { GET } = await import("@/app/api/search/route");
    const res = await GET(makeRequest("nothingmatches"));
    const body = await res.json();

    expect(body.articles).toEqual([]);
    expect(body.fallback).toBeNull();
  });

  it("sanitizes punctuation from OR tokens", async () => {
    supa.setTable("articles", { data: [], error: null });
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    supa.client.rpc = rpcMock;

    const { GET } = await import("@/app/api/search/route");
    await GET(makeRequest("foo's bar; baz!"));

    expect(rpcMock).toHaveBeenCalledWith(
      "search_articles_loose",
      expect.objectContaining({ p_query: "foos | bar | baz" })
    );
  });

  it("short-circuits with empty response when query is only punctuation", async () => {
    supa.setTable("articles", { data: [], error: null });
    const rpcMock = vi.fn();
    supa.client.rpc = rpcMock;

    const { GET } = await import("@/app/api/search/route");
    const res = await GET(makeRequest("###"));
    const body = await res.json();

    expect(body.articles).toEqual([]);
    expect(body.fallback).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("logs fallback_level on search_events insert", async () => {
    supa.setTable("articles", { data: [], error: null });
    supa.client.rpc = vi.fn().mockResolvedValue({
      data: [{ id: "a1", title: "x", slug: "x", content_text: "", keywords: [], project_id: "p1", chapters: null }],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    await GET(makeRequest("chat zugriff bekommen"));

    expect(supa.getChain("search_events").insert).toHaveBeenCalledWith(
      expect.objectContaining({ fallback_level: "or", query: "chat zugriff bekommen" })
    );
  });

  it("logs fallback_level: null when strict succeeds", async () => {
    supa.setTable("articles", {
      data: [{ id: "a1", title: "x", slug: "x", content_text: "", keywords: [], project_id: "p1", chapters: null }],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    await GET(makeRequest("chat"));

    expect(supa.getChain("search_events").insert).toHaveBeenCalledWith(
      expect.objectContaining({ fallback_level: null, query: "chat" })
    );
  });
});
```

**Note on mock shape.** The existing `mockSupabase()` helper exposes a chainable client returned from `createClient()`. Existing tests in `__tests__/api/v1/*.test.ts` are the canonical pattern. If `supa.client.rpc` isn't pre-seeded by the helper, assign `vi.fn()` as shown in each test. If the helper's `setTable` return-shape for a chained query differs from what the tests assume, mirror the setup of the closest existing test (e.g. the search route isn't covered today, so model it on any v1 PATCH test that exercises `.select()` → `.eq()` → `.limit()`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/search-hybrid.test.ts`
Expected: multiple failures — either `fallback` field missing from response or RPC not called.

- [ ] **Step 3: Rewrite the search route**

Replace `app/api/search/route.ts` with:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type FallbackLevel = null | "or";

function tokenize(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((t) => t.length > 0);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const projectId = searchParams.get("projectId");
  const lang = searchParams.get("lang");

  if (!query || !projectId) {
    return NextResponse.json({ articles: [], fallback: null });
  }

  const supabase = await createClient();

  const cleanedQuery = query.replace(/#/g, " ").replace(/\s+/g, " ").trim();
  if (!cleanedQuery) {
    return NextResponse.json({ articles: [], fallback: null });
  }

  // Stage 1 — strict AND via websearch_to_tsquery
  let strictQuery = supabase
    .from("articles")
    .select("id, title, slug, content_text, keywords, project_id, chapters(title, keywords)")
    .eq("project_id", projectId)
    .eq("status", "published")
    .textSearch("fts", cleanedQuery, { type: "websearch", config: "simple" })
    .limit(10);

  if (lang) strictQuery = strictQuery.eq("language", lang);

  const { data: strictHits, error: strictErr } = await strictQuery;
  if (strictErr) console.error("[search] strict stage failed:", strictErr.message);

  let articles = strictHits ?? [];
  let fallback: FallbackLevel = null;

  // Stage 2 — OR fallback via RPC
  if (articles.length === 0) {
    const tokens = tokenize(cleanedQuery);
    if (tokens.length > 0) {
      const orQuery = tokens.join(" | ");
      const { data: looseHits, error: looseErr } = await supabase.rpc(
        "search_articles_loose",
        {
          p_project_id: projectId,
          p_query: orQuery,
          p_lang: lang ?? null,
          p_limit: 10,
        }
      );
      if (looseErr) console.error("[search] loose stage failed:", looseErr.message);
      if (looseHits && looseHits.length > 0) {
        articles = looseHits;
        fallback = "or";
      }
    }
  }

  // Log event (fire-and-forget)
  supabase
    .from("search_events")
    .insert({
      project_id: projectId,
      query: query,
      results_count: articles.length,
      language: lang ?? null,
      fallback_level: fallback,
    })
    .then(() => {});

  return NextResponse.json({ articles, fallback });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/search-hybrid.test.ts`
Expected: all 7 tests pass. If a mock-shape mismatch surfaces, adjust the test to match the `mockSupabase()` helper's actual API (see closest existing v1 test); do not change the implementation to satisfy a broken test setup.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: 220+ tests pass (216 prior + 7 new, minus any that may need minor adjustments for the new `fallback` field — unlikely since nothing else reads the search response shape programmatically).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/api/search/route.ts __tests__/api/search-hybrid.test.ts
git commit --no-gpg-sign -m "feat(search): hybrid AND→OR pipeline with simple dict and fallback telemetry"
```

---

## Task 3: Search dialog — fallback hint UI

**Files:**
- Modify: `components/docs/search-dialog.tsx`

- [ ] **Step 1: Locate the results-list render in `search-dialog.tsx`**

Open the file. The `SearchResult` interface is at line 8; the `results` state is declared at line 24; the results list renders elsewhere in the file (search for `results.map` or similar). You'll need to:

1. Add `fallback` state alongside `results`, `aiAnswer`, etc.
2. Set it from the response in the `search` callback (around line 72).
3. Render the hint above the results list when fallback triggered.

- [ ] **Step 2: Add state + response handling**

Near the existing state declarations (around line 26, right after `setAiAnswer`):

```tsx
const [fallback, setFallback] = useState<"or" | null>(null);
```

In the `search` callback (around line 71, where `data` is parsed), add:

```tsx
setResults(data.articles ?? []);
setFallback(data.fallback ?? null);
setActiveIndex(0);
```

In the open-reset effect (around line 48, inside `useEffect(() => { if (open) { ... }})`), reset fallback:

```tsx
setResults([]);
setAiAnswer(null);
setFallback(null);
setActiveIndex(0);
```

In the empty-query early-return in `search` (around line 60), also reset:

```tsx
if (!q.trim()) {
  setResults([]);
  setAiAnswer(null);
  setFallback(null);
  return;
}
```

- [ ] **Step 3: Render the hint**

Find the JSX block that renders the results list (`results.map(...)` or equivalent). Directly above the `.map()` iteration, insert:

```tsx
{fallback === "or" && results.length > 0 && (
  <div className="px-3 py-2 text-xs text-muted-foreground border-b">
    {currentLang === "en"
      ? `No exact matches for "${query}". Similar results:`
      : `Keine genauen Treffer für „${query}". Ähnliche Resultate:`}
  </div>
)}
```

`currentLang` and `query` are already in scope from earlier declarations.

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual smoke-test** (skip if dev server isn't running locally; verify during Task 4)

If `npm run dev` is running:
1. Seed an article: "chat-zugriff" appears in title/content but "bekommen" does not.
2. Cmd+K, type `chat zugriff` → results appear, no hint banner.
3. Type `chat zugriff bekommen` → results still appear (fallback kicked in), banner reads "Keine genauen Treffer…".

- [ ] **Step 6: Commit**

```bash
git add components/docs/search-dialog.tsx
git commit --no-gpg-sign -m "feat(search): show hint banner when OR fallback is used"
```

---

## Task 4: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: End-to-end smoke-test**

Start `npm run dev`. Reproduce the original bug and confirm the fix:

1. Navigate to a page whose content contains "chat-zugriff" (e.g. `/experte/benutzer-und-rollen` if seeded).
2. Cmd+K → search `chat zugriff` → page found, no banner.
3. Search `chat zugriff bekommen` → page still found, banner "Keine genauen Treffer …".
4. Search `rollen bearbeiten` → if "bearbeiten" isn't in the doc but "rollen"/"rolle" is, banner appears and results show.
5. Search `###` → empty state, no banner (banner only shows when fallback returns results).
6. Check DB: `select query, results_count, fallback_level from search_events order by created_at desc limit 10;` — recent queries show `fallback_level = 'or'` for the queries that fell back.

- [ ] **Step 4: Commit any final cleanup**

```bash
git status
# If anything uncommitted worth keeping, commit with a descriptive message
```

- [ ] **Step 5: Report done**

Summarize what shipped, note any deviations from the spec (e.g. if the mock-shape differed and required test adjustments).
