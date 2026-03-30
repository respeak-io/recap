# Agent-Driven Documentation API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable AI agents to create and manage documentation via org-scoped API keys and REST endpoints that accept Markdown content.

**Architecture:** New `/api/v1/` route tree with Bearer token auth. A shared `validateApiKey()` middleware extracts the org from the hashed key. Routes use the existing `createServiceClient()` (bypasses RLS) and scope queries by org. Markdown is converted to Tiptap JSON server-side using the existing `tokensToTiptap()` internals. API key management is session-authed in the dashboard.

**Tech Stack:** Next.js App Router, Supabase (service client), `marked` (Lexer), `slugify`, `crypto` (SHA-256).

**Spec:** `docs/superpowers/specs/2026-03-30-agent-docs-api-design.md`

---

### Task 1: Database migration for api_keys table

**Files:**
- Create: `supabase/migrations/20260330100000_api_keys.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260330100000_api_keys.sql`:

```sql
create table api_keys (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_keys_key_hash_idx on api_keys (key_hash);
create index api_keys_org_id_idx on api_keys (org_id);

alter table api_keys enable row level security;

create policy "Org members can view api keys"
  on api_keys for select
  using (is_org_member(org_id));

create policy "Org writers can create api keys"
  on api_keys for insert
  with check (is_org_writer(org_id));

create policy "Org writers can update api keys"
  on api_keys for update
  using (is_org_writer(org_id));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260330100000_api_keys.sql
git commit --no-gpg-sign -m "feat: add api_keys table migration"
```

---

### Task 2: API key auth middleware

**Files:**
- Create: `lib/api-key-auth.ts`

- [ ] **Step 1: Create the validateApiKey helper**

Create `lib/api-key-auth.ts`:

```typescript
import { createHash, randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

export interface ApiKeyValidation {
  orgId: string;
  keyId: string;
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(20).toString("hex"); // 40 hex chars
  const key = `rd_${raw}`;
  const hash = hashKey(key);
  const prefix = key.slice(0, 11); // "rd_" + 8 chars
  return { key, hash, prefix };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function validateApiKey(
  request: Request
): Promise<ApiKeyValidation | Response> {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return Response.json(
      { error: "Missing Authorization header", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const token = auth.slice(7);
  const hash = hashKey(token);

  const db = createServiceClient();
  const { data: apiKey } = await db
    .from("api_keys")
    .select("id, org_id, revoked_at")
    .eq("key_hash", hash)
    .single();

  if (!apiKey || apiKey.revoked_at) {
    return Response.json(
      { error: "Invalid or revoked API key", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // Update last_used_at (fire-and-forget)
  db.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id)
    .then(() => {});

  return { orgId: apiKey.org_id, keyId: apiKey.id };
}

export function apiError(
  message: string,
  code: string,
  status: number
): Response {
  return Response.json({ error: message, code }, { status });
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add lib/api-key-auth.ts
git commit --no-gpg-sign -m "feat: add API key auth middleware and key generation"
```

---

### Task 3: Add markdownToTiptapRaw function

**Files:**
- Modify: `lib/ai/markdown-to-tiptap.ts`

- [ ] **Step 1: Add the markdownToTiptapRaw function**

Add this function at the end of the exports in `lib/ai/markdown-to-tiptap.ts` (after the existing `markdownToTiptap` function, before the internal `tokensToTiptap`):

```typescript
/**
 * Convert a raw markdown string into Tiptap JSON document structure.
 * Unlike markdownToTiptap (which takes pre-split sections), this takes
 * a single markdown string — suitable for API input from agents.
 * Also returns plain text for full-text search indexing.
 */
export function markdownToTiptapRaw(
  markdown: string
): { doc: { type: string; content: TiptapNode[] }; text: string } {
  const tokens = new Lexer().lex(markdown);
  const nodes = tokensToTiptap(tokens);
  const doc = { type: "doc", content: nodes };

  // Extract plain text for FTS content_text field
  const text = extractPlainText(nodes);

  return { doc, text };
}

function extractPlainText(nodes: TiptapNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.text && typeof node.text === "string") {
      parts.push(node.text);
    }
    if (node.content && Array.isArray(node.content)) {
      parts.push(extractPlainText(node.content as TiptapNode[]));
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/markdown-to-tiptap.ts
git commit --no-gpg-sign -m "feat: add markdownToTiptapRaw for API markdown input"
```

---

### Task 4: V1 API — project endpoints

**Files:**
- Create: `app/api/v1/projects/route.ts`
- Create: `app/api/v1/projects/[slug]/route.ts`

- [ ] **Step 1: Create GET /api/v1/projects**

