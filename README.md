[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/reeldocs)](https://www.npmjs.com/package/reeldocs)

# Reeldocs

Record a product video, get documentation instantly.

```bash
npx reeldocs https://youtube.com/watch?v=your-video
```

<!-- [Hero GIF placeholder — will be added soon] -->

## What It Does

- **Video in, docs out** — Point it at a YouTube URL or local video file, get structured Markdown or MDX documentation
- **AI-powered** — Uses Gemini to extract transcription, visual context, and generate developer-friendly docs with timestamp references
- **Zero setup** — One command, no account needed. Just a free Gemini API key

## Try It Now

```bash
export GEMINI_API_KEY=your-key-from-https://ai.google.dev
npx reeldocs https://youtube.com/watch?v=your-video -o ./docs
```

That's it. Check `./docs/` for your generated documentation.

### Options

```
Usage: reeldocs [options] <source>

Arguments:
  source                 Video file path or URL

Options:
  -o, --output <dir>     Output directory (default: "./docs")
  -k, --api-key <key>    Gemini API key (or set GEMINI_API_KEY env var)
  -f, --format <format>  Output format: markdown, mdx (default: "markdown")
```

Use `--format mdx` for Docusaurus, Mintlify, or other MDX-based doc sites — adds YAML frontmatter with `title` and `sidebar_position`.

## Example Output

Some things only have YouTube videos for docs. Reeldocs fixes that:

- [BundID](gallery/bundid/) — Germany's digital identity system, docs scattered across government PDFs
- [Elektronische Patientenakte](gallery/elektronische-patientenakte/) — Germany's digital health record, docs fragmented across dozens of sites
- [ELSTER Tax Filing](gallery/elster-tax-filing/) — Germany's tax portal, so confusing it spawned an entire paid-software industry
- [FFmpeg](gallery/ffmpeg/) — the most used multimedia tool in the world, famously impenetrable docs
- [Respeak Document Intelligence](gallery/respeak-document-intelligence/) — our own platform, dogfooding Reeldocs

<details>
<summary>More examples</summary>

- [n8n Workflow Automation](gallery/n8n-workflow-automation/) — from a 2-min tutorial
- [Supabase Overview](gallery/supabase-overview/) — from the official product tour

</details>

## Comparison

| | Reeldocs | Scribe | Tango | Manual |
|---|---|---|---|---|
| Open source | Yes | No | No | N/A |
| From video | Yes | No (screenshots) | No (screenshots) | No |
| Self-hosted | Yes | No | No | N/A |
| Markdown/MDX output | Yes | No | No | Yes |
| Free | Yes | Freemium | Freemium | Yes |

## Full Platform

<details>
<summary>Reeldocs also includes a full web platform with a rich text editor, published docs site, and more.</summary>

### Features

- **Rich text editor** — Tiptap-based with code blocks, tables, images, callouts, and video timestamp links
- **Mintlify-style docs site** — Three-column layout with sidebar navigation, search, and language switching
- **Multi-language support** — Generate in English, translate to 7+ languages
- **Corporate identity** — Custom logos, brand colors, fonts, and CSS overrides
- **Analytics** — Page views, top articles, language breakdowns, search query tracking
- **llms.txt** — Auto-generated machine-readable docs for AI coding tools

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| UI | shadcn/ui, Tailwind CSS |
| Editor | Tiptap |
| Database | Supabase (PostgreSQL + RLS) |
| AI | Google Gemini |

### Setup

```bash
git clone https://github.com/respeak-io/reeldocs.git
cd reeldocs
pnpm install
cp .env.example .env.local
# Fill in your Supabase + Gemini keys
supabase db push
pnpm dev
```

See the full setup guide in the repo.

</details>

## License

AGPL-3.0
