# Search Keywords & Full-Page AI Answers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-editable `keywords` to articles and chapters (editor UI + v1 API), fold them into FTS ranking, and pass the top-3 full article bodies to Gemini 3 Flash for the AI answer.

**Architecture:** Two new `text[]` columns (`articles.keywords`, `chapters.keywords`) indexed via GIN. The existing `articles.fts` stored generated column is replaced by a trigger-populated `tsvector` that additionally weighs Article keywords at `A` and Chapter keywords (via parent lookup) at `C`. A second trigger on `chapters` re-indexes affected articles when a chapter's keywords change. Editor gets a shared `KeywordInput` chip component. v1 API gains `keywords` as an optional replace-semantics field on existing endpoints. AI answer route is simplified to take the top 3 full articles (no 1000-char slice) and upgraded to Gemini 3 Flash.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres), Tiptap editor, Vitest, Google Gen AI SDK.

**Spec:** `docs/superpowers/specs/2026-04-14-search-keywords-and-full-page-ai-answers-design.md`

---

## Pre-flight

- [ ] **Verify the Gemini 3 Flash model ID** before starting Task 8.
  - Check https://ai.google.dev/gemini-api/docs/models for the canonical ID.
  - Expected candidates in order of preference: `gemini-3-flash`, `gemini-3.0-flash`, `gemini-flash-latest`.
  - If Gemini 3 Flash is not yet GA, use `gemini-flash-latest` and note this explicitly in the Task 8 commit message.
  - Record the resolved ID here before proceeding: `__________`.

---

## Task 1: Database migration — keywords columns, indexes, trigger-based FTS

**Files:**
- Create: `supabase/migrations/20260414120000_add_keywords_and_rebuild_fts.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260414120000_add_keywords_and_rebuild_fts.sql`:

```sql
-- Add keywords columns to articles and chapters
alter table articles add column keywords text[] not null default '{}';
alter table chapters add column keywords text[] not null default '{}';

-- GIN indexes for array operations (future filter syntax)
create index articles_keywords_gin on articles using gin(keywords);
create index chapters_keywords_gin on chapters using gin(keywords);

-- Drop the existing stored generated fts column and its index
drop index if exists articles_fts_idx;
alter table articles drop column fts;

-- Re-create fts as a regular (trigger-populated) tsvector column
alter table articles add column fts tsvector;
create index articles_fts_idx on articles using gin(fts);

-- Function that builds the fts vector for a single article row
create or replace function articles_build_fts(a articles)
returns tsvector
language sql
stable
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

-- Backfill fts for all existing articles
update articles set fts = articles_build_fts(articles);
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset` (applies all migrations against the local dev database from scratch — safest option).

Expected: migration applies without error; new columns and triggers are created. If the local supabase CLI is not set up, apply manually via `psql` against the local Supabase dev DB.

- [ ] **Step 3: Smoke-test keywords via SQL**

Run a quick SQL check (via `supabase db` or `psql`):

```sql
-- Insert keywords on a sample article and confirm fts picks them up
update articles set keywords = array['onboarding', 'fehler']
  where id = (select id from articles limit 1);

select title, fts
  from articles
  where id = (select id from articles limit 1);
-- Expect: fts contains 'onboarding' and 'fehler' tokens with weight A.

-- Update the parent chapter's keywords and confirm the child article's fts updates
update chapters set keywords = array['chapter-topic']
  where id = (select chapter_id from articles where id = (select id from articles limit 1));

select title, fts
  from articles
  where id = (select id from articles limit 1);
-- Expect: fts now also contains 'chapter-topic' at weight C.
```

Expected: both tokens appear in the `fts` output with their respective weights.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260414120000_add_keywords_and_rebuild_fts.sql
git commit --no-gpg-sign -m "feat(db): add keywords columns and trigger-based FTS build"
```

---

## Task 2: Keywords normalization utility + tests

**Files:**
- Create: `lib/keywords.ts`
- Test: `__tests__/lib/keywords.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/keywords.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeKeywords, validateKeywords, MAX_KEYWORDS, MAX_KEYWORD_LENGTH } from "@/lib/keywords";

describe("normalizeKeywords", () => {
  it("trims whitespace", () => {
    expect(normalizeKeywords(["  foo  ", "bar "])).toEqual(["foo", "bar"]);
  });

  it("strips leading hash characters", () => {
    expect(normalizeKeywords(["#foo", "##bar"])).toEqual(["foo", "bar"]);
  });

  it("lowercases keywords", () => {
    expect(normalizeKeywords(["FOO", "BaR"])).toEqual(["foo", "bar"]);
  });

  it("deduplicates keeping first occurrence order", () => {
    expect(normalizeKeywords(["foo", "bar", "foo"])).toEqual(["foo", "bar"]);
  });

  it("drops empty strings after normalization", () => {
    expect(normalizeKeywords(["", "  ", "#", "foo"])).toEqual(["foo"]);
  });

  it("applies full pipeline end-to-end", () => {
    expect(normalizeKeywords(["#Onboarding", " onboarding ", "Error", "error", ""]))
      .toEqual(["onboarding", "error"]);
  });

  it("preserves unicode (umlauts, emoji)", () => {
    expect(normalizeKeywords(["Fehlerbehebung", "über", "🚀"]))
      .toEqual(["fehlerbehebung", "über", "🚀"]);
  });
});