Create `app/api/v1/projects/route.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";

export async function GET(request: Request) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .select("id, name, slug, is_public")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, "INTERNAL", 500);

  return Response.json(data);
}
```

- [ ] **Step 2: Create GET /api/v1/projects/:slug**

Create `app/api/v1/projects/[slug]/route.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const { data: project } = await db
    .from("projects")
    .select("id, name, slug, is_public, chapters(id, title, slug, group, order, articles(id, title, slug, language, status, order))")
    .eq("slug", slug)
    .eq("org_id", auth.orgId)
    .single();

  if (!project) return apiError("Project not found", "NOT_FOUND", 404);

  // Sort chapters and articles by order
  const chapters = (project.chapters ?? [])
    .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
    .map((ch: Record<string, unknown>) => ({
      ...ch,
      articles: ((ch.articles as { order: number }[]) ?? []).sort(
        (a: { order: number }, b: { order: number }) => a.order - b.order
      ),
    }));

  return Response.json({ ...project, chapters });
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: Build succeeds, new routes appear.

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/
git commit --no-gpg-sign -m "feat(api): add v1 project list and detail endpoints"
```

---

### Task 5: V1 API — chapter CRUD endpoints

**Files:**
- Create: `app/api/v1/projects/[slug]/chapters/route.ts`
- Create: `app/api/v1/projects/[slug]/chapters/[chapterSlug]/route.ts`

- [ ] **Step 1: Create a shared helper for resolving project by slug + org**

Create `lib/api-v1-helpers.ts`:

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/api-key-auth";
import slugify from "slugify";

export async function resolveProject(
  db: SupabaseClient,
  orgId: string,
  slug: string
): Promise<{ id: string } | Response> {
  const { data } = await db
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .eq("org_id", orgId)
    .single();

  if (!data) return apiError("Project not found", "NOT_FOUND", 404);
  return data;
}

export function toSlug(title: string): string {
  return slugify(title, { lower: true, strict: true });
}
```

- [ ] **Step 2: Create POST /api/v1/projects/:slug/chapters**

Create `app/api/v1/projects/[slug]/chapters/route.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject, toSlug } from "@/lib/api-v1-helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  if (!body.title) return apiError("title is required", "VALIDATION_ERROR", 422);

  const chapterSlug = body.slug || toSlug(body.title);

  // Determine order if not provided
  let order = body.order;
  if (order === undefined) {
    const { data: last } = await db
      .from("chapters")
      .select("order")
      .eq("project_id", project.id)
      .order("order", { ascending: false })
      .limit(1)
      .single();
    order = (last?.order ?? -1) + 1;
  }

  const { data, error } = await db
    .from("chapters")
    .insert({
      project_id: project.id,
      title: body.title,
      slug: chapterSlug,
      group: body.group ?? null,
      order,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return apiError("Chapter slug already exists", "CONFLICT", 409);
    return apiError(error.message, "INTERNAL", 500);
  }

  return Response.json(data, { status: 201 });
}
```

- [ ] **Step 3: Create PATCH + DELETE for chapters**

Create `app/api/v1/projects/[slug]/chapters/[chapterSlug]/route.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; chapterSlug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, chapterSlug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.group !== undefined) updates.group = body.group;
  if (body.order !== undefined) updates.order = body.order;

  if (Object.keys(updates).length === 0) {
    return apiError("No fields to update", "VALIDATION_ERROR", 422);
  }

  const { data, error } = await db
    .from("chapters")
    .update(updates)
    .eq("project_id", project.id)
    .eq("slug", chapterSlug)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return apiError("Slug already exists", "CONFLICT", 409);
    return apiError(error.message, "INTERNAL", 500);
  }
  if (!data) return apiError("Chapter not found", "NOT_FOUND", 404);

  return Response.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; chapterSlug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, chapterSlug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const { error } = await db
    .from("chapters")
    .delete()
    .eq("project_id", project.id)
    .eq("slug", chapterSlug);

  if (error) return apiError(error.message, "INTERNAL", 500);

  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add lib/api-v1-helpers.ts app/api/v1/
