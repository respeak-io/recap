# Reeldocs API Reference

Base URL: `https://<your-domain>/api/v1`

For local development: `http://localhost:3000/api/v1`.

## Authentication

All endpoints require an API key passed as a Bearer token:

```
Authorization: Bearer rd_<your-key>
```

API keys are org-scoped — they grant full read/write access to all projects in the organization. Create and manage keys in the dashboard under **API Keys**.

## Endpoints

### List Projects

```
GET /api/v1/projects
```

Returns all projects in the org.

**Response:**
```json
[
  { "id": "uuid", "name": "My Docs", "slug": "my-docs", "subtitle": "Welcome to the docs.", "translations": { "de": { "name": "Meine Doku", "subtitle": "Willkommen" } }, "is_public": true }
]
```

### Get Project

```
GET /api/v1/projects/:slug
```

Returns project with full chapter and article tree.

**Response:**
```json
{
  "id": "uuid",
  "name": "My Docs",
  "slug": "my-docs",
  "subtitle": "Welcome to the docs.",
  "translations": { "de": { "name": "Meine Doku", "subtitle": "Willkommen" } },
  "chapters": [
    {
      "id": "uuid",
      "title": "Getting Started",
      "slug": "getting-started",
      "group": "Basics",
      "order": 0,
      "articles": [
        {
          "id": "uuid",
          "title": "Installation",
          "slug": "installation",
          "language": "en",
          "status": "published",
          "order": 0
        }
      ]
    }
  ]
}
```

### Update Project

```
PATCH /api/v1/projects/:slug
```

**Body:** Any subset of `{ name, subtitle, translations }`.

```json
{
  "name": "Updated Name",
  "subtitle": "Updated subtitle",
  "translations": {
    "de": { "name": "Neuer Name", "subtitle": "Neuer Untertitel" }
  }
}
```

**Response:** `200` with `{ "ok": true }`.

Chapters have their own public pages at `/{projectSlug}/{chapterSlug}`. These pages display the chapter title, any rich-text content (also editable via the dashboard at `/project/:slug/chapter/:chapterSlug/edit`), and a card grid linking to all child articles. The `content_json` field stores the rich-text content (same Tiptap format as article `content_json`).

### Create Chapter

```
POST /api/v1/projects/:slug/chapters
```

**Body:**
```json
{
  "title": "Getting Started",
  "description": "Set up your project from scratch",
  "slug": "getting-started",
  "group": "Basics",
  "order": 0,
  "content": "## Overview\n\nThis chapter walks you through initial setup.",
  "keywords": ["onboarding", "setup"],
  "translations": {
    "de": { "title": "Erste Schritte", "group": "Grundlagen" }
  }
}
```