describe("validateKeywords", () => {
  it("returns ok for valid input", () => {
    expect(validateKeywords(["foo", "bar"])).toEqual({ ok: true, value: ["foo", "bar"] });
  });

  it("normalizes input before validating", () => {
    expect(validateKeywords(["#FOO", "foo"])).toEqual({ ok: true, value: ["foo"] });
  });

  it("rejects more than MAX_KEYWORDS", () => {
    const tooMany = Array.from({ length: MAX_KEYWORDS + 1 }, (_, i) => `kw${i}`);
    const result = validateKeywords(tooMany);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(new RegExp(`max ${MAX_KEYWORDS}`, "i"));
    }
  });

  it("counts AFTER normalization for the limit", () => {
    // 20 duplicates dedupe to 1, should be valid
    const dupes = Array.from({ length: MAX_KEYWORDS + 5 }, () => "same");
    expect(validateKeywords(dupes)).toEqual({ ok: true, value: ["same"] });
  });

  it("rejects keywords longer than MAX_KEYWORD_LENGTH", () => {
    const tooLong = "a".repeat(MAX_KEYWORD_LENGTH + 1);
    const result = validateKeywords(["ok", tooLong]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/40 characters/i);
      expect(result.error).toContain(tooLong);
    }
  });

  it("rejects non-array input", () => {
    // @ts-expect-error — testing runtime behavior
    expect(validateKeywords("foo").ok).toBe(false);
    // @ts-expect-error — testing runtime behavior
    expect(validateKeywords(null).ok).toBe(false);
  });

  it("rejects non-string entries", () => {
    // @ts-expect-error — testing runtime behavior
    expect(validateKeywords(["ok", 42]).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/keywords.test.ts`
Expected: FAIL with "Cannot find module '@/lib/keywords'".

- [ ] **Step 3: Write the implementation**

Create `lib/keywords.ts`:

```typescript
export const MAX_KEYWORDS = 20;
export const MAX_KEYWORD_LENGTH = 40;

export function normalizeKeywords(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const stripped = raw.replace(/^#+/, "").trim().toLowerCase();
    if (stripped.length === 0) continue;
    if (seen.has(stripped)) continue;
    seen.add(stripped);
    out.push(stripped);
  }
  return out;
}

export type ValidationResult =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

export function validateKeywords(input: unknown): ValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "keywords must be an array of strings" };
  }
  if (!input.every((v) => typeof v === "string")) {
    return { ok: false, error: "keywords must be an array of strings" };
  }

  const normalized = normalizeKeywords(input as string[]);

  const tooLong = normalized.find((kw) => kw.length > MAX_KEYWORD_LENGTH);
  if (tooLong) {
    return {
      ok: false,
      error: `keyword exceeds ${MAX_KEYWORD_LENGTH} characters: "${tooLong}"`,
    };
  }
  if (normalized.length > MAX_KEYWORDS) {
    return { ok: false, error: `max ${MAX_KEYWORDS} keywords allowed` };
  }
  return { ok: true, value: normalized };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/keywords.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/keywords.ts __tests__/lib/keywords.test.ts
git commit --no-gpg-sign -m "feat(lib): add keywords normalization and validation"
```

---

## Task 3: KeywordInput shared component

**Files:**
- Create: `components/editor/keyword-input.tsx`
- Test: `__tests__/components/keyword-input.test.tsx` (only if the repo has component tests; otherwise skip the test file — see Step 1)

- [ ] **Step 1: Check whether the repo has React component tests**

Run: `ls __tests__/` and `ls __tests__/components 2>/dev/null`.

If `__tests__/components/` exists → write component tests in Step 2.
If it does **not** exist → skip Steps 2–3 (component will be verified through editor integration in later tasks); proceed to Step 4 (write the component), then Step 7 (commit).

- [ ] **Step 2: Write the failing component test (only if component-test infra exists)**

Create `__tests__/components/keyword-input.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeywordInput } from "@/components/editor/keyword-input";

