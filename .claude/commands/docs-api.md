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

- `GET /api/v1/projects` — list all projects
- `GET /api/v1/projects/:slug` — get project with full chapter/article tree

### Chapters

- `POST /api/v1/projects/:slug/chapters` — create chapter
  - Body: `{ "title": "...", "slug?": "...", "group?": "...", "order?": 0 }`
- `PATCH /api/v1/projects/:slug/chapters/:chapterSlug` — update chapter
- `DELETE /api/v1/projects/:slug/chapters/:chapterSlug` — delete chapter

### Articles

- `POST /api/v1/projects/:slug/articles` — create article
  - Body: `{ "title": "...", "content": "<markdown>", "chapter_slug?": "...", "slug?": "...", "language?": "en", "status?": "draft" }`
- `PATCH /api/v1/projects/:slug/articles/:articleSlug?lang=en` — update article
- `DELETE /api/v1/projects/:slug/articles/:articleSlug?lang=en` — delete article

Content is always **Markdown** — the API converts it to the internal format. See the Markdown Features section below for supported syntax including callouts, steps, tabs, and accordions.

### Sync (Recommended for bulk operations)

```bash
curl -X PUT \
  -H "Authorization: Bearer rd_<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "chapters": [
      {
        "title": "Getting Started",
        "slug": "getting-started",
        "group": "Basics",
        "articles": [
          {
            "title": "Installation",
            "slug": "installation",
            "content": "# Installation\n\n...",
            "status": "published"
          }
        ]
      }
    ]
  }' \
  http://localhost:3000/api/v1/projects/my-project/sync
```

Sync is declarative — send the full desired state. The API creates, updates, and **deletes** to match. Chapters/articles matched by slug. Order set by array position.

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