git commit --no-gpg-sign -m "feat(api): add v1 chapter CRUD endpoints"
```

---

### Task 6: V1 API — article CRUD endpoints

**Files:**
- Create: `app/api/v1/projects/[slug]/articles/route.ts`
- Create: `app/api/v1/projects/[slug]/articles/[articleSlug]/route.ts`

- [ ] **Step 1: Create POST /api/v1/projects/:slug/articles**

Create `app/api/v1/projects/[slug]/articles/route.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject, toSlug } from "@/lib/api-v1-helpers";
import { markdownToTiptapRaw } from "@/lib/ai/markdown-to-tiptap";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  if (!body.title) return apiError("title is required", "VALIDATION_ERROR", 422);
  if (!body.content) return apiError("content is required", "VALIDATION_ERROR", 422);

  const articleSlug = body.slug || toSlug(body.title);
  const language = body.language || "en";
  const status = body.status || "draft";

  // Convert markdown to Tiptap JSON
  const { doc: contentJson, text: contentText } = markdownToTiptapRaw(body.content);

  // Resolve chapter if provided
  let chapterId: string | null = null;
  if (body.chapter_slug) {
    const { data: chapter } = await db
      .from("chapters")
      .select("id")
      .eq("project_id", project.id)
      .eq("slug", body.chapter_slug)
      .single();
    if (!chapter) return apiError("Chapter not found", "NOT_FOUND", 404);
    chapterId = chapter.id;
  }

  // Determine order
  const { data: last } = await db
    .from("articles")
    .select("order")
    .eq("project_id", project.id)
    .eq("chapter_id", chapterId)
    .order("order", { ascending: false })
    .limit(1)
    .single();
  const order = (last?.order ?? -1) + 1;

  const { data, error } = await db
    .from("articles")
    .insert({
      project_id: project.id,
      chapter_id: chapterId,
      title: body.title,
      slug: articleSlug,
      language,
      status,
      content_json: contentJson,
      content_text: contentText,
      order,
    })
    .select("id, title, slug, language, status, order")
    .single();

  if (error) {
    if (error.code === "23505") return apiError("Article slug already exists for this language", "CONFLICT", 409);
    return apiError(error.message, "INTERNAL", 500);
  }

  return Response.json(data, { status: 201 });
}
```

- [ ] **Step 2: Create PATCH + DELETE for articles**

Create `app/api/v1/projects/[slug]/articles/[articleSlug]/route.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";
import { markdownToTiptapRaw } from "@/lib/ai/markdown-to-tiptap";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; articleSlug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, articleSlug } = await params;
  const db = createServiceClient();
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") || "en";

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.status !== undefined) updates.status = body.status;
  if (body.language !== undefined) updates.language = body.language;

  if (body.content !== undefined) {
    const { doc, text } = markdownToTiptapRaw(body.content);
    updates.content_json = doc;
    updates.content_text = text;
  }

  if (body.chapter_slug !== undefined) {
    if (body.chapter_slug === null) {
      updates.chapter_id = null;
    } else {
      const { data: chapter } = await db
        .from("chapters")
        .select("id")
        .eq("project_id", project.id)
        .eq("slug", body.chapter_slug)
        .single();
      if (!chapter) return apiError("Chapter not found", "NOT_FOUND", 404);
      updates.chapter_id = chapter.id;
    }
  }

  if (Object.keys(updates).length === 0) {
    return apiError("No fields to update", "VALIDATION_ERROR", 422);
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("articles")
    .update(updates)
    .eq("project_id", project.id)
    .eq("slug", articleSlug)
    .eq("language", lang)
    .select("id, title, slug, language, status, order")
    .single();

  if (error) {
    if (error.code === "23505") return apiError("Slug already exists", "CONFLICT", 409);
    return apiError(error.message, "INTERNAL", 500);
  }
  if (!data) return apiError("Article not found", "NOT_FOUND", 404);

  return Response.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; articleSlug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, articleSlug } = await params;
  const db = createServiceClient();
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang");

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  let query = db
    .from("articles")
    .delete()
    .eq("project_id", project.id)
    .eq("slug", articleSlug);

  if (lang) {
    query = query.eq("language", lang);
  }

  const { error } = await query;
  if (error) return apiError(error.message, "INTERNAL", 500);

  return new Response(null, { status: 204 });
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/
git commit --no-gpg-sign -m "feat(api): add v1 article CRUD endpoints"
```

---

### Task 7: V1 API — sync endpoint

**Files:**
- Create: `app/api/v1/projects/[slug]/sync/route.ts`

- [ ] **Step 1: Create PUT /api/v1/projects/:slug/sync**

Create `app/api/v1/projects/[slug]/sync/route.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject, toSlug } from "@/lib/api-v1-helpers";
import { markdownToTiptapRaw } from "@/lib/ai/markdown-to-tiptap";

interface SyncChapter {
  title: string;
  slug?: string;
  group?: string;
  articles?: SyncArticle[];
}

interface SyncArticle {
  title: string;
  slug?: string;
  content: string;
  language?: string;
  status?: string;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  if (!body.chapters || !Array.isArray(body.chapters)) {
    return apiError("chapters array is required", "VALIDATION_ERROR", 422);
  }