describe("KeywordInput", () => {
  it("renders existing chips", () => {
    render(<KeywordInput value={["foo", "bar"]} onChange={() => {}} />);
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
  });

  it("adds a chip on Enter", () => {
    const onChange = vi.fn();
    render(<KeywordInput value={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "foo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["foo"]);
  });

  it("adds a chip on comma", () => {
    const onChange = vi.fn();
    render(<KeywordInput value={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "foo" } });
    fireEvent.keyDown(input, { key: "," });
    expect(onChange).toHaveBeenCalledWith(["foo"]);
  });

  it("normalizes (lowercase + strip #) when adding", () => {
    const onChange = vi.fn();
    render(<KeywordInput value={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "#FOO" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["foo"]);
  });

  it("silently discards duplicates", () => {
    const onChange = vi.fn();
    render(<KeywordInput value={["foo"]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "foo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes last chip on Backspace when input is empty", () => {
    const onChange = vi.fn();
    render(<KeywordInput value={["foo", "bar"]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["foo"]);
  });

  it("splits pasted comma-separated input into multiple chips", () => {
    const onChange = vi.fn();
    render(<KeywordInput value={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.paste(input, { clipboardData: { getData: () => "foo, bar, baz" } });
    expect(onChange).toHaveBeenCalledWith(["foo", "bar", "baz"]);
  });

  it("disables input at MAX_KEYWORDS and shows hint", () => {
    const full = Array.from({ length: 20 }, (_, i) => `kw${i}`);
    render(<KeywordInput value={full} onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByText(/Max 20 keywords/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run __tests__/components/keyword-input.test.tsx`
Expected: FAIL with "Cannot find module '@/components/editor/keyword-input'".

- [ ] **Step 4: Implement the component**

Create `components/editor/keyword-input.tsx`:

```tsx
"use client";

import { useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { MAX_KEYWORDS, normalizeKeywords } from "@/lib/keywords";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
};

export function KeywordInput({ value, onChange }: Props) {
  const [input, setInput] = useState("");
  const atMax = value.length >= MAX_KEYWORDS;

  function commit(raw: string) {
    if (!raw.trim()) return;
    const merged = normalizeKeywords([...value, raw]).slice(0, MAX_KEYWORDS);
    if (merged.length === value.length) return; // duplicate or empty after normalize
    onChange(merged);
    setInput("");
  }

  function commitMany(parts: string[]) {
    const merged = normalizeKeywords([...value, ...parts]).slice(0, MAX_KEYWORDS);
    if (merged.length === value.length) return;
    onChange(merged);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(input);
      return;
    }
    if (e.key === "Backspace" && input === "" && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text.includes(",")) return; // let normal typing happen
    e.preventDefault();
    commitMany(text.split(","));
  }

  function removeAt(idx: number) {
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      {value.map((kw, idx) => (
        <span
          key={`${kw}-${idx}`}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
        >
          {kw}
          <button
            type="button"
            aria-label={`Remove ${kw}`}
            onClick={() => removeAt(idx)}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={atMax}
        placeholder={atMax ? "" : value.length === 0 ? "Add keywords..." : ""}
        className="flex-1 min-w-[8ch] bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
      />
      {atMax && (
        <span className="text-xs text-muted-foreground">Max {MAX_KEYWORDS} keywords</span>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass (if written)**

Run: `npx vitest run __tests__/components/keyword-input.test.tsx`
Expected: all tests PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 7: Commit**

```bash
git add components/editor/keyword-input.tsx
# include the test file if created
git add __tests__/components/keyword-input.test.tsx 2>/dev/null || true
git commit --no-gpg-sign -m "feat(editor): add KeywordInput chip component"
```

---

## Task 4: Wire KeywordInput into the Article editor + extend save action

**Files:**
- Modify: `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/actions.ts`
- Modify: `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/editor-page-client.tsx`

- [ ] **Step 1: Extend `saveArticleAction` to accept keywords**

Edit `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/actions.ts` — replace the existing `saveArticleAction` with:

```typescript
import { createClient } from "@/lib/supabase/server";
import { validateKeywords } from "@/lib/keywords";

export async function saveArticleAction(
  id: string,
  contentJsonStr: string,
  contentText: string,
  description?: string,
  keywords?: string[]
) {
  const contentJson = JSON.parse(contentJsonStr);
  const supabase = await createClient();
  const updates: Record<string, unknown> = {
    content_json: contentJson,
    content_text: contentText,
  };
  if (description !== undefined) updates.description = description;
  if (keywords !== undefined) {
    const result = validateKeywords(keywords);
    if (!result.ok) throw new Error(result.error);
    updates.keywords = result.value;
  }

  const { error } = await supabase
    .from("articles")
    .update(updates)
    .eq("id", id);

  if (error) throw error;
}
```

(Preserve any other exports in the file — only `saveArticleAction` changes.)

- [ ] **Step 2: Fetch `keywords` on the article page**

Find the server component that loads the article (parent of `editor-page-client.tsx`, usually `page.tsx` in the same directory). Locate its Supabase `select(...)` for the article row and append `, keywords`. Example:

```diff
- .select("id, title, slug, description, content_json, content_text, ...")
+ .select("id, title, slug, description, keywords, content_json, content_text, ...")
```

Pass `keywords` through to `<EditorPageClient ... />` props. Update the client component's Props type accordingly.

- [ ] **Step 3: Render `<KeywordInput>` under the description**

In `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/editor-page-client.tsx`:

Add near the top-level imports:
```tsx
import { KeywordInput } from "@/components/editor/keyword-input";
```

Add state alongside the existing `description` state (around line 68 per current layout):
```tsx
const [keywords, setKeywords] = useState<string[]>(article.keywords ?? []);
```

Immediately **after** the description `<input>` (around line 271), add:
```tsx
<KeywordInput
  value={keywords}
  onChange={(next) => { setKeywords(next); setSaved(false); }}
/>
```

Update the save invocation (wherever `saveArticleAction(...)` is called) to pass keywords:
```tsx
await saveArticleAction(
  article.id,
  JSON.stringify(contentJson),
  contentText,
  description,
  keywords,
);
```

- [ ] **Step 4: Type-check and manual smoke-test**

Run: `npx tsc --noEmit`
Expected: no type errors.

Start the dev server: `npm run dev`. Open an article edit page, add a couple of keywords, save (Cmd+S or the existing save path), reload. Expected: chips persist. Also verify: removing a chip + saving persists the removal.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/project/[slug]/article/[articleSlug]/edit/"
git commit --no-gpg-sign -m "feat(editor): article editor manages keywords via chip input"
```

---

## Task 5: Wire KeywordInput into the Chapter editor + extend save action

**Files:**
- Modify: `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/actions.ts`
- Modify: `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/chapter-editor-client.tsx`

- [ ] **Step 1: Extend `saveChapterAction` to accept keywords**

Edit `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/actions.ts` — replace `saveChapterAction` with:

```typescript
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateKeywords } from "@/lib/keywords";

export async function saveChapterAction(
  id: string,
  contentJsonStr: string,
  description?: string,
  keywords?: string[]
) {
  const contentJson = JSON.parse(contentJsonStr);
  const supabase = await createClient();
  const updates: Record<string, unknown> = { content_json: contentJson };
  if (description !== undefined) updates.description = description;
  if (keywords !== undefined) {
    const result = validateKeywords(keywords);
    if (!result.ok) throw new Error(result.error);
    updates.keywords = result.value;
  }

  const { error } = await supabase
    .from("chapters")
    .update(updates)
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/");
}
```

(Preserve any other exports in the file.)

- [ ] **Step 2: Fetch `keywords` on the chapter page**

Find the server component loading the chapter (sibling of `chapter-editor-client.tsx`). Extend its `select(...)` to include `keywords`. Pass it into `<ChapterEditorClient ... />` props.

- [ ] **Step 3: Render `<KeywordInput>` under the description**

In `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/chapter-editor-client.tsx`:

Add import:
```tsx
import { KeywordInput } from "@/components/editor/keyword-input";
```

Add state:
```tsx
const [keywords, setKeywords] = useState<string[]>(chapter.keywords ?? []);
```

Immediately after the description `<input>` (around line 85):
```tsx
<KeywordInput
  value={keywords}
  onChange={(next) => { setKeywords(next); setSaved(false); }}
/>
```

Update the `saveChapterAction(...)` invocation to pass keywords.

- [ ] **Step 4: Type-check and manual smoke-test**

Run: `npx tsc --noEmit`
Start dev server, edit a chapter, add keywords, save, reload. Verify persistence.

- [ ] **Step 5: Verify chapter-keyword change propagates to articles' FTS**

In a psql/SQL console:
```sql
-- Pick a chapter that has at least one article
select c.id, c.title, count(a.id)
  from chapters c
  left join articles a on a.chapter_id = c.id
  group by c.id, c.title
  order by count(a.id) desc
  limit 1;

-- Update that chapter's keywords via the editor UI (or SQL), then check:
select a.title, a.fts
  from articles a
  where a.chapter_id = '<chapter-id>';
-- Expect: fts includes the chapter's keyword tokens at weight C.
```

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/"
git commit --no-gpg-sign -m "feat(editor): chapter editor manages keywords via chip input"
```

---

## Task 6: Search route — include keywords in response

**Files:**
- Modify: `app/api/search/route.ts`

- [ ] **Step 1: Add `keywords` to the select clause**

In `app/api/search/route.ts`, update the `.select(...)` string:

```diff
- .select("id, title, slug, content_text, project_id, chapters(title)")
+ .select("id, title, slug, content_text, keywords, project_id, chapters(title, keywords)")
```

No query-parsing changes. FTS already includes keywords after Task 1.

- [ ] **Step 2: (Optional) Strip `#` from the query string**

Per the spec, `#onboarding fehler` and `onboarding fehler` should behave identically. Add just before the `textSearch` call:

```typescript
const cleanedQuery = query.replace(/#/g, " ").replace(/\s+/g, " ").trim();
```

Then pass `cleanedQuery` instead of `query` to `.textSearch(...)`.

Leave the `search_events.query` insert using the original `query` string (we want to log what the user actually typed).

- [ ] **Step 3: Manual smoke-test**

Start dev server, hit `GET /api/search?q=onboarding&projectId=<id>` with an article that has `onboarding` as a keyword but not in its body. Expected: the article is returned.

Check `#onboarding` returns the same result.

- [ ] **Step 4: Commit**

```bash
git add app/api/search/route.ts
git commit --no-gpg-sign -m "feat(search): include keywords in results and strip hash from query"
```

---

## Task 7: AI answer route — full content for top 3 + Gemini 3 Flash

**Files:**
- Modify: `app/api/search/answer/route.ts`

- [ ] **Step 1: Rewrite the route**

Replace the entire body of `app/api/search/answer/route.ts` with:

```typescript
import { NextResponse } from "next/server";
import { getAI } from "@/lib/ai/gemini";

const MAX_ARTICLES = 3;
const MAX_CONTENT_CHARS = 100_000;

type ArticleContext = {
  title: string;
  content_text: string;
  keywords?: string[];
  chapters?: { title?: string | null; keywords?: string[] | null } | null;
};

// NOTE: Verify the Gemini 3 Flash model ID before merging (see pre-flight in the plan).
// Replace this string if the canonical ID differs.
const MODEL_ID = "gemini-3-flash";

export async function POST(request: Request) {
  const { query, articles } = (await request.json()) as {
    query?: string;
    articles?: ArticleContext[];
  };

  if (!query || !articles?.length) {
    return NextResponse.json({ answer: null });
  }

  const top = articles.slice(0, MAX_ARTICLES);

  const context = top
    .map((a) => {
      const chapterTitle = a.chapters?.title ?? "";
      const articleKeywords = (a.keywords ?? []).join(", ");
      const chapterKeywords = (a.chapters?.keywords ?? []).join(", ");
      const header = [
        `### ${a.title}`,
        chapterTitle ? `Chapter: ${chapterTitle}` : "",
        articleKeywords ? `Article keywords: ${articleKeywords}` : "",
        chapterKeywords ? `Chapter keywords: ${chapterKeywords}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const body =
        a.content_text.length > MAX_CONTENT_CHARS
          ? a.content_text.slice(0, MAX_CONTENT_CHARS) + "\n\n[article truncated at 100k chars]"
          : a.content_text;

      return `${header}\n\n${body}`;
    })
    .join("\n\n---\n\n");

  const prompt = `Answer this question based on the following documentation: "${query}"

The following articles are provided in full. Quote specifically and cite article titles. If you reference a video timestamp, include it as [video:MM:SS]. Keep your answer to 2–4 sentences unless the question clearly needs more.

${context}`;

  const response = await getAI().models.generateContent({
    model: MODEL_ID,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  return NextResponse.json({ answer: response.text });
}
```

- [ ] **Step 2: Ensure caller passes the extended article shape**

Open `components/docs/search-dialog.tsx`. The POST to `/api/search/answer` currently sends the `articles` array from `GET /api/search`. After Task 6 those already include `keywords` and `chapters.keywords`. Verify the fetch body forwards the array verbatim (no field stripping). If it slices fields, update to forward `{ title, content_text, keywords, chapters }` per article.

- [ ] **Step 3: Manual smoke-test**

Start dev server, open search dialog (Cmd+K), run a query that returns ≥3 results. Watch the network tab:
- `/api/search` returns articles with `keywords` arrays.
- `/api/search/answer` request body contains the top 3 with full `content_text` (not truncated to 1000 chars).
- Response produces a coherent answer referencing article titles.

If the model call fails with "model not found" → revisit the pre-flight model-ID verification and update `MODEL_ID`.

- [ ] **Step 4: Commit**

```bash
git add app/api/search/answer/route.ts components/docs/search-dialog.tsx
git commit --no-gpg-sign -m "feat(search): pass top-3 full articles to AI answer with Gemini 3 Flash"
```

---

## Task 8: Upgrade default model in `lib/ai/generate.ts`

**Files:**
- Modify: `lib/ai/generate.ts`

- [ ] **Step 1: Update the default model string**

In `lib/ai/generate.ts`, change line 12:

```diff
-    model: opts?.model ?? "gemini-2.5-flash",
+    model: opts?.model ?? "gemini-3-flash",
```

Use the exact model ID resolved in the pre-flight check.

- [ ] **Step 2: Run the test suite**

Run: `npx vitest run`
Expected: existing tests pass. If any test pins a specific model string, update or mock it.

- [ ] **Step 3: Smoke-test one dependent feature**

Pick one feature that uses `generateText()` (e.g. translation or a video-pipeline step if a sample project exists locally). Run it end-to-end and confirm output is sensible.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/generate.ts
git commit --no-gpg-sign -m "chore(ai): upgrade default model to Gemini 3 Flash"
```

---

## Task 9: v1 API — article PATCH accepts + returns keywords

**Files:**
- Modify: `app/api/v1/projects/[slug]/articles/[articleSlug]/route.ts`
- Test: `__tests__/api/v1/articles-patch-keywords.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/v1/articles-patch-keywords.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/api-key-auth", () => ({
  validateApiKey: vi.fn(),
  apiError: (message: string, code: string, status: number) =>
    new Response(JSON.stringify({ error: { message, code } }), { status }),
}));

import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey } from "@/lib/api-key-auth";

function makeRequest(body: unknown, lang = "en") {
  return new Request(`http://localhost/api/v1/projects/p1/articles/a1?lang=${lang}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer rd_test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /v1/projects/:slug/articles/:articleSlug — keywords", () => {
  let supa: ReturnType<typeof mockSupabase>;

  beforeEach(() => {
    supa = mockSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supa.client as unknown as ReturnType<typeof createServiceClient>);
    vi.mocked(validateApiKey).mockResolvedValue({ orgId: "org1", keyId: "k1" });

    // resolveProject path
    supa.setTable("projects", { data: { id: "proj1", org_id: "org1" } });
    // update articles
    supa.setTable("articles", { data: { id: "a1", title: "T", slug: "a1", language: "en", status: "published", order: 0 }, error: null });
  });

  it("persists normalized keywords when provided", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/articles/[articleSlug]/route");
    const res = await PATCH(makeRequest({ keywords: ["#Onboarding", "onboarding", "Error", ""] }), {
      params: Promise.resolve({ slug: "p1", articleSlug: "a1" }),
    });
    expect(res.status).toBe(200);
    const chain = supa.getChain("articles");
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["onboarding", "error"] })
    );
  });

  it("clears keywords when empty array is provided", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/articles/[articleSlug]/route");
    await PATCH(makeRequest({ keywords: [] }), {
      params: Promise.resolve({ slug: "p1", articleSlug: "a1" }),
    });
    const chain = supa.getChain("articles");
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ keywords: [] }));
  });

  it("leaves keywords untouched when field is omitted", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/articles/[articleSlug]/route");
    await PATCH(makeRequest({ description: "new desc" }), {
      params: Promise.resolve({ slug: "p1", articleSlug: "a1" }),
    });
    const chain = supa.getChain("articles");
    const call = chain.update.mock.calls[0]?.[0] ?? {};
    expect(call).not.toHaveProperty("keywords");
  });

  it("returns 422 when more than 20 keywords are sent", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/articles/[articleSlug]/route");
    const tooMany = Array.from({ length: 21 }, (_, i) => `kw${i}`);
    const res = await PATCH(makeRequest({ keywords: tooMany }), {
      params: Promise.resolve({ slug: "p1", articleSlug: "a1" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 when a keyword exceeds 40 characters", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/articles/[articleSlug]/route");
    const res = await PATCH(makeRequest({ keywords: ["ok", "a".repeat(41)] }), {
      params: Promise.resolve({ slug: "p1", articleSlug: "a1" }),
    });
    expect(res.status).toBe(422);
  });
});
```

**Note:** the exact shape of `supa.setTable` / chain assertions may need tweaking to match `__tests__/helpers/mock-supabase.ts` — mirror an existing v1 test (e.g. `__tests__/api/v1/*.test.ts`) if signatures differ.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/v1/articles-patch-keywords.test.ts`
Expected: tests FAIL (keywords branch not yet in the route).

- [ ] **Step 3: Update the PATCH handler**

In `app/api/v1/projects/[slug]/articles/[articleSlug]/route.ts`:

Add import near the top:
```typescript
import { validateKeywords } from "@/lib/keywords";
```

Inside `PATCH`, after the existing `if (body.language !== undefined) updates.language = body.language;` line and before the `if (body.content !== undefined) { ... }` block, add:

```typescript
if (body.keywords !== undefined) {
  const result = validateKeywords(body.keywords);
  if (!result.ok) return apiError(result.error, "VALIDATION_ERROR", 422);
  updates.keywords = result.value;
}
```

Update the `select(...)` at the end of the function to include keywords:

```diff
- .select("id, title, slug, language, status, order")
+ .select("id, title, slug, language, status, order, keywords")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/v1/articles-patch-keywords.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/projects/[slug]/articles/[articleSlug]/route.ts" __tests__/api/v1/articles-patch-keywords.test.ts
git commit --no-gpg-sign -m "feat(v1): article PATCH accepts and returns keywords"
```

---

## Task 10: v1 API — chapter PATCH accepts + returns keywords

**Files:**
- Modify: `app/api/v1/projects/[slug]/chapters/[chapterSlug]/route.ts`
- Test: `__tests__/api/v1/chapters-patch-keywords.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/v1/chapters-patch-keywords.test.ts`. Follow the exact same shape as Task 9's article tests, but target the chapter route. Minimum 5 cases mirroring the article tests: normalize on write, clear with `[]`, no-field untouched, 422 on >20, 422 on >40-char keyword.

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/api-key-auth", () => ({
  validateApiKey: vi.fn(),
  apiError: (message: string, code: string, status: number) =>
    new Response(JSON.stringify({ error: { message, code } }), { status }),
}));

import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey } from "@/lib/api-key-auth";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/projects/p1/chapters/c1", {
    method: "PATCH",
    headers: { Authorization: "Bearer rd_test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /v1/projects/:slug/chapters/:chapterSlug — keywords", () => {
  let supa: ReturnType<typeof mockSupabase>;

  beforeEach(() => {
    supa = mockSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supa.client as unknown as ReturnType<typeof createServiceClient>);
    vi.mocked(validateApiKey).mockResolvedValue({ orgId: "org1", keyId: "k1" });
    supa.setTable("projects", { data: { id: "proj1", org_id: "org1" } });
    supa.setTable("chapters", { data: { id: "c1", title: "T", slug: "c1" }, error: null });
  });

  it("persists normalized keywords when provided", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/chapters/[chapterSlug]/route");
    const res = await PATCH(makeRequest({ keywords: ["#Foo", "foo", "Bar"] }), {
      params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }),
    });
    expect(res.status).toBe(200);
    expect(supa.getChain("chapters").update).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["foo", "bar"] })
    );
  });

  it("clears keywords when empty array is provided", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/chapters/[chapterSlug]/route");
    await PATCH(makeRequest({ keywords: [] }), {
      params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }),
    });
    expect(supa.getChain("chapters").update).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: [] })
    );
  });

  it("leaves keywords untouched when field is omitted", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/chapters/[chapterSlug]/route");
    await PATCH(makeRequest({ description: "x" }), {
      params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }),
    });
    const call = supa.getChain("chapters").update.mock.calls[0]?.[0] ?? {};
    expect(call).not.toHaveProperty("keywords");
  });

  it("returns 422 on >20 keywords", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/chapters/[chapterSlug]/route");
    const res = await PATCH(makeRequest({ keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) }), {
      params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 on 41-char keyword", async () => {
    const { PATCH } = await import("@/app/api/v1/projects/[slug]/chapters/[chapterSlug]/route");
    const res = await PATCH(makeRequest({ keywords: ["a".repeat(41)] }), {
      params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }),
    });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/v1/chapters-patch-keywords.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update the PATCH handler**

In `app/api/v1/projects/[slug]/chapters/[chapterSlug]/route.ts`:

Add import:
```typescript
import { validateKeywords } from "@/lib/keywords";
```

Inside `PATCH`, after the existing `if (body.translations !== undefined) updates.translations = body.translations;` line, add:

```typescript
if (body.keywords !== undefined) {
  const result = validateKeywords(body.keywords);
  if (!result.ok) return apiError(result.error, "VALIDATION_ERROR", 422);
  updates.keywords = result.value;
}
```

The existing `.select()` is a full-row select, so `keywords` is already included in the response automatically — no select change needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/v1/chapters-patch-keywords.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/projects/[slug]/chapters/[chapterSlug]/route.ts" __tests__/api/v1/chapters-patch-keywords.test.ts
git commit --no-gpg-sign -m "feat(v1): chapter PATCH accepts and returns keywords"
```

---

## Task 11: v1 API — article POST accepts keywords

**Files:**
- Modify: `app/api/v1/projects/[slug]/articles/route.ts`
- Test: `__tests__/api/v1/articles-post-keywords.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/v1/articles-post-keywords.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/api-key-auth", () => ({
  validateApiKey: vi.fn(),
  apiError: (m: string, c: string, s: number) =>
    new Response(JSON.stringify({ error: { message: m, code: c } }), { status: s }),
}));
vi.mock("@/lib/ai/markdown-to-tiptap", () => ({
  markdownToTiptapRaw: () => ({ doc: { type: "doc", content: [] }, text: "" }),
}));

import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey } from "@/lib/api-key-auth";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/projects/p1/articles", {
    method: "POST",
    headers: { Authorization: "Bearer rd_test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /v1/projects/:slug/articles — keywords", () => {
  let supa: ReturnType<typeof mockSupabase>;

  beforeEach(() => {
    supa = mockSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supa.client as unknown as ReturnType<typeof createServiceClient>);
    vi.mocked(validateApiKey).mockResolvedValue({ orgId: "org1", keyId: "k1" });
    supa.setTable("projects", { data: { id: "proj1", org_id: "org1" } });
    supa.setTable("articles", { data: { id: "a1", title: "T", slug: "t", language: "en", status: "draft", order: 0 }, error: null });
  });

  it("inserts normalized keywords on create", async () => {
    const { POST } = await import("@/app/api/v1/projects/[slug]/articles/route");
    const res = await POST(makeRequest({ title: "T", content: "body", keywords: ["#FOO", "foo"] }), {
      params: Promise.resolve({ slug: "p1" }),
    });
    expect(res.status).toBe(201);
    expect(supa.getChain("articles").insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["foo"] })
    );
  });

  it("defaults keywords to empty array when omitted", async () => {
    const { POST } = await import("@/app/api/v1/projects/[slug]/articles/route");
    await POST(makeRequest({ title: "T", content: "body" }), {
      params: Promise.resolve({ slug: "p1" }),
    });
    expect(supa.getChain("articles").insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: [] })
    );
  });

  it("returns 422 on invalid keywords", async () => {
    const { POST } = await import("@/app/api/v1/projects/[slug]/articles/route");
    const res = await POST(makeRequest({ title: "T", content: "body", keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) }), {
      params: Promise.resolve({ slug: "p1" }),
    });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/v1/articles-post-keywords.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update the POST handler**

In `app/api/v1/projects/[slug]/articles/route.ts`:

Add import:
```typescript
import { validateKeywords } from "@/lib/keywords";
```

Before the `db.from("articles").insert({...})` block, parse keywords:

```typescript
let keywords: string[] = [];
if (body.keywords !== undefined) {
  const result = validateKeywords(body.keywords);
  if (!result.ok) return apiError(result.error, "VALIDATION_ERROR", 422);
  keywords = result.value;
}
```

In the insert object, add:
```typescript
keywords,
```

In the `.select(...)` clause after insert, add `keywords`:

```diff
- .select("id, title, slug, language, status, order")
+ .select("id, title, slug, language, status, order, keywords")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/v1/articles-post-keywords.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/projects/[slug]/articles/route.ts" __tests__/api/v1/articles-post-keywords.test.ts
git commit --no-gpg-sign -m "feat(v1): article POST accepts keywords on create"
```

---

## Task 12: v1 API — chapter POST accepts keywords

**Files:**
- Modify: `app/api/v1/projects/[slug]/chapters/route.ts`
- Test: `__tests__/api/v1/chapters-post-keywords.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/v1/chapters-post-keywords.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/api-key-auth", () => ({
  validateApiKey: vi.fn(),
  apiError: (m: string, c: string, s: number) =>
    new Response(JSON.stringify({ error: { message: m, code: c } }), { status: s }),
}));
vi.mock("@/lib/ai/markdown-to-tiptap", () => ({
  markdownToTiptapRaw: () => ({ doc: { type: "doc", content: [] }, text: "" }),
}));

import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey } from "@/lib/api-key-auth";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/projects/p1/chapters", {
    method: "POST",
    headers: { Authorization: "Bearer rd_test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /v1/projects/:slug/chapters — keywords", () => {
  let supa: ReturnType<typeof mockSupabase>;

  beforeEach(() => {
    supa = mockSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supa.client as unknown as ReturnType<typeof createServiceClient>);
    vi.mocked(validateApiKey).mockResolvedValue({ orgId: "org1", keyId: "k1" });
    supa.setTable("projects", { data: { id: "proj1", org_id: "org1" } });
    supa.setTable("chapters", { data: { id: "c1", title: "T", slug: "t" }, error: null });
  });

  it("inserts normalized keywords on create", async () => {
    const { POST } = await import("@/app/api/v1/projects/[slug]/chapters/route");
    const res = await POST(makeRequest({ title: "T", keywords: ["#Bar", "bar"] }), {
      params: Promise.resolve({ slug: "p1" }),
    });
    expect(res.status).toBe(201);
    expect(supa.getChain("chapters").insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["bar"] })
    );
  });

  it("defaults keywords to empty array when omitted", async () => {
    const { POST } = await import("@/app/api/v1/projects/[slug]/chapters/route");
    await POST(makeRequest({ title: "T" }), {
      params: Promise.resolve({ slug: "p1" }),
    });
    expect(supa.getChain("chapters").insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: [] })
    );
  });

  it("returns 422 on invalid keywords", async () => {
    const { POST } = await import("@/app/api/v1/projects/[slug]/chapters/route");
    const res = await POST(makeRequest({ title: "T", keywords: ["a".repeat(41)] }), {
      params: Promise.resolve({ slug: "p1" }),
    });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/v1/chapters-post-keywords.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update the POST handler**

In `app/api/v1/projects/[slug]/chapters/route.ts`:

Add import:
```typescript
import { validateKeywords } from "@/lib/keywords";
```

Before the insert block, add:
```typescript
let keywords: string[] = [];
if (body.keywords !== undefined) {
  const result = validateKeywords(body.keywords);
  if (!result.ok) return apiError(result.error, "VALIDATION_ERROR", 422);
  keywords = result.value;
}
```

In the `db.from("chapters").insert({...})` object, add `keywords,`.

The existing `.select()` is a full-row select so no select change needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/v1/chapters-post-keywords.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/projects/[slug]/chapters/route.ts" __tests__/api/v1/chapters-post-keywords.test.ts
git commit --no-gpg-sign -m "feat(v1): chapter POST accepts keywords on create"
```

---

## Task 13: v1 API — project GET returns keywords on nested chapters + articles

**Files:**
- Modify: `app/api/v1/projects/[slug]/route.ts`
- Modify (if exists): `app/api/v1/projects/[slug]/chapters/[chapterSlug]/route.ts` (the `GET` handler)

- [ ] **Step 1: Add `keywords` to the nested select in project GET**

In `app/api/v1/projects/[slug]/route.ts`, find the `.select(...)` call (around line 16). Update:

```diff
- "id, name, slug, subtitle, translations, is_public, chapters(id, title, description, slug, group, order, translations, articles(id, title, description, slug, language, status, order))"
+ "id, name, slug, subtitle, translations, is_public, chapters(id, title, description, keywords, slug, group, order, translations, articles(id, title, description, keywords, slug, language, status, order))"
```

- [ ] **Step 2: If there's a single-chapter GET route, extend its select**

If `app/api/v1/projects/[slug]/chapters/[chapterSlug]/route.ts` has a `GET` handler that uses `.select(...)` (docs-api command mentions `GET /api/v1/projects/:slug/chapters/:chapterSlug`), add `keywords` to that select clause as well — both at chapter level and inside any `articles(...)` nesting.

- [ ] **Step 3: Manual smoke-test**

With the local dev server running and an API key available:

```bash
curl -H "Authorization: Bearer rd_<key>" http://localhost:3000/api/v1/projects/<slug> | jq '.chapters[0] | {title, keywords, articles: .articles[0] | {title, keywords}}'
```

Expected: `keywords` fields are present (possibly `[]`) on both chapter and nested article.

- [ ] **Step 4: Commit**

```bash
git add "app/api/v1/projects/[slug]/route.ts" "app/api/v1/projects/[slug]/chapters/[chapterSlug]/route.ts" 2>/dev/null
git commit --no-gpg-sign -m "feat(v1): include keywords in project/chapter GET responses"
```

---

## Task 14: Update `.claude/commands/docs-api.md`

**Files:**
- Modify: `.claude/commands/docs-api.md`

- [ ] **Step 1: Read the current file**

Open `.claude/commands/docs-api.md` and locate the Chapters section (around line 27), the Articles section (around line 41), and find wherever body schemas are listed for `POST`/`PATCH`.

- [ ] **Step 2: Add `keywords` to chapter body schemas**

In the Chapters section:

Update the `POST` body documentation to add `keywords`:
```diff
- Body: `{ "title": "...", "description?": "...", "content?": "<markdown>", "slug?": "...", "group?": "...", "order?": 0 }`
+ Body: `{ "title": "...", "description?": "...", "content?": "<markdown>", "slug?": "...", "group?": "...", "order?": 0, "keywords?": ["tag1", "tag2"] }`
```

Update the `PATCH` documentation: add `keywords` to the list of updateable fields and to any body example.

- [ ] **Step 3: Add `keywords` to article body schemas**

In the Articles section:

```diff
- Body: `{ "title": "...", "description?": "...", "content": "<markdown>", "chapter_slug?": "...", "slug?": "...", "language?": "en", "status?": "draft" }`
+ Body: `{ "title": "...", "description?": "...", "content": "<markdown>", "chapter_slug?": "...", "slug?": "...", "language?": "en", "status?": "draft", "keywords?": ["tag1", "tag2"] }`
```

Update the `PATCH` description to mention `keywords` as an updateable field.

- [ ] **Step 4: Add a "Keywords" subsection**

Append (or insert at an appropriate spot, e.g. just above the "Markdown Features" section) a new subsection:

```markdown
### Keywords

Articles and chapters both accept an optional `keywords: string[]` field on `POST` (create) and `PATCH` (update).

**Replace semantics.** `PATCH { "keywords": ["a", "b"] }` sets the array to exactly `["a", "b"]`. `PATCH { "keywords": [] }` clears it. Omitting the field leaves existing keywords unchanged.

**Server-side normalization.** Before persisting, the server:

1. Trims whitespace.
2. Strips leading `#` characters.
3. Lowercases each keyword.
4. Deduplicates (first occurrence wins, order preserved).
5. Drops empty strings.

Clients may send raw values (e.g. `"#Onboarding"`, `"  Error  "`, duplicates) — they will come back normalized in GET/PATCH responses.

**Limits.**

- Max 20 keywords per article/chapter.
- Max 40 characters per keyword (after normalization).
- Unicode allowed (umlauts, non-Latin scripts, emoji).

Exceeding limits returns `422 VALIDATION_ERROR` with a message naming the offending keyword or limit.

**Example:**

```bash
curl -X PATCH -H "Authorization: Bearer rd_<key>" \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["#Onboarding", "error-handling"]}' \
  https://<domain>/api/v1/projects/<slug>/articles/<articleSlug>
```

Response:

```json
{ "id": "...", "title": "...", "keywords": ["onboarding", "error-handling"], ... }
```

**Out of scope.** This API exposes a pure read/write contract for keywords. Generation of keywords (e.g. from article content via an LLM) is the caller's responsibility.
```

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/docs-api.md
git commit --no-gpg-sign -m "docs(api): document keywords field on articles and chapters"
```

---

## Task 15: Final verification

**Files:** none — this is a review step.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end smoke test**

Start dev server: `npm run dev`. Walk through:

1. Edit an article → add keywords `onboarding, error` → save → reload. Verify chips persist.
2. Edit that article's parent chapter → add keywords `getting-started` → save.
3. Open the search dialog → query `onboarding`. Verify the article appears at the top even if `onboarding` isn't in the body text.
4. Query `getting-started`. Verify the article appears (weighted lower via chapter keyword).
5. Query `#onboarding`. Verify same results as plain `onboarding`.
6. In the search dialog, click through to see the AI answer loaded. Check Network tab: the `/api/search/answer` request contains full `content_text` for the top 3 articles (not 1000-char slices).
7. From a shell with a test API key:
   ```bash
   curl -X PATCH -H "Authorization: Bearer rd_<key>" \
     -H "Content-Type: application/json" \
     -d '{"keywords":["#Foo","foo","Bar"]}' \
     http://localhost:3000/api/v1/projects/<slug>/articles/<articleSlug>
   ```
   Expected: response body shows `"keywords": ["foo", "bar"]`.
8. `GET /api/v1/projects/<slug>` — chapters and articles both include `keywords` arrays.

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git status
# if anything is uncommitted:
git commit --no-gpg-sign -m "chore: final cleanup for keywords feature"
```

- [ ] **Step 5: Report done**

Summarize what was shipped; flag any deviations from the spec (e.g. model-ID fallback) to the user.
