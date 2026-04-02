# Reeldocs API Reference

Base URL: `https://<your-domain>/api/v1`

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

### Create Chapter

```
POST /api/v1/projects/:slug/chapters
```

**Body:**
```json
{
  "title": "Getting Started",
  "slug": "getting-started",
  "group": "Basics",
  "order": 0,
  "translations": {
    "de": { "title": "Erste Schritte", "group": "Grundlagen" }
  }
}
```

- `slug` — optional, auto-generated from title if omitted
- `group` — optional, non-clickable section title above the chapter in the sidebar
- `order` — optional, appended at end if omitted
- `translations` — optional, per-language overrides for `title` and `group`. The sidebar shows the translated version for the current language, falling back to the default.

**Response:** `201` with the created chapter.

### Update Chapter

```
PATCH /api/v1/projects/:slug/chapters/:chapterSlug
```

**Body:** Any subset of `{ title, slug, group, order }`.

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
  "slug": "installation",
  "chapter_slug": "getting-started",
  "content": "# Installation\n\nRun `npm install reeldocs`...",
  "language": "en",
  "status": "published"
}
```

- `content` — **Markdown**. Converted to the internal format server-side.
- `slug` — optional, auto-generated from title if omitted
- `chapter_slug` — optional, article is uncategorized if omitted
- `language` — defaults to `"en"`
- `status` — `"draft"` (default) or `"published"`

**Response:** `201` with the created article.

### Update Article

```
PATCH /api/v1/projects/:slug/articles/:articleSlug?lang=en
```

**Body:** Any subset of `{ title, slug, chapter_slug, content, language, status }`.

- If `content` is provided, it's re-converted from Markdown
- `?lang=en` targets a specific language variant (defaults to `en`)
- Set `chapter_slug` to `null` to uncategorize

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
      "slug": "getting-started",
      "group": "Basics",
      "translations": {
        "de": { "title": "Erste Schritte", "group": "Grundlagen" }
      },
      "articles": [
        {
          "title": "Installation",
          "slug": "installation",
          "content": "# Installation\n\nRun `npm install`...",
          "language": "en",
          "status": "published"
        },
        {
          "title": "Quick Start",
          "slug": "quick-start",
          "content": "# Quick Start\n\n...",
          "status": "published"
        }
      ]
    }
  ]
}
```

- Chapters and articles are matched by `slug`
- Articles are matched by `slug` + `language`
- `order` is set by array position
- Chapters/articles not in the payload are **deleted**

**Response:**
```json
{
  "chapters": { "created": 1, "updated": 2, "deleted": 0 },
  "articles": { "created": 3, "updated": 5, "deleted": 1 }
}
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
