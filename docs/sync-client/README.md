# Recap Sync Client

The official client for syncing a product repo's `docs/` folder to its Reeldocs
project. It ships as part of the [`@respeak/recap`](../../packages/cli) npm package
(`recap push` / `recap diff`) and is wrapped by the
[`recap-sync`](../../.github/actions/recap-sync/action.yml) GitHub Action, so
product repos no longer carry copy-pasted sync scripts — fixes propagate by
version bump.

Doc **content** still lives in each product repo as a `docs/` folder (markdown +
a `sync.json` manifest). This client only reads that folder and reconciles it
with the server.

## Commands

```bash
# Preview what a sync would change — reads only, writes nothing.
npx @respeak/recap diff ./05_end_user_docs --api-key rd_xxx

# Sync the folder to its project (declarative: anything not in sync.json is deleted).
npx @respeak/recap push ./05_end_user_docs --api-key rd_xxx
```

| Option | Default | Notes |
| --- | --- | --- |
| `<docsDir>` | — | Folder containing `sync.json` (and `en/`, `de/`, `media/`). |
| `--url <url>` | `https://docs.respeak.io` | Base URL; use `http://localhost:3000` for local dev. |
| `--api-key <key>` | `$RECAP_API_KEY` | Org API key (`rd_…`), created under **API Keys** in the dashboard. |
| `--dry-run` (push) | — | Same as `diff`. |
| `--exit-code` (diff) | off | Exit `1` when drift is found (default: `diff` is informational and exits `0`). |

## What it does

1. **Validate** `sync.json` against the folder: every referenced file must exist
   (error → abort); orphan `.md` files are reported as warnings.
2. **Upload media** in `media/` (images): new files are uploaded, existing ones
   reused, and image width/height set from the file header. Local `media/<file>`
   references in markdown are rewritten to the returned URLs.
3. **Process each markdown file**: strip the leading H1 (the title comes from the
   manifest), **rewrite relative `.md` cross-links to public slug URLs**
   (`[t](../05_multichat/02_trigger.md#step)` → `[t](/<project_slug>/trigger#step)`),
   and swap `media/<file>` paths for the uploaded URLs.
4. **Sync** the full structure via `PUT /api/v1/projects/:slug/sync`. Chapters are
   matched by `slug`, articles by `slug` + `language`; anything not in the payload
   is **deleted**. Omitting `keywords` preserves them; `[]` clears them.

`diff` reports the same picture without mutating: structural drift, per-article
content differences as a word-overlap %, media present on only one side, and
project-metadata differences.

## Cross-links

Source files link to each other with repo-relative paths so they stay navigable
in the editor and on GitHub. On the site, articles live at `/<project_slug>/<slug>`
(flat, by slug). The client builds a `file_path → slug` map from the manifest
(articles **and** chapter `_index` files) and rewrites each `.md` link against
its source file's directory, preserving any `#fragment`. `http(s)://`, `mailto:`,
in-page `#…` and absolute `/…` links are left untouched; unresolved `.md` links
are left as-is and printed as a warning. This rewrite is client-side because only
the client knows the source file tree.

## `sync.json` manifest

```jsonc
{
  "project_slug": "respeak-dialog-platform",
  "languages": ["en", "de"],          // default ["en", "de"]; "en" is the default language
  "name": "Respeak Dialog Platform",
  "subtitle": "…",
  "translations": { "de": { "name": "…", "subtitle": "…" } },
  "chapters": [
    {
      "slug": "getting-started",
      "title": "Getting Started",
      "group": "Basics",
      "order": 0,
      "description": "…",
      "content": {                      // per-language chapter intro (_index.md)
        "en": "en/01_getting-started/_index.md",
        "de": "de/01_erste-schritte/_index.md"
      },
      "keywords": ["onboarding", "…"],
      "translations": {
        "de": { "title": "Erste Schritte", "group": "Grundlagen", "description": "…" }
      },
      "articles": [
        {
          "slug": "sign-in",            // shared across languages
          "en": { "title": "Sign In", "file": "en/01_getting-started/01_sign-in.md", "description": "…", "keywords": ["login"] },
          "de": { "title": "Anmelden", "file": "de/01_erste-schritte/01_anmelden.md", "description": "…", "keywords": ["login"] }
        }
      ]
    }
  ]
}
```

Notes:

- The default-language (`en`) chapter `content` is sent **inline** and persisted
  directly by the sync endpoint. Other languages go to `translations.<lang>.content`.
- `translations` is chapter-level (sidebar title/group/description + intro);
  article language variants are separate per-language entries under each article.
- Chapter `order` sets the sidebar order. Within a chapter, article order follows
  the array.

## CI integration

The composite Action lives in this repo at `.github/actions/recap-sync/` and is
referenced from product repos by its repo path (no separate action repo needed).
See [`example-consumer-workflow.yml`](./example-consumer-workflow.yml): `diff` on
PRs, `push` on merge to `main`, triggered when `05_end_user_docs/**` changes.

```yaml
- uses: respeak-io/recap/.github/actions/recap-sync@v1
  with:
    docs-dir: 05_end_user_docs
    api-key: ${{ secrets.RECAP_API_KEY }}
    mode: ${{ github.event_name == 'pull_request' && 'diff' || 'push' }}
```

(Tag the platform repo `v1` — or pin to a commit/branch — so the `@v1` ref resolves.)

## Publishing the CLI

`@respeak/recap` is published from this repo by pushing a `recap-v*` tag (see
[`.github/workflows/publish-cli.yml`](../../.github/workflows/publish-cli.yml)),
which builds and runs `pnpm --filter @respeak/recap publish`. Bump
`packages/cli/package.json` version and the `.version(...)` in `src/index.ts`
together.

## Future / not yet built

- **Server-side `slug:` link scheme** (`[t](slug:foo)` → `/<project_slug>/foo`):
  documented option, deferred. The file-relative rewrite above stays client-side
  regardless, since the server has no knowledge of the source file tree.
- **Video media**: the API supports video upload, but there is no local-file →
  `[project-video:<id>]` mapping yet, so the client handles images only.
