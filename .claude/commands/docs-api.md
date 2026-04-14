# Reeldocs Documentation API

Use this when working with the Reeldocs documentation API — creating, updating, or syncing documentation content via the REST API.

## Authentication

All `/api/v1/` endpoints require a Bearer token:

```bash
curl -H "Authorization: Bearer rd_<key>" https://<domain>/api/v1/projects
```

For local development, the base URL is `http://localhost:3000/api/v1`.

## Available Endpoints

### Read

- `GET /api/v1/projects` — list all projects (returns id, name, slug, subtitle, translations, is_public)
- `GET /api/v1/projects/:slug` — get project with full chapter/article tree (includes subtitle, translations)

### Update Project

- `PATCH /api/v1/projects/:slug` — update project (name, subtitle, translations)
  - Body: any subset of `{ "name": "...", "subtitle": "...", "translations": { "de": { "name": "...", "subtitle": "..." } } }`

### Chapters

Chapters have their own public pages at `/{projectSlug}/{chapterSlug}`. These pages display the chapter title, any rich-text content (edited via the dashboard), and a card grid linking to all child articles.

- `GET /api/v1/projects/:slug/chapters/:chapterSlug` — get single chapter with content_json, translations, and articles
- `POST /api/v1/projects/:slug/chapters` — create chapter
  - Body: `{ "title": "...", "description?": "...", "content?": "<markdown>", "slug?": "...", "group?": "...", "order?": 0, "keywords?": ["tag1", "tag2"] }`
- `PATCH /api/v1/projects/:slug/chapters/:chapterSlug` — update chapter (title, description, content, slug, group, order, translations, content_json, keywords)
- `DELETE /api/v1/projects/:slug/chapters/:chapterSlug` — delete chapter

Chapter content is editable in the dashboard at `/project/:slug/chapter/:chapterSlug/edit` using the same Tiptap editor as articles. The `content_json` field stores the rich-text content (same format as article `content_json`).

The `description` field is a short plain-text subtitle shown below the title on both the chapter page and in navigation cards.

### Articles

- `POST /api/v1/projects/:slug/articles` — create article
  - Body: `{ "title": "...", "description?": "...", "content": "<markdown>", "chapter_slug?": "...", "slug?": "...", "language?": "en", "status?": "draft", "keywords?": ["tag1", "tag2"] }`
- `PATCH /api/v1/projects/:slug/articles/:articleSlug?lang=en` — update article (title, description, content, slug, status, language, chapter_slug, keywords)
- `DELETE /api/v1/projects/:slug/articles/:articleSlug?lang=en` — delete article

The `description` field is a short plain-text subtitle shown below the article title and in chapter page cards. It should NOT repeat the title — use it to explain what the article covers.

Content is always **Markdown** — the API converts it to the internal format. See the Markdown Features section below for supported syntax including callouts, steps, tabs, and accordions.

### Keywords

Articles and chapters both accept an optional `keywords: string[]` field on `POST` (create) and `PATCH` (update). Keywords boost search ranking — article keywords are weighted equal to the title; chapter keywords contribute lower weight to all articles within the chapter.

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

Generation of keywords (e.g. from article content via an LLM) is the caller's responsibility — this API is a pure read/write contract.

### Media

Media must be uploaded before it can be referenced in article/chapter content.

**Images:**
- `POST /api/v1/projects/:slug/media/images` — upload image(s), multipart/form-data with `file` field(s). Returns `{ imageId, url, filename }`. Use the `url` in Markdown: `![alt](url)`
- `GET /api/v1/projects/:slug/media/images` — list all images
- `PATCH /api/v1/projects/:slug/media/images/:imageId` — update alt_text, width, height
- `DELETE /api/v1/projects/:slug/media/images/:imageId` — delete image
- `POST /api/v1/projects/:slug/media/images/batch-delete` — batch delete, body: `{ "ids": [...] }`

**Videos:**
- `POST /api/v1/projects/:slug/media/videos` — upload video(s), multipart/form-data with `file` field(s), optional `language` and `videoGroupId`. Returns `{ videoId, title, videoGroupId }`. Use `videoId` in Markdown: `[project-video:<videoId>]`
- `GET /api/v1/projects/:slug/media/videos` — list all videos
- `PATCH /api/v1/projects/:slug/media/videos/:videoId` — update title
- `DELETE /api/v1/projects/:slug/media/videos/:videoId` — delete video
- `POST /api/v1/projects/:slug/media/videos/batch-delete` — batch delete, body: `{ "ids": [...] }`

Constraints: Images max 10MB (PNG, JPEG, GIF, WebP, SVG). Videos max 25MB (MP4, WebM, MOV).

### Sync (Recommended for bulk operations)

```bash
curl -X PUT \
  -H "Authorization: Bearer rd_<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Docs",
    "subtitle": "Welcome to the docs.",
    "translations": { "de": { "name": "Meine Doku", "subtitle": "Willkommen" } },
    "chapters": [
      {
        "title": "Getting Started",
        "description": "Set up your project from scratch",
        "content": "## Overview\n\nThis chapter walks you through initial setup.",
        "slug": "getting-started",
        "group": "Basics",
        "articles": [
          {
            "title": "Installation",
            "description": "Install dependencies and configure your environment",
            "slug": "installation",
            "content": "## Install dependencies\n\n...",
            "status": "published"
          }
        ]
      }
    ]
  }' \
  http://localhost:3000/api/v1/projects/my-project/sync
```

Sync is declarative — send the full desired state. The API creates, updates, and **deletes** to match. Chapters/articles matched by slug. Order set by array position. Both chapters and articles accept `content` as Markdown — it is converted to the internal format automatically. Optionally include `name`, `subtitle`, and/or `translations` at the top level to update the project itself.

**Multilingual articles:** Each language variant must be a separate article entry with the same `slug` but different `language` field. If you only send `"language": "en"` entries, all other language variants (e.g. `"de"`) will be **deleted**. The `translations` field only works for chapters (sidebar title/group), NOT for article content.

Returns: `{ "chapters": { "created": N, "updated": N, "deleted": N }, "articles": { ... } }`

## Markdown Features

Standard markdown is fully supported: headings, paragraphs, bold, italic, inline code, links, images, code blocks (with language), blockquotes, tables, horizontal rules, lists.

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

Types: `note` (or `info`), `warning`, `tip`

### Steps

```markdown
:::steps
### Install dependencies
Run `npm install` to get started.

### Configure the app
Create a `.env` file with your settings.

### Start the server
Run `npm run dev` to launch.
:::
```

Each `###` heading starts a new step. The heading text becomes the step title.

### Tabs

```markdown
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
```

### Accordions

```markdown
<details>
<summary>Click to expand</summary>
This content is hidden by default and revealed on click.
</details>
```

### Multilingual Chapters

Chapters support translated titles and group names:

```json
{
  "title": "Getting Started",
  "group": "Basics",
  "translations": {
    "de": { "title": "Erste Schritte", "group": "Grundlagen" },
    "fr": { "title": "Pour commencer", "group": "Les bases" }
  }
}
```

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `UNAUTHORIZED` | 401 | Bad or missing API key |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Slug already exists |
| `VALIDATION_ERROR` | 422 | Invalid request body |

## Full reference

See `docs/api.md` for complete documentation with all response schemas.
