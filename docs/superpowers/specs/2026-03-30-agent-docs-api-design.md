# Agent-Driven Documentation API

## Summary

Enable AI agents (e.g. Claude Code with git repo access) to create and manage complete documentation projects via API. An org-scoped API key grants full write access to all projects in the organization. The API accepts Markdown content and converts it to the internal Tiptap JSON format server-side.

## Scope

**In scope:**
- `api_keys` table and key lifecycle (create, list, revoke)
- Bearer token auth middleware for `/api/v1/` routes
- CRUD endpoints for chapters and articles
- Sync endpoint for declarative full-project reconciliation
- Markdown → Tiptap JSON conversion utility
- API key management UI (org-level page in dashboard)

**Out of scope:**
- Per-project key scoping (future enhancement via `project_ids` column)
- Rate limiting (can be added later)
- Webhook notifications on content changes
- Project creation/deletion via API (managed in dashboard)

## 1. Data Model

### `api_keys` table

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
```

### Key format

- Prefix: `rd_`
- Body: 40 random hex characters
- Example: `rd_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0`
- Storage: only the SHA-256 hash of the full key is stored
- Display: only the prefix (`rd_a1b2c3d4...`) is shown after creation

### RLS

API key routes use the service client (bypasses RLS). The `api_keys` table itself needs RLS for the management UI:

- SELECT: `is_org_member(org_id)`
- INSERT: `is_org_writer(org_id)`
- DELETE: `is_org_writer(org_id)` (for hard deletes if needed)

## 2. Auth Middleware

A shared `validateApiKey(request: Request)` function used by all `/api/v1/` routes:

1. Extract `Authorization: Bearer <token>` header
2. Hash the token with SHA-256
3. Look up `api_keys` where `key_hash` matches and `revoked_at IS NULL`
4. If not found or revoked: return 401
5. Update `last_used_at` (fire-and-forget, don't block the response)
6. Return `{ orgId, keyId }` for the route to use

The route then creates a service client (`createServiceClient()`) and scopes all queries with `WHERE org_id = <orgId>` (via project lookup). This is the same pattern used by video processing background jobs.

## 3. API Endpoints

All under `/api/v1/`. All require `Authorization: Bearer <api-key>` header.

### Projects

**`GET /api/v1/projects`** — List all projects in the org.

Response:
```json
[{ "id": "uuid", "name": "My Docs", "slug": "my-docs", "is_public": true }]
```

**`GET /api/v1/projects/:slug`** — Get project with full chapter/article tree.

Response:
```json
{
  "id": "uuid",
  "name": "My Docs",
  "slug": "my-docs",
  "chapters": [
    {
      "id": "uuid",
      "title": "Getting Started",
      "slug": "getting-started",
      "group": "Basics",
      "order": 0,
      "articles": [
        { "id": "uuid", "title": "Installation", "slug": "installation", "language": "en", "status": "published", "order": 0 }
      ]
    }
  ]
}
```

### Chapters

**`POST /api/v1/projects/:slug/chapters`** — Create chapter.

Body:
```json
{ "title": "Getting Started", "slug": "getting-started", "group": "Basics", "order": 0 }
```
- `slug` is optional — auto-generated from title if omitted
- `group` is optional
- `order` is optional — appended at end if omitted

**`PATCH /api/v1/projects/:slug/chapters/:chapterSlug`** — Update chapter.

Body: any subset of `{ title, slug, group, order }`.

**`DELETE /api/v1/projects/:slug/chapters/:chapterSlug`** — Delete chapter and all its articles.

### Articles

**`POST /api/v1/projects/:slug/articles`** — Create article.

Body:
```json
{
  "title": "Installation Guide",
  "slug": "installation",
  "chapter_slug": "getting-started",
  "content": "# Installation\n\nRun `npm install`...",
  "language": "en",
  "status": "published"
}
```
- `content` is Markdown — converted to Tiptap JSON server-side
- `slug` is optional — auto-generated from title if omitted
- `language` defaults to `"en"`
- `status` defaults to `"draft"`
- `chapter_slug` is optional — article can be uncategorized

**`PATCH /api/v1/projects/:slug/articles/:articleSlug`** — Update article.

Body: any subset of `{ title, slug, chapter_slug, content, language, status }`.
- If `content` is provided, it's re-converted from Markdown to Tiptap JSON

Query parameter: `?lang=en` to target a specific language variant (defaults to `en`).

**`DELETE /api/v1/projects/:slug/articles/:articleSlug`** — Delete article.

Query parameter: `?lang=en` to delete a specific language variant. Without `?lang`, deletes all language variants.

### Sync

**`PUT /api/v1/projects/:slug/sync`** — Declarative reconciliation.

Body:
```json
{
  "chapters": [
    {
      "title": "Getting Started",
      "slug": "getting-started",
      "group": "Basics",
      "articles": [
        {
          "title": "Installation",
          "slug": "installation",
          "content": "# Installation\n...",
          "language": "en",
          "status": "published"
        }
      ]
    }
  ]
}
```

Behavior:
1. Fetch all existing chapters and articles for the project
2. For each chapter in the payload: create if new (match by slug), update if exists
3. For each article in the payload: create if new (match by slug + language), update if exists
4. Delete chapters not in the payload (and their articles)
5. Delete articles not in the payload (within matched chapters)
6. Set `order` based on array position

Response:
```json
{
  "chapters": { "created": 1, "updated": 2, "deleted": 0 },
  "articles": { "created": 3, "updated": 5, "deleted": 1 }
}
```

## 4. Markdown Conversion

### New function: `markdownToTiptapRaw(markdown: string)`

Located in `lib/ai/markdown-to-tiptap.ts` alongside the existing `markdownToTiptap(sections)`.

- Takes a raw Markdown string
- Tokenizes with `marked.Lexer`
- Runs tokens through the existing `tokensToTiptap()` internal function
- Returns `{ type: "doc", content: TiptapNode[] }`
- Also returns extracted plain text for the `content_text` FTS field

The existing `markdownToTiptap(sections)` used by video processing stays unchanged.

## 5. API Key Management UI

### Location

New page in the dashboard, accessible from the sidebar. Org-level (not project-level).

### Components

**API Keys page (`/dashboard/api-keys`):**
- Table showing: name, key prefix, created by, created date, last used, status (active/revoked)
- "Create API Key" button
- Revoke button per key (with confirmation dialog)

**Create dialog:**
- Input: key name (e.g. "Claude Code docs agent")
- On create: POST to `/api/api-keys` → returns the full key
- Show full key once with copy button
- Warning: "This key won't be shown again"

**Revoke flow:**
- Confirmation dialog
- PATCH to `/api/api-keys/:id` with `{ revoked: true }` → sets `revoked_at`
- Key stays in the table with "Revoked" badge

### API routes for key management

These use the existing session-based auth (not the API key auth):

- `GET /api/api-keys` — list keys for user's org
- `POST /api/api-keys` — create key, return full key in response
- `PATCH /api/api-keys/:id` — revoke key (set `revoked_at`)

## 6. Error Responses

All `/api/v1/` endpoints return consistent error format:

```json
{ "error": "message", "code": "ERROR_CODE" }
```

Codes:
- `UNAUTHORIZED` (401) — missing or invalid API key
- `FORBIDDEN` (403) — key doesn't have access to this project (wrong org)
- `NOT_FOUND` (404) — project, chapter, or article not found
- `CONFLICT` (409) — slug already exists
- `VALIDATION_ERROR` (422) — invalid request body

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260330100000_api_keys.sql` | Create api_keys table, indexes, RLS policies |
| `lib/api-key-auth.ts` | `validateApiKey()` middleware helper |
| `lib/ai/markdown-to-tiptap.ts` | Add `markdownToTiptapRaw()` function |
| `app/api/v1/projects/route.ts` | GET list projects |
| `app/api/v1/projects/[slug]/route.ts` | GET project with tree |
| `app/api/v1/projects/[slug]/chapters/route.ts` | POST create chapter |
| `app/api/v1/projects/[slug]/chapters/[chapterSlug]/route.ts` | PATCH, DELETE chapter |
| `app/api/v1/projects/[slug]/articles/route.ts` | POST create article |
| `app/api/v1/projects/[slug]/articles/[articleSlug]/route.ts` | PATCH, DELETE article |
| `app/api/v1/projects/[slug]/sync/route.ts` | PUT sync |
| `app/api/api-keys/route.ts` | GET list, POST create (session auth) |
| `app/api/api-keys/[id]/route.ts` | PATCH revoke (session auth) |
| `app/(dashboard)/dashboard/api-keys/page.tsx` | API keys management page |
| `components/dashboard/api-key-table.tsx` | Key list + create/revoke UI |
| `components/dashboard/app-sidebar.tsx` | Add API Keys nav link |
