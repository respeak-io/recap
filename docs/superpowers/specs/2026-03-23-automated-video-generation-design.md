# Automated Video Generation — Design Spec

**Date:** 2026-03-23
**Status:** Draft
**Author:** Tim + Claude

## Problem

Reeldocs currently requires users to manually record product videos, then processes them into documentation. This works well but creates a bottleneck: someone has to make the video. For teams that need to document an entire platform (like Respeak), this is a significant time investment — especially for routine feature documentation that doesn't need a human presenter.

## Solution

Extend Reeldocs with automated video generation: AI analyzes a codebase to discover features, generates Playwright walkthrough scripts with narration, records browser interactions as video, dubs with TTS, and produces both video and text documentation. The system is generic (works for any web app) but dogfooded on Respeak first.

## Architecture Overview

```
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│   ANALYZE   │ ──→  │   RECORD    │ ──→  │   PRODUCE    │
│             │      │             │      │              │
│ Read code   │      │ Run steps   │      │ Generate TTS │
│ Discover    │      │ Playwright  │      │ Merge audio  │
│ features    │      │ records     │      │ + video      │
│ Generate    │      │ WebM per    │      │ Generate     │
│ plan file   │      │ feature     │      │ text docs    │
└─────────────┘      └─────────────┘      └──────────────┘
```

Three stages connected by a **plan file** — a structured YAML/JSON artifact that describes what to record, how to narrate it, and how to output it. Each stage is independently runnable. The plan file is human-reviewable, editable, and version-controllable.

## The Plan File

The plan file is the central contract between all stages.

```yaml
version: 1
app:
  url: "http://localhost:3000"
  auth:
    strategy: "credentials"          # "credentials" | "cookie" | "script"
    credentials:
      email: "demo@respeak.io"
      password: "demo-password"
    setup_script: "./scripts/seed-demo-data.ts"  # optional, runs before recording
  viewport: { width: 1280, height: 720 }

features:
  - id: "create-project"
    title: "Creating a New Project"
    category: "Getting Started"
    steps:
      - action: "navigate to /dashboard"
        narration: "From your dashboard, you can see all your documentation projects."
        wait: 2000
      - action: "click button 'New Project'"
        narration: "To create a new project, click the New Project button in the top right."
        wait: 1500
      - action: "fill input[name='name'] with 'My First Project'"
        narration: "Give your project a name that describes what you're documenting."
      - action: "click button 'Create'"
        narration: "Click Create, and your project is ready to go."
        wait: 2000

  - id: "upload-video"
    title: "Uploading a Video"
    category: "Getting Started"
    steps: [...]

output:
  video_dir: "./generated/videos"
  docs_dir: "./generated/docs"
  languages: ["en", "de"]            # multi-language from the start
  tts:
    provider: "google"               # default: Google Cloud TTS
    voice: "en-US-Studio-O"
    speed: 1.0
  screenshots: true                  # capture per-step screenshots for text docs
```

### Design decisions

- **Actions are human-readable** — `"click button 'New Project'"` not `page.getByRole(...)`. An action translator layer maps these to Playwright calls.
- **Co-generated steps** — each step is an `{action, narration, wait}` tuple. Action and narration are designed together by the AI so they're coherent.
- **Categories** map to chapters in the existing Reeldocs article model.
- **Wait times** control video pacing and give narration room to breathe.
- **Plan file lives in the repo** (CLI use) or as a JSON column on the project (web platform use).

### Schema

The plan file schema is defined as a TypeScript type and validated with zod. Shared between CLI and web app via the `packages/cli` exports.

## Stage 1: Analyze

**CLI:** `reeldocs analyze --codebase ./src --app http://localhost:3000`

### Inputs

- Path to the codebase (reads route files, page components, navigation structure)
- Optional: running app URL (for Playwright to crawl and discover interactive elements)
- Optional: user hints (focus areas, pages to skip, free-text feature requests)

### Process

1. Scan the codebase for route definitions, page components, and navigation structures
2. Build a summary of the app's feature surface
3. Send to Gemini 3 Flash with a prompt: "Here are the routes and components of this web app. Identify user-facing features and for each, generate a walkthrough script as action/narration pairs."
4. If user provided free-text requests (e.g., "Show how to invite a team member"), include these as additional features to script
5. Parse and validate the AI response against the plan file schema

### Output

- `plan.yaml` written to the project directory
- Summary printed to terminal: "Found N features across M categories. Review the plan file and run `reeldocs record` when ready."

### Codebase analysis strategy

For the initial generic version, focus on:
- **Next.js / React Router** route file conventions (`app/`, `pages/`, route configs)
- **Navigation components** (sidebars, nav bars) to understand feature hierarchy
- **Page-level components** to understand what each route does

This covers the most common case. Additional framework support (Vue, Svelte, etc.) can be added incrementally.

## Stage 2: Record

**CLI:** `reeldocs record --plan ./plan.yaml`

### Process

For each feature in the plan (concurrently, up to `max_concurrent_recordings`):