- `slug` — optional, auto-generated from title if omitted
- `description` — optional, short plain-text subtitle shown below the title on the chapter page and in navigation cards
- `group` — optional, non-clickable section title above the chapter in the sidebar
- `order` — optional, appended at end if omitted
- `content` — optional, **Markdown** converted to internal format server-side
- `keywords` — optional, see [Keywords](#keywords)
- `translations` — optional, per-language overrides for `title` and `group`. The sidebar shows the translated version for the current language, falling back to the default.

**Response:** `201` with the created chapter.

### Get Chapter

```
GET /api/v1/projects/:slug/chapters/:chapterSlug
```

Returns a single chapter with all fields including `content_json`, `translations`, and its articles sorted by order.

**Response:**
```json
{
  "id": "uuid",
  "title": "Getting Started",
  "slug": "getting-started",
  "description": "Set up your project from scratch",
  "group": "Basics",
  "order": 0,
  "content_json": { "type": "doc", "content": [...] },
  "translations": { "de": { "title": "Erste Schritte", "content_json": {...} } },
  "articles": [
    { "id": "uuid", "title": "Installation", "slug": "installation", "language": "en", "status": "published", "order": 0 }
  ]
}
```

### Update Chapter

```
PATCH /api/v1/projects/:slug/chapters/:chapterSlug
```

**Body:** Any subset of `{ title, description, slug, group, order, content, content_json, keywords, translations }`.

If `content` is provided (Markdown), it is converted to `content_json`. If both are provided, `content_json` takes precedence. See [Keywords](#keywords) for `keywords` semantics.

### Delete Chapter

```
DELETE /api/v1/projects/:slug/chapters/:chapterSlug
```

Deletes the chapter. Articles in the chapter become uncategorized.

**Response:** `204` No Content.

### Create Article

```
POST /api/v1/projects/:slug/articles
```

**Body:**
```json
{
  "title": "Installation Guide",
  "description": "Install dependencies and configure your environment",
  "slug": "installation",
  "chapter_slug": "getting-started",
  "content": "# Installation\n\nRun `npm install reeldocs`...",
  "language": "en",
  "status": "published",
  "keywords": ["install", "deps"]
}
```

- `content` — **Markdown**. Converted to the internal format server-side. See [Markdown Features](#markdown-features) for supported syntax.
- `description` — optional, short plain-text subtitle shown below the title and in chapter page cards. Should not repeat the title — use it to explain what the article covers.
- `slug` — optional, auto-generated from title if omitted
- `chapter_slug` — optional, article is uncategorized if omitted
- `language` — defaults to `"en"`
- `status` — `"draft"` (default) or `"published"`
- `keywords` — optional, see [Keywords](#keywords)

**Response:** `201` with the created article.

### Update Article

```
PATCH /api/v1/projects/:slug/articles/:articleSlug?lang=en
```

**Body:** Any subset of `{ title, description, slug, chapter_slug, content, language, status, keywords }`.

- If `content` is provided, it's re-converted from Markdown
- `?lang=en` targets a specific language variant (defaults to `en`)
- Set `chapter_slug` to `null` to uncategorize
- See [Keywords](#keywords) for `keywords` semantics

### Delete Article

```
DELETE /api/v1/projects/:slug/articles/:articleSlug?lang=en
```

- `?lang=en` deletes a specific language variant
- Without `?lang`, deletes all language variants

**Response:** `204` No Content.

### Sync (Declarative Reconciliation)

```
PUT /api/v1/projects/:slug/sync
```

Send the full desired doc structure. The API diffs against the current state: creates new chapters/articles, updates existing ones (matched by slug), and deletes anything not in the payload.

Optionally include `name`, `subtitle`, and/or `translations` at the top level to update the project itself.

**Body:**
```json
{
  "name": "My Docs",
  "subtitle": "Welcome to the docs.",
  "translations": { "de": { "name": "Meine Doku", "subtitle": "Willkommen" } },
  "chapters": [
    {
      "title": "Getting Started",
      "description": "Set up your project from scratch",
      "slug": "getting-started",
      "group": "Basics",
      "content": "## Overview\n\nThis chapter walks you through initial setup.",
      "keywords": ["onboarding", "setup"],
      "translations": {
        "de": { "title": "Erste Schritte", "group": "Grundlagen" }
      },
      "articles": [
        {
          "title": "Installation",
          "description": "Install dependencies and configure your environment",
          "slug": "installation",
          "content": "# Installation\n\nRun `npm install`...",
          "language": "en",
          "status": "published",
          "keywords": ["install", "deps"]
        },
        {
          "title": "Installation",
          "slug": "installation",
          "content": "# Installation\n\nFühre `npm install` aus...",
          "language": "de",
          "status": "published"
        },
        {
          "title": "Quick Start",
          "slug": "quick-start",
          "content": "# Quick Start\n\n...",
          "language": "en",
          "status": "published"
        }
      ]
    }
  ]
}
```

- Chapters are matched by `slug`
- Articles are matched by `slug` + `language`
- `order` is set by array position
- Chapters/articles not in the payload are **deleted**
- **Multilingual articles:** Each language variant is a separate entry with the same `slug` but different `language`. If you only include `"language": "en"` entries, all other language variants will be deleted.
- **`translations` is for chapters only** (sidebar title/group). Article content per language must be sent as separate article entries.
- **Keywords behavior:** Sync treats `keywords` differently from other fields. If a chapter or article object **includes** a `keywords` array, it replaces the entity's keywords (with the same normalization + validation as the PATCH endpoints). If `keywords` is **omitted**, existing keywords are preserved (NOT cleared). This is intentional: an external keyword-generation pipeline may run independently of doc sync, and Sync should not silently erase its work. To explicitly clear keywords, send `"keywords": []`.

**Response:**
```json
{
  "chapters": { "created": 1, "updated": 2, "deleted": 0 },
  "articles": { "created": 3, "updated": 5, "deleted": 1 }
}
```

## Media

Media must be uploaded before it can be referenced in article content. Use the returned `url` in Markdown images (`![alt](url)`) or the returned `videoId` in video embeds (`[project-video:<videoId>]`).

### Upload Images

```
POST /api/v1/projects/:slug/media/images
```

Upload one or more images. Send as `multipart/form-data` with one or more `file` fields.

**Constraints:** PNG, JPEG, GIF, WebP, SVG only. Max 10MB per file.

**Single file response** (`201`):
```json
{ "imageId": "uuid", "url": "https://...", "filename": "photo.png" }
```

**Multiple files response** (`201`):
```json
{
  "images": [
    { "imageId": "uuid", "url": "https://...", "filename": "photo1.png" }
  ],
  "errors": [
    { "filename": "bad.exe", "error": "File must be an image" }
  ]
}
```

### List Images

```
GET /api/v1/projects/:slug/media/images
```

**Response:**
```json
{
  "images": [
    { "id": "uuid", "url": "https://...", "filename": "photo.png", "alt_text": "A photo", "width": 800, "height": 600, "created_at": "2026-04-03T12:00:00Z" }
  ]
}
```

### Update Image

```
PATCH /api/v1/projects/:slug/media/images/:imageId
```

**Body:** Any subset of `{ "alt_text": "Updated description", "width": 400, "height": 300 }`

**Response:** `200` with the updated image object.

### Delete Image

```
DELETE /api/v1/projects/:slug/media/images/:imageId
```

**Response:** `204` No Content.

### Batch Delete Images

```
POST /api/v1/projects/:slug/media/images/batch-delete
```

**Body:** `{ "ids": ["uuid-1", "uuid-2"] }`

**Response:**
```json
{ "deleted": ["uuid-1"], "errors": [{ "id": "uuid-2", "error": "Image not found" }] }
```

### Upload Videos

```
POST /api/v1/projects/:slug/media/videos
```

Upload one or more videos. Send as `multipart/form-data` with one or more `file` fields. Optional form fields: `language` (default `"en"`), `videoGroupId` (auto-generated if omitted).

**Constraints:** MP4, WebM, MOV only. Max 25MB per file.

**Single file response** (`201`):
```json
{ "videoId": "uuid", "title": "demo", "videoGroupId": "uuid" }
```

**Multiple files response** (`201`):
```json
{
  "videos": [
    { "videoId": "uuid", "title": "demo", "videoGroupId": "uuid" }
  ],
  "errors": [
    { "filename": "huge.mp4", "error": "File too large (max 25MB)" }
  ]
}
```

### List Videos

```
GET /api/v1/projects/:slug/media/videos
```

**Response:**
```json
{
  "videos": [
    { "id": "uuid", "title": "Demo Video", "language": "en", "videoGroupId": "uuid", "status": "ready", "created_at": "2026-04-03T12:00:00Z" }
  ]
}
```

### Update Video

```
PATCH /api/v1/projects/:slug/media/videos/:videoId
```

**Body:** `{ "title": "Updated Title" }`

**Response:** `200` with the updated video object.

### Delete Video

```
DELETE /api/v1/projects/:slug/media/videos/:videoId
```

**Response:** `204` No Content.

### Batch Delete Videos

```
POST /api/v1/projects/:slug/media/videos/batch-delete
```

**Body:** `{ "ids": ["uuid-1", "uuid-2"] }`

**Response:**
```json
{ "deleted": ["uuid-1"], "errors": [{ "id": "uuid-2", "error": "Video not found" }] }
```

## Keywords

Articles and chapters both accept an optional `keywords: string[]` field on `POST` (create) and `PATCH` (update). Keywords boost search ranking — article keywords are weighted equal to the title; chapter keywords contribute lower weight to all articles within the chapter.

**Replace semantics.** `PATCH { "keywords": ["a", "b"] }` sets the array to exactly `["a", "b"]`. `PATCH { "keywords": [] }` clears it. Omitting the field leaves existing keywords unchanged.

**Server-side normalization.** Before persisting, the server:

1. Trims whitespace.
2. Strips leading `#` characters.
3. Lowercases each keyword.
4. Deduplicates (first occurrence wins, order preserved).
5. Drops empty strings.

Clients may send raw values (e.g. `"#Onboarding"`, `"  Error  "`, duplicates) — they will come back normalized in `GET`/`PATCH` responses.

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
{ "id": "...", "title": "...", "keywords": ["onboarding", "error-handling"], "...": "..." }
```

Generation of keywords (e.g. from article content via an LLM) is the caller's responsibility — this API is a pure read/write contract.

## Markdown Features

Article and chapter `content` is sent as Markdown and converted to the internal Tiptap format server-side. Standard Markdown is fully supported: headings, paragraphs, bold, italic, inline code, links, images, code blocks (with language), blockquotes, tables, horizontal rules, lists.

Additionally, these custom blocks are converted to rich editor components:

### Callouts

```markdown
:::note
This is an informational callout.
:::

:::warning
Be careful with this action.
:::

:::tip
Here's a useful tip.
:::
```

Types: `note` (or `info`), `warning`, `tip`.

### Steps

````markdown
:::steps
### Install dependencies
Run `npm install` to get started.

### Configure the app
Create a `.env` file with your settings.

### Start the server
Run `npm run dev` to launch.
:::
````

Each `###` heading starts a new step. The heading text becomes the step title.

### Tabs

````markdown
:::tabs
::tab{title="npm"}
```bash
npm install reeldocs
```

::tab{title="pnpm"}
```bash
pnpm add reeldocs
```

::tab{title="yarn"}
```bash
yarn add reeldocs
```
:::
````

### Accordions

```markdown
<details>
<summary>Click to expand</summary>
This content is hidden by default and revealed on click.
</details>
```

## Error Format

All errors return:

```json
{ "error": "Human-readable message", "code": "ERROR_CODE" }
```

| Code | Status | Meaning |
|------|--------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `FORBIDDEN` | 403 | Key doesn't have access to this project |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Slug already exists |
| `VALIDATION_ERROR` | 422 | Invalid request body |
