# vidtodoc Design Document

Record product videos, generate documentation for multiple audiences instantly.

## Problem

Developers, startups, and product people spend hours writing documentation for features they've already demonstrated in videos. Different audiences (developers vs end-users) need different versions of the same content. This is slow, repetitive, and often means docs lag behind the product.

## Solution

Upload a product video, select target audiences, and get polished documentation drafts in minutes. Edit in a web-based editor, publish to a Mintlify-style docs site. Optionally generate LLM-optimized output (llms.txt) and push to Context7 so AI coding tools can immediately understand your product.

**Core value prop:** One recording session, multiple audience-tailored docs — for humans and AI agents alike.

## Workflow

1. Record a product video in any tool (Screen Studio, Loom, etc.)
2. Upload the video to vidtodoc, give it a title, select target audiences (e.g. "Developers", "End Users", "AI Agents")
3. Video uploads to Supabase Storage via presigned URL
4. Gemini API processes the video multimodally (audio transcription + visual context extraction)
5. For each audience, an LLM generates a structured doc draft with chapters, sections, and timestamp references
6. Open each draft in the Tiptap editor, polish, and publish
7. Published docs appear on a Mintlify-style docs site with video player integration

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| UI | shadcn/ui, Tailwind CSS |
| Editor | Tiptap (JSON storage, markdown export) |
| Database | Supabase Postgres |
| File Storage | Supabase Storage |
| Auth | Supabase Auth (email/password, GitHub OAuth) |
| Video Processing | Google Gemini API (multimodal) |
| Doc Generation | Claude or Gemini (per-audience prompts) |
| Search | Postgres full-text search + LLM answer synthesis |
| Deployment | Vercel (app) + Supabase (hosted) |

## Project Structure

```
vidtodoc/
├── src/
│   ├── app/              # Next.js pages & API routes
│   ├── components/       # shadcn + custom components
│   ├── lib/              # utilities, AI pipeline, DB queries
│   └── editor/           # Tiptap setup & extensions
├── supabase/             # migrations, seed data
└── docs/plans/           # design docs
```

## Data Model

### Multi-tenancy (org-scoped, team UI deferred)

All data is scoped to an `organization`, not a `user`. At launch, each user gets an auto-created personal org. Team management UI is deferred, but the data model supports it from day one.

### Tables

**organizations**
- `id`, `name`, `slug`, `created_at`

**organization_members**
- `id`, `org_id`, `user_id`, `role` (owner | editor | viewer), `created_at`

**projects** (a docs site)
- `id`, `org_id`, `name`, `slug`, `is_public`, `password_hash` (nullable, for protected projects), `created_at`

**videos**
- `id`, `project_id`, `title`, `storage_path`, `vtt_path`, `duration_seconds`, `status` (uploading | processing | ready | failed), `created_at`

**video_segments** (intermediate extraction)
- `id`, `video_id`, `start_time`, `end_time`, `spoken_content`, `visual_context`, `order`

**articles**
- `id`, `project_id`, `video_id`, `title`, `slug`, `audience` (e.g. "developers", "end-users"), `content_json` (Tiptap JSON), `content_text` (plain text for search indexing), `status` (draft | published), `chapter_id`, `order`, `created_at`, `updated_at`

**chapters** (sidebar grouping)
- `id`, `project_id`, `title`, `slug`, `order`

### RLS

All tables use row-level security scoped through `org_id` via `organization_members`. Users can only access data belonging to orgs they're members of. Role-based permissions (owner/editor can write, viewer can read) enforced at the RLS level.

## Video Processing Pipeline

### Upload

1. Client requests a presigned upload URL from the API
2. Video uploads directly to Supabase Storage (keeps large files off API routes)
3. API route creates a `video` record with status `uploading`, then triggers the pipeline

### Processing

1. **Transcription & visual analysis** — Send video to Gemini API. Returns VTT transcript with timestamps and structured description of visual content (UI interactions, code shown, diagrams)
2. **Segment extraction** — Parse Gemini output into `video_segments`: timestamp ranges with spoken content and visual context
3. **Doc generation** — For each selected audience, send segments to an LLM with an audience-tailored prompt. Returns markdown with chapters, sections, and `[video:MM:SS]` timestamp references
4. **Storage** — Save VTT, segments, and generated article drafts. Update video status to `ready`

### Job Processing

- MVP: Process synchronously in API route with SSE status updates to client
- Later: Move to a job queue (Inngest or Trigger.dev) for reliability and retries

### Estimated Time

~1-3 minutes for a 10-minute video. UI shows progress steps: "Transcribing...", "Analyzing visuals...", "Generating developer docs...", "Generating user guide..."

## Doc Site Layout

### Three-column Mintlify-style layout

- **Left sidebar** — Project logo, chapter groups expanding to show articles. Active article highlighted. Collapsible on mobile.
- **Center content** — Article with clean typography. Collapsible video player at top, synced with timestamp references in the text.
- **Right sidebar** — Table of contents generated from article headings. Highlights active section on scroll.

### Video Player Behavior

- Sticky/collapsible at the top of each article
- Timestamp references in text rendered as subtle linked badges: `▶ 2:34`
- Clicking a badge plays the video from that point
- Optional future enhancement: highlight corresponding doc section during video playback