1. Launch a Playwright browser context with `video: { mode: 'on', dir: tempDir }`
2. Run the auth setup (login with provided credentials, execute setup script if configured)
3. For each step:
   a. Translate the human-readable action to a Playwright call (see Action Translation below)
   b. Execute the action
   c. Log the timestamp: `{ stepIndex, startedAt, completedAt }`
   d. Take a screenshot (if `output.screenshots` is enabled)
   e. Wait for the configured `wait` duration
4. Close the browser context (Playwright saves the WebM automatically)
5. Move the video file to `output.video_dir/{feature.id}.webm`

### Action Translation

Two-layer system:

1. **Deterministic mapping** (fast, no API call) for common patterns:
   - `"navigate to /path"` → `page.goto(baseUrl + '/path')`
   - `"click button 'X'"` → `page.getByRole('button', { name: 'X' }).click()`
   - `"fill input[name='x'] with 'y'"` → `page.locator('input[name=x]').fill('y')`
   - `"wait N"` → `page.waitForTimeout(N)`

2. **AI-driven fallback** for complex or ambiguous actions:
   - Capture Playwright accessibility snapshot (`page.accessibility.snapshot()`)
   - Send to Gemini: "Given this page structure, translate this action to a Playwright call: {action}"
   - Execute the returned Playwright call

This is resilient to UI changes — if button text shifts, the AI can still find the right element from context.

### Error handling

- If an action fails (element not found, timeout): take a screenshot, log the failure, skip to the next feature
- Do not abort the entire run for a single feature failure
- Output a report at the end listing which features succeeded and which need attention

### Concurrency

- Configurable via `max_concurrent_recordings` setting (default: 3)
- Each feature runs in its own browser context (isolated state)
- Admin-adjustable for resource management during hosted/web platform use

## Stage 3: Produce

**CLI:** `reeldocs produce --plan ./plan.yaml`

### Process

For each feature (concurrently):

1. **Generate TTS audio:**
   - For each target language in `output.languages`:
     - If non-English: translate narration text via Gemini (reuse existing `lib/ai/translate.ts` approach)
     - Call TTS provider with the narration text for each step
     - Output: one audio clip per step per language

2. **Merge audio + video:**
   - Using ffmpeg (required runtime dependency)
   - Place each audio clip at the corresponding step's `startedAt` timestamp (from recording phase)
   - If narration is longer than step duration: pad with a still frame
   - If shorter: fill gap with silence
   - Output: `{feature.id}.{lang}.mp4` per language

3. **Generate text documentation:**
   - Assemble content from narration text + step descriptions
   - Embed per-step screenshots (if captured during recording)
   - Send through Gemini for a polish pass: turn narration-style text into written documentation prose
   - For non-English languages: translate the polished text via Gemini
   - Output formats:
     - Markdown/MDX for standalone CLI use
     - Tiptap JSON for web platform import (via existing `markdown-to-tiptap.ts`)

### TTS Provider Interface

```typescript
interface TTSProvider {
  synthesize(text: string, options: TTSOptions): Promise<Buffer>
}

interface TTSOptions {
  voice: string
  speed: number
  language: string         // BCP-47 language tag
  format: 'mp3' | 'wav'
}
```

Default implementation: Google Cloud TTS. Pluggable — users implement the interface and register via the plan file's `output.tts.provider` field.

### ffmpeg dependency

Required at runtime. The CLI checks for it on startup and provides a clear install instruction if missing. Same pattern as the existing yt-dlp dependency.

## Convenience Wrapper

**CLI:** `reeldocs generate --codebase ./src --app http://localhost:3000`

Runs all three stages in sequence: analyze → (auto-approve plan) → record → produce. For users who want the one-command experience. The plan file is still generated and saved so they can re-run individual stages later.

## Module Structure

All new code lives in `packages/cli/src/` and is exported as both CLI commands and library functions (matching the existing pattern for `processVideo`):

```
packages/cli/src/
├── index.ts                    # CLI entry — add analyze/record/produce/generate commands
├── analyze/
│   ├── index.ts                # analyzeCodebase(options): Promise<Plan>
│   ├── scanners/
│   │   ├── nextjs.ts           # Next.js route scanner
│   │   └── generic.ts          # Generic file-based scanner
│   └── plan-schema.ts          # Zod schema + TypeScript types for plan file
├── record/
│   ├── index.ts                # recordFeatures(plan): Promise<RecordingResult[]>
│   ├── action-translator.ts    # Human-readable → Playwright calls
│   └── browser-session.ts      # Playwright context management, auth, recording
├── produce/
│   ├── index.ts                # produceOutput(plan, recordings): Promise<void>
│   ├── tts/
│   │   ├── interface.ts        # TTSProvider interface
│   │   ├── google.ts           # Google Cloud TTS implementation
│   │   └── registry.ts         # Provider registration/lookup
│   ├── merge.ts                # ffmpeg audio/video merge
│   └── docs-generator.ts       # Text documentation generation
├── ai/
│   ├── gemini.ts               # (existing) — add codebase analysis prompts
│   ├── pipeline.ts             # (existing)
│   └── prompts.ts              # (existing) — add new prompts for feature discovery + narration
├── download.ts                 # (existing)
└── output/
    ├── markdown.ts             # (existing)
    └── mdx.ts                  # (existing)
```

