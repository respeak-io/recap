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

- `POST /api/v1/projects/:slug/chapters` — create chapter
  - Body: `{ "title": "...", "description?": "...", "slug?": "...", "group?": "...", "order?": 0 }`
- `PATCH /api/v1/projects/:slug/chapters/:chapterSlug` — update chapter (title, description, slug, group, order, translations, content_json)
- `DELETE /api/v1/projects/:slug/chapters/:chapterSlug` — delete chapter

Chapter content is editable in the dashboard at `/project/:slug/chapter/:chapterSlug/edit` using the same Tiptap editor as articles. The `content_json` field stores the rich-text content (same format as article `content_json`).

The `description` field is a short plain-text subtitle shown below the title on both the chapter page and in navigation cards.

### Articles

- `POST /api/v1/projects/:slug/articles` — create article
  - Body: `{ "title": "...", "description?": "...", "content": "<markdown>", "chapter_slug?": "...", "slug?": "...", "language?": "en", "status?": "draft" }`
- `PATCH /api/v1/projects/:slug/articles/:articleSlug?lang=en` — update article (title, description, content, slug, status, language, chapter_slug)
- `DELETE /api/v1/projects/:slug/articles/:articleSlug?lang=en` — delete article

The `description` field is a short plain-text subtitle shown below the article title and in chapter page cards. It should NOT repeat the title — use it to explain what the article covers.

Content is always **Markdown** — the API converts it to the internal format. See the Markdown Features section below for supported syntax including callouts, steps, tabs, and accordions.

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