### Audience Switcher

- Toggle or dropdown at project level to switch between audience views (e.g. "Developer Docs" / "User Guide" / "AI Agents")
- Each audience has its own set of articles, not filtered views of the same content
- AI Agents audience is not displayed in the reader UI — it's consumed via `/llms.txt` and `/llms-full.txt` endpoints

## Editor

### Layout

- Full-width editor-focused UI (replaces three-column docs view)
- Left panel: document outline (drag to reorder sections)
- Center: Tiptap editor with clean toolbar
- Right panel: video player with VTT transcript for reference while editing

### Launch Extensions

- Headings (H1-H4)
- Paragraphs, bold, italic, inline code
- Bullet and numbered lists
- Code blocks with syntax highlighting
- Images (drag-and-drop upload to Supabase Storage)
- Video timestamp links (custom Tiptap node — renders as `▶ 2:34` badges)
- Callout blocks (info, warning, tip)

### Editor Actions

- Save draft
- Publish / unpublish
- Regenerate section (select section, regenerate for this audience using source video segments)
- Preview (switch to reader-facing three-column layout)

### Content Format

- Tiptap JSON stored in database (easy to extend with new block types)
- Exported to markdown for rendering on public docs site
- Plain text extracted for search indexing

## Search

### Layer 1: Full-Text Search

- Postgres full-text search via Supabase
- Indexes article titles, section headings, body text, and VTT transcripts
- Instant results as you type
- Each result shows: article title, matched section, snippet with highlighted terms, audience tag

### Layer 2: LLM Answer Synthesis

- After full-text results load, top 5-10 matched sections sent to LLM
- LLM synthesizes a direct answer citing specific articles and timestamps
- Displayed as a "Summary answer" card above search results
- Example: "SSO is configured in Admin Dashboard > Settings > Authentication. See the video walkthrough at 3:42."

### Search UI

- Cmd+K modal (shadcn command palette pattern)
- Instant results as you type (Layer 1)
- AI answer card appears after ~1-2 seconds (Layer 2)
- Scoped to current project with optional audience filter

## AI Agents Audience & llms.txt

### "AI Agents" as a Built-In Target Audience

When "AI Agents" is selected as a target audience during video upload, the LLM generates a doc variant optimized for machine consumption:

- **Token-efficient prose** — no filler, just facts, parameters, behaviors, and relationships
- **Structured for LLM context windows** — clear hierarchy, self-contained sections, explicit cross-references
- **API-focused extraction** — if the video shows API usage, extracts endpoints, HTTP methods, request/response schemas, authentication, error codes into structured format
- **Code-first** — prioritizes code snippets, configuration examples, and CLI commands over narrative

### llms.txt Generation

Following the [llms.txt specification](https://llmstxt.org/), each project auto-generates two files:

**`/llms.txt`** — Lightweight navigation file:
```markdown
# Project Name

> Brief description of the project

## Documentation
- [Getting Started](/docs/getting-started): Setup and installation guide
- [API Reference](/docs/api): Complete API endpoint documentation
- [Configuration](/docs/config): Configuration options and defaults

## Optional
- [Changelog](/docs/changelog): Version history
```

**`/llms-full.txt`** — Complete documentation in one file, all AI Agents articles concatenated in order, optimized for dropping into an LLM context window.

Both files auto-regenerate whenever an AI Agents article is published or updated.

### Serving llms.txt

- `GET /<projectSlug>/llms.txt` — returns the navigation file
- `GET /<projectSlug>/llms-full.txt` — returns the full content file
- Plain text responses with `text/markdown` content type
- Publicly accessible (no auth), same as the docs site

### Context7 Integration

One-click push to [Context7](https://context7.com) so AI coding tools (Cursor, Claude Code, Copilot) can immediately discover and use the documentation:

- Project settings page has a "Publish to Context7" toggle
- When enabled, publishes/refreshes on Context7 whenever AI Agents articles are updated
- Uses the [upsert-context7 GitHub Action](https://github.com/rennf93/upsert-context7) pattern — can also be triggered via a GitHub Action in the user's repo
- Dashboard shows Context7 sync status (last synced, library ID)

### AI Agents Doc Generation Prompt

The prompt for the AI Agents audience emphasizes:
- Precise technical facts over explanatory prose
- Structured data (tables, typed parameters, enums) over narrative
- Code examples with complete, copy-pasteable snippets
- Explicit error handling and edge cases
- Version/compatibility information where visible in the video

## Authentication & Access Control

### Auth

- Supabase Auth with email/password and GitHub OAuth
- On signup, auto-create a personal organization for the user

### Published Docs Access

- Public by default (no auth required to read)
- Optional password protection per project

### Data Isolation

- All RLS policies scoped through `org_id` via membership
- Projects, videos, articles, and search indexes fully isolated per org

## Deferred Features

- Team management UI (invite members, manage roles) — data model ready
- Real-time collaborative editing
- Custom domain per project
- Additional Tiptap block types (tabs, cards, accordion, API reference)
- Job queue for video processing (Inngest/Trigger.dev)
- Vector search / RAG upgrade (pgvector)
- Video player highlighting synced doc sections during playback