Library exports from `packages/cli/package.json`:

```json
{
  "exports": {
    ".": "./dist/ai/pipeline.js",
    "./analyze": "./dist/analyze/index.js",
    "./record": "./dist/record/index.js",
    "./produce": "./dist/produce/index.js",
    "./plan": "./dist/analyze/plan-schema.js"
  }
}
```

The web app imports these directly via `workspace:*` dependency — same as it currently imports the pipeline.

## Phased Delivery

### Phase 1 — Automated Video Creation (this spec)
- `reeldocs analyze` — codebase → plan file
- `reeldocs record` — plan file → raw videos + timestamps + screenshots
- `reeldocs produce` — raw videos + narration → final .mp4 + text docs
- `reeldocs generate` — convenience wrapper
- Google Cloud TTS default, pluggable interface
- Configurable auth, viewport, setup scripts
- Multi-language TTS + docs from the start
- Concurrent recording with configurable parallelism

### Phase 2 — Web Platform Integration
- Plan editor UI in dashboard (visual editor for plan file)
- Free-text feature requests → LLM → plan entries
- Background recording jobs via existing `processing_jobs` infrastructure
- Results flow into existing articles/videos pipeline
- Storage management view with usage visibility and cleanup
- Auto-offer to delete old version when a feature is re-recorded
- Plan stored as JSON column on the project table

### Phase 3 — Auto-updating Docs on Code Changes
- Git diff analysis to detect which features changed
- Compare against existing plan file entries
- Flag stale docs, suggest re-recordings where frontend changed
- Update text docs directly where only copy/logic changed
- Triggerable manually or via CI (e.g., on PR merge to prod)

### Phase 4 — Changelog / News Section
- "What's new" page in the published docs site
- Auto-generated from plan file diffs + git commit history
- Links to newly generated feature videos
- Supports the existing multi-language + theming system

### Phase 5 — Video Post-processing Polish
- Cursor highlighting and smooth movement
- Step annotations / overlays (e.g., numbered badges, callout boxes)
- Zoom on key UI elements during interactions
- Smooth transitions between steps
- Higher production value output

### Phase 6 — Claude Code Skill Integration
A Claude Code skill (`/reeldocs` or similar) that lets developers generate documentation directly from their terminal during development. The skill integrates with the Reeldocs managed service.

**User experience:**
```
> /reeldocs document "user onboarding flow"
```

Claude analyzes the local codebase, generates a plan, optionally runs Playwright locally for recording, and pushes results to the user's Reeldocs project via API.

**Possible skill modes:**

1. **Analyze only** — `/reeldocs analyze` scans the codebase and suggests a documentation structure. Outputs a plan file or sends it to the managed service.

2. **Full generation** — `/reeldocs generate "invite team members"` runs the full pipeline locally (analyze → record → produce) and uploads results to the Reeldocs project.

3. **Update check** — `/reeldocs check` compares current code against the existing plan file and flags which docs are stale. Natural fit for CI or post-PR workflows.

**Integration with managed service:**
- Authenticate via API key or OAuth to the Reeldocs web platform
- Push generated videos + docs directly to the user's project
- Pull existing plan file from the project to avoid duplicate work
- Trigger recording on the hosted service instead of locally (for teams without local Playwright setup)

**Why this is compelling:**
- Developers already use Claude Code in their terminal. Documentation becomes a natural part of the dev workflow rather than a separate task.
- Claude can reason about the code context (what changed, what's new) and proactively suggest documentation updates.
- Lowers the barrier from "go to the Reeldocs dashboard and set up recording" to "type one command."

This phase depends on Phases 1-2 being stable and the managed service having an API for plan/video/article CRUD.

## Technical Dependencies

| Dependency | Purpose | Phase |
|---|---|---|
| Playwright | Browser automation + video recording | 1 |
| ffmpeg | Audio/video merging | 1 |
| Google Cloud TTS | Text-to-speech (default provider) | 1 |
| Gemini 3 Flash | Codebase analysis, narration generation, action translation, doc polish | 1 |
| zod | Plan file schema validation | 1 |

## Open Questions (to resolve during implementation)

1. **Plan file format preference** — YAML for human editing (CLI) vs JSON for programmatic use (web platform). Could support both with a simple converter.
2. **Screenshot format/quality** — PNG (lossless, larger) vs WebP (smaller, good enough for docs)?
3. **Video resolution defaults** — 1280x720 as default viewport. Should we also support 1920x1080 for higher quality?
4. **TTS voice selection UX** — How do users preview/choose voices? List available voices in the CLI? Audio samples in the web UI?
5. **Rate limiting** — Gemini + TTS API rate limits during large batch runs. Retry/backoff strategy needed.