  const incomingChapters: SyncChapter[] = body.chapters;
  const stats = {
    chapters: { created: 0, updated: 0, deleted: 0 },
    articles: { created: 0, updated: 0, deleted: 0 },
  };

  // Fetch existing chapters and articles
  const { data: existingChapters } = await db
    .from("chapters")
    .select("id, slug")
    .eq("project_id", project.id);

  const { data: existingArticles } = await db
    .from("articles")
    .select("id, slug, language, chapter_id")
    .eq("project_id", project.id);

  const existChapterMap = new Map((existingChapters ?? []).map((c) => [c.slug, c]));
  const existArticleMap = new Map(
    (existingArticles ?? []).map((a) => [`${a.chapter_id}:${a.slug}:${a.language}`, a])
  );

  const seenChapterSlugs = new Set<string>();
  const seenArticleKeys = new Set<string>();

  // Upsert chapters and their articles
  for (let ci = 0; ci < incomingChapters.length; ci++) {
    const ch = incomingChapters[ci];
    const chSlug = ch.slug || toSlug(ch.title);
    seenChapterSlugs.add(chSlug);

    const existing = existChapterMap.get(chSlug);
    let chapterId: string;

    if (existing) {
      // Update
      await db
        .from("chapters")
        .update({ title: ch.title, group: ch.group ?? null, order: ci })
        .eq("id", existing.id);
      chapterId = existing.id;
      stats.chapters.updated++;
    } else {
      // Create
      const { data } = await db
        .from("chapters")
        .insert({
          project_id: project.id,
          title: ch.title,
          slug: chSlug,
          group: ch.group ?? null,
          order: ci,
        })
        .select("id")
        .single();
      chapterId = data!.id;
      stats.chapters.created++;
    }

    // Upsert articles within this chapter
    for (let ai = 0; ai < (ch.articles ?? []).length; ai++) {
      const art = ch.articles![ai];
      const artSlug = art.slug || toSlug(art.title);
      const lang = art.language || "en";
      const artKey = `${chapterId}:${artSlug}:${lang}`;
      seenArticleKeys.add(artKey);

      const { doc, text } = markdownToTiptapRaw(art.content);
      const existingArt = existArticleMap.get(artKey);

      if (existingArt) {
        await db
          .from("articles")
          .update({
            title: art.title,
            content_json: doc,
            content_text: text,
            status: art.status || "draft",
            order: ai,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingArt.id);
        stats.articles.updated++;
      } else {
        await db.from("articles").insert({
          project_id: project.id,
          chapter_id: chapterId,
          title: art.title,
          slug: artSlug,
          language: lang,
          content_json: doc,
          content_text: text,
          status: art.status || "draft",
          order: ai,
        });
        stats.articles.created++;
      }
    }
  }

  // Delete chapters not in payload
  for (const [chSlug, ch] of existChapterMap) {
    if (!seenChapterSlugs.has(chSlug)) {
      await db.from("chapters").delete().eq("id", ch.id);
      stats.chapters.deleted++;
    }
  }

  // Delete articles not in payload (only those whose chapter survived — deleted chapters cascade)
  const survivingChapterIds = new Set(
    [...existChapterMap.entries()]
      .filter(([slug]) => seenChapterSlugs.has(slug))
      .map(([, ch]) => ch.id)
  );
  for (const [artKey, art] of existArticleMap) {
    if (!seenArticleKeys.has(artKey)) {
      if (!art.chapter_id || survivingChapterIds.has(art.chapter_id)) {
        await db.from("articles").delete().eq("id", art.id);
        stats.articles.deleted++;
      }
    }
  }

  return Response.json(stats);
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/
git commit --no-gpg-sign -m "feat(api): add v1 sync endpoint for declarative doc reconciliation"
```

---

### Task 8: API key management routes (session-authed)

**Files:**
- Create: `app/api/api-keys/route.ts`
- Create: `app/api/api-keys/[id]/route.ts`

- [ ] **Step 1: Create GET + POST /api/api-keys**

Create `app/api/api-keys/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/queries/projects";
import { generateApiKey } from "@/lib/api-key-auth";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const orgId = await getUserOrg();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_by, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const orgId = await getUserOrg();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 422 });

  const { key, hash, prefix } = generateApiKey();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id: orgId,
      name: body.name,
      key_hash: hash,
      key_prefix: prefix,
      created_by: user.id,
    })
    .select("id, name, key_prefix, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the full key — this is the only time it's visible
  return NextResponse.json({ ...data, key }, { status: 201 });
}
```

- [ ] **Step 2: Create PATCH /api/api-keys/:id (revoke)**

Create `app/api/api-keys/[id]/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await request.json();

  if (body.revoked) {
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add app/api/api-keys/
git commit --no-gpg-sign -m "feat: add API key management routes (session auth)"
```

---

### Task 9: API key management UI page

**Files:**
- Create: `app/(dashboard)/dashboard/api-keys/page.tsx`
- Create: `components/dashboard/api-key-table.tsx`
- Modify: `components/dashboard/app-sidebar.tsx`

- [ ] **Step 1: Create the API key table component**

Create `components/dashboard/api-key-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Copy, Plus, Key } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function ApiKeyTable({ keys: initialKeys }: { keys: ApiKey[] }) {
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });
    const data = await res.json();
    setLoading(false);

    if (data.key) {
      setCreatedKey(data.key);
      setKeys((prev) => [{ ...data, last_used_at: null, revoked_at: null }, ...prev]);
      setNewKeyName("");
    }
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/api-keys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revoked: true }),
    });
    setKeys((prev) =>
      prev.map((k) =>
        k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k
      )
    );
  }

  function handleCopy() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDialogClose(open: boolean) {
    if (!open) {
      setCreatedKey(null);
      setNewKeyName("");
    }
    setCreateOpen(open);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <Dialog open={createOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            {createdKey ? (
              <>
                <DialogHeader>
                  <DialogTitle>API Key Created</DialogTitle>
                  <DialogDescription>
                    Copy this key now. It won't be shown again.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm break-all">
                  {createdKey}
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCopy}>
                    <Copy className="size-4" />
                  </Button>
                </div>
                {copied && <p className="text-sm text-green-600">Copied!</p>}
                <DialogFooter>
                  <Button onClick={() => handleDialogClose(false)}>Done</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    This key will have full write access to all projects in your organization.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  placeholder="Key name (e.g. Claude Code docs agent)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newKeyName.trim()) handleCreate();
                  }}
                />
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={!newKeyName.trim() || loading}>
                    {loading ? "Creating..." : "Create"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {keys.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Key className="size-8 mx-auto mb-3 opacity-50" />
          <p>No API keys yet. Create one to get started.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {k.key_prefix}...
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(k.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {k.last_used_at
                    ? new Date(k.last_used_at).toLocaleDateString()
                    : "Never"}
                </TableCell>
                <TableCell>
                  {k.revoked_at ? (
                    <Badge variant="destructive">Revoked</Badge>
                  ) : (
                    <Badge variant="secondary">Active</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!k.revoked_at && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive">
                          Revoke
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will immediately disable the key &quot;{k.name}&quot;. Any agents using it will lose access.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRevoke(k.id)}>
                            Revoke
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the API Keys dashboard page**

Create `app/(dashboard)/dashboard/api-keys/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/queries/projects";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { ApiKeyTable } from "@/components/dashboard/api-key-table";

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const orgId = await getUserOrg();

  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <>
      <BreadcrumbNav items={[{ label: "API Keys" }]} />
      <div className="p-6">
        <ApiKeyTable keys={keys ?? []} />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Add API Keys link to the dashboard sidebar**

In `components/dashboard/app-sidebar.tsx`:

Add `Key` to the lucide-react imports:

```typescript
import { LayoutDashboard, FileText, Upload, Settings, Globe, BarChart3, Key } from "lucide-react";
```

Add a new nav item inside the `!currentProjectSlug` block, after the "All Projects" menu item:

```tsx
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/dashboard/api-keys"}>
                    <Link href="/dashboard/api-keys">
                      <Key className="size-4" />
                      <span>API Keys</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/dashboard/api-keys/ components/dashboard/api-key-table.tsx components/dashboard/app-sidebar.tsx
git commit --no-gpg-sign -m "feat: add API key management UI in dashboard"
```

---

### Task 10: Final verification

**Files:**
- None new — verification only

- [ ] **Step 1: Full build check**

```bash
pnpm build
```

Expected: Clean build with all new routes visible.

- [ ] **Step 2: Verify all new routes appear**

Check the build output for these routes:
- `/api/api-keys`
- `/api/api-keys/[id]`
- `/api/v1/projects`
- `/api/v1/projects/[slug]`
- `/api/v1/projects/[slug]/articles`
- `/api/v1/projects/[slug]/articles/[articleSlug]`
- `/api/v1/projects/[slug]/chapters`
- `/api/v1/projects/[slug]/chapters/[chapterSlug]`
- `/api/v1/projects/[slug]/sync`
- `/dashboard/api-keys`

- [ ] **Step 3: Commit any fixes if needed**

```bash
git add -A
git commit --no-gpg-sign -m "fix: address issues from final verification"
```
