# Recap

Record product videos, generate documentation for multiple audiences instantly.

Recap is an open-source video-to-documentation platform. Upload a product video, select target audiences, and get polished documentation drafts in minutes. Edit in a rich text editor, publish to a Mintlify-style docs site.

**Core value prop:** One recording session, multiple audience-tailored docs — for humans and AI agents alike.

## How It Works

1. **Record** a product video in any tool (Screen Studio, Loom, etc.)
2. **Upload** the video to Recap and select target audiences
3. **AI processes** the video — extracts transcription, visual context, and structures it into segments
4. **Generates docs** for each audience (developers, end-users, AI agents) with timestamp references back to the video
5. **Edit** in a rich text editor, then **publish** to your docs site

## Features

- **Multi-audience generation** — Developer docs, user guides, and AI-optimized output from a single video
- **Multi-language support** — Generate in English, translate to 7+ languages
- **Rich text editor** — Tiptap-based with code blocks, tables, images, callouts, and video timestamp links
- **Mintlify-style docs site** — Clean three-column layout with sidebar navigation, search, and audience/language switching
- **Corporate identity** — Custom logos, brand colors, fonts, and CSS overrides
- **Analytics** — Page views, top articles, audience/language breakdowns, search query tracking
- **Multi-tenant** — Organizations with roles (owner, editor, viewer), multiple projects per org
- **llms.txt** — Auto-generated machine-readable docs for AI coding tools

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| UI | shadcn/ui, Tailwind CSS |
| Editor | Tiptap |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI | Google Gemini (multimodal video processing + doc generation) |
| Charts | Recharts |
| State | Zustand |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- A [Supabase](https://supabase.com) project
- A [Google Gemini API](https://ai.google.dev) key

### Setup

1. Clone the repo:

```bash
git clone https://github.com/respeak-io/recap.git
cd recap
```

2. Install dependencies:

```bash
pnpm install
```

3. Copy the environment template and fill in your keys:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
GEMINI_API_KEY=<your-gemini-api-key>
```

4. Run the Supabase migrations:

```bash
supabase db push
```

Or apply them manually from `supabase/migrations/` in order.

5. Start the dev server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Running Tests

```bash
pnpm test:e2e          # Playwright E2E tests
pnpm test:e2e:ui       # Interactive UI mode
pnpm test:e2e:headed   # Headed browser
```

## Project Structure

```
recap/
├── app/                # Next.js pages & API routes
│   ├── (auth)/         # Login, signup
│   ├── (dashboard)/    # Dashboard, project management, editor
│   ├── (docs)/         # Public documentation site
│   └── api/            # API routes (upload, processing, analytics)
├── components/         # React components (shadcn + custom)
├── editor/             # Tiptap editor setup & extensions
├── lib/                # Utilities, AI pipeline, DB queries
├── supabase/           # Migrations & config
└── docs/plans/         # Design documents
```

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) — see the LICENSE file for details.

If you're interested in managed hosting or a commercial license, reach out at [respeak.io](https://respeak.io).
