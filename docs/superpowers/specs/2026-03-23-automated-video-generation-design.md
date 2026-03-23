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

Three stages connected by a **plan file** — a YAML artifact (Phase 1) that describes what to record, how to narrate it, and how to output it. Each stage is independently runnable. The plan file is human-reviewable, editable, and version-controllable.

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
    setup_script: "./scripts/seed-demo-data.ts"  # optional, runs once before entire session
  viewport: { width: 1280, height: 720 }

recording:
  max_concurrent: 3                  # configurable parallelism (default: 3)

features:
  - id: "create-project"
    title: "Creating a New Project"
    category: "Getting Started"
    steps:
      - action: "navigate to /dashboard"
        narration: "From your dashboard, you can see all your documentation projects."
        pause: 2000                  # post-action delay for pacing (ms)
        timeout: 10000               # max wait for action to succeed (ms, default: 10000)
      - action: "click button 'New Project'"
        narration: "To create a new project, click the New Project button in the top right."
        pause: 1500
      - action: "fill input[name='name'] with 'My First Project'"
        narration: "Give your project a name that describes what you're documenting."
      - action: "click button 'Create'"
        narration: "Click Create, and your project is ready to go."
        pause: 2000

  - id: "upload-video"
    title: "Uploading a Video"
    category: "Getting Started"
    steps: [...]

output:
  video_dir: "./generated/videos"
  docs_dir: "./generated/docs"
  languages: ["en", "de"]            # multi-language from the start
  tts:
    provider: "google"               # "google" | "openai" | "elevenlabs"
    voice: "en-US-Studio-O"
    speed: 1.0
  screenshots: true                  # capture per-step screenshots for text docs
```

### Design decisions

- **Actions are human-readable** — `"click button 'New Project'"` not `page.getByRole(...)`. An action translator layer maps these to Playwright calls.
- **Co-generated steps** — each step is an `{action, narration, pause, timeout}` tuple. Action and narration are designed together by the AI so they're coherent.
- **`pause` vs `timeout`** — Two separate concerns: `pause` is a post-action delay for video pacing (how long to linger). `timeout` is how long to wait for the action to succeed before it's considered failed (default: 10s).
- **Categories** map to chapters in the existing Reeldocs article model.
- **Plan file lives in the repo** (CLI use) or as a JSON column on the project (web platform use).
- **`recording.max_concurrent`** is defined in the plan file (also overridable via CLI flag `--concurrency`).
- **YAML for Phase 1** — human-readable, good for CLI editing. The web platform (Phase 2) stores as JSON column but uses the same zod schema. A simple YAML↔JSON converter bridges the formats.
- **TTS provider is an enum** — Phase 1 ships with `"google"`, `"openai"`, and `"elevenlabs"` as known providers. Custom/external provider plugins are deferred to Phase 2+.

### Schema

The plan file schema is defined as a TypeScript type and validated with zod. Shared between CLI and web app via the `packages/cli` exports.

## Recording Manifest

The record stage produces a **recording manifest** alongside the video files. This is the contract between the record and produce stages.

Written to `{output.video_dir}/manifest.json`:

```json
{
  "version": 1,
  "recorded_at": "2026-03-23T14:30:00Z",
  "features": {
    "create-project": {
      "video_path": "./generated/videos/create-project.webm",
      "status": "success",
      "steps": [
        { "stepIndex": 0, "startedAt": 0, "completedAt": 1200, "screenshot": "create-project/step-0.png" },
        { "stepIndex": 1, "startedAt": 3200, "completedAt": 4100, "screenshot": "create-project/step-1.png" },
        { "stepIndex": 2, "startedAt": 5600, "completedAt": 6800, "screenshot": "create-project/step-2.png" },
        { "stepIndex": 3, "startedAt": 6800, "completedAt": 7500, "screenshot": "create-project/step-3.png" }
      ],
      "duration_ms": 9500
    },
    "upload-video": {
      "video_path": "./generated/videos/upload-video.webm",
      "status": "failed",
      "error": "Action failed at step 2: element not found — 'click button Upload'",
      "error_screenshot": "upload-video/error-step-2.png",
      "steps": [...]
    }
  }
}
```

The produce stage reads this manifest to:
- Know which features recorded successfully (skip failed ones)
- Align TTS audio clips to the correct timestamps in the video
- Reference screenshots for embedding in text docs

The manifest schema is also defined in zod and exported from the CLI package.

## Stage 1: Analyze

**CLI:** `reeldocs analyze --codebase ./src --app http://localhost:3000`

### Inputs

- Path to the codebase (reads route files, page components, navigation structure)
- Optional: running app URL (for Playwright to crawl and discover interactive elements)
- Optional: user hints (focus areas, pages to skip, free-text feature requests)

### Process

1. Scan the codebase for route definitions, page components, and navigation structures
2. Build a summary of the app's feature surface
3. Send to Gemini with a prompt: "Here are the routes and components of this web app. Identify user-facing features and for each, generate a walkthrough script as action/narration pairs."
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

For each feature in the plan (concurrently, up to `recording.max_concurrent`):

1. Launch a Playwright browser context with `video: { mode: 'on', dir: tempDir }`
2. Run the auth setup (login with provided credentials, execute setup script if configured)
3. For each step:
   a. Translate the human-readable action to a Playwright call (see Action Translation below)
   b. Execute the action (with `timeout` from step config, default 10s)
   c. Log the timestamp: `{ stepIndex, startedAt, completedAt }`
   d. Take a screenshot (if `output.screenshots` is enabled)
   e. Wait for the configured `pause` duration
4. Close the browser context (Playwright saves the WebM automatically)
5. Move the video file to `output.video_dir/{feature.id}.webm`
6. Write the recording manifest to `output.video_dir/manifest.json`

### Action Translation

Two-layer system:

1. **Deterministic mapping** (fast, no API call) for common patterns:
   - `"navigate to /path"` → `page.goto(baseUrl + '/path')`
   - `"click button 'X'"` → `page.getByRole('button', { name: 'X' }).click()`
   - `"fill input[name='x'] with 'y'"` → `page.locator('input[name=x]').fill('y')`
   - `"wait N"` → `page.waitForTimeout(N)`

2. **AI-driven fallback** for complex or ambiguous actions:
   - Capture Playwright ARIA snapshot (`locator.ariaSnapshot()`)
   - Send to Gemini: "Given this page structure, translate this action to a Playwright call: {action}"
   - Execute the returned Playwright call

This is resilient to UI changes — if button text shifts, the AI can still find the right element from context.

### Error handling

- If an action fails (element not found, timeout): take a screenshot, log the failure, skip to the next feature
- Do not abort the entire run for a single feature failure
- Output a report at the end listing which features succeeded and which need attention
- Failed features are marked in the recording manifest so the produce stage can skip them

### Concurrency

- Configurable via `recording.max_concurrent` in plan file or `--concurrency` CLI flag
- Each feature runs in its own browser context (isolated state)
- The `setup_script` runs once globally before the recording session, not per-context. It must be idempotent (safe to re-run). For features that need isolated state, use separate setup scripts per feature (future enhancement) or design the demo data to be shared safely.
- Admin-adjustable for resource management during hosted/web platform use

## Stage 3: Produce

**CLI:** `reeldocs produce --plan ./plan.yaml`

Reads the recording manifest from `output.video_dir/manifest.json` to find video files and timestamps.

### Process

For each successfully recorded feature (concurrently):

1. **Generate TTS audio:**
   - For each target language in `output.languages`:
     - If non-English: translate narration text via Gemini
     - Call TTS provider with the narration text for each step
     - Output: one audio clip per step per language

2. **Merge audio + video:**
   - Using ffmpeg (required runtime dependency)
   - Place each audio clip at the corresponding step's `startedAt` timestamp (from recording manifest)
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
     - Tiptap JSON for web platform import

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

Default implementation: Google Cloud TTS. Phase 1 ships with three built-in providers: `"google"`, `"openai"`, `"elevenlabs"`. Custom/external provider plugins deferred to Phase 2+.

### ffmpeg dependency

Required at runtime. The CLI checks for it on startup and provides a clear install instruction if missing. Same pattern as the existing yt-dlp dependency.

## Convenience Wrapper

**CLI:** `reeldocs generate --codebase ./src --app http://localhost:3000`

Runs all three stages in sequence: analyze → record → produce. By default, prints the generated plan and prompts for confirmation before recording. Use `--yes` to skip confirmation for CI/automation use cases. The plan file is always generated and saved so users can re-run individual stages later.

## Shared Utilities: Cross-Package Strategy

The existing web app has translation (`lib/ai/translate.ts`) and Markdown-to-Tiptap conversion (`lib/ai/markdown-to-tiptap.ts`) utilities that the produce stage needs. These currently live in the web app root and import from the web app's Gemini module.

**Phase 1 approach:** Rewrite translation and doc polish logic directly in the CLI package's produce module (`packages/cli/src/produce/`). This duplicates some prompt logic but avoids premature refactoring and keeps the CLI fully self-contained — important since it's also published to npm as a standalone tool.

**Phase 2 approach (web integration):** When the web app needs to call these same functions, extract shared prompts into a `packages/shared` package or have the web app import from the CLI package's exports. This refactoring is natural at that point since web integration requires tighter coupling anyway.

The CLI package already has its own `getAI()` singleton and Gemini integration — all new AI calls go through that.

### Model configuration

All Gemini calls (codebase analysis, action translation, narration generation, translation, doc polish) use the model configured via the existing `--model` CLI flag. Default: `gemini-2.5-flash` (upgrade to Gemini 3 Flash when available and stable). A single model flag controls all AI calls — no per-stage model config in Phase 1.

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
│   └── plan-schema.ts          # Zod schema + TypeScript types for Plan + RecordingManifest
├── record/
│   ├── index.ts                # recordFeatures(plan): Promise<RecordingManifest>
│   ├── action-translator.ts    # Human-readable → Playwright calls (deterministic + AI fallback)
│   └── browser-session.ts      # Playwright context management, auth, recording
├── produce/
│   ├── index.ts                # produceOutput(plan, manifest): Promise<void>
│   ├── tts/
│   │   ├── interface.ts        # TTSProvider interface
│   │   ├── google.ts           # Google Cloud TTS implementation
│   │   ├── openai.ts           # OpenAI TTS implementation
│   │   ├── elevenlabs.ts       # ElevenLabs TTS implementation
│   │   └── registry.ts         # Provider lookup by name
│   ├── translate.ts            # Narration translation (self-contained, CLI's own Gemini client)
│   ├── merge.ts                # ffmpeg audio/video merge
│   └── docs-generator.ts       # Text documentation generation + polish
├── ai/
│   ├── gemini.ts               # (existing) — add codebase analysis + action translation calls
│   ├── pipeline.ts             # (existing)
│   └── prompts.ts              # (existing) — add prompts for feature discovery, narration, action translation
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
- `reeldocs record` — plan file → raw videos + recording manifest + screenshots
- `reeldocs produce` — recording manifest + narration → final .mp4 + text docs
- `reeldocs generate` — convenience wrapper with confirmation prompt
- Google Cloud TTS default, three built-in providers
- Configurable auth, viewport, setup scripts
- Multi-language TTS + docs from the start
- Concurrent recording with configurable parallelism

### Phase 2 — Web Platform Integration
- Plan editor UI in dashboard (visual editor for plan file)
- Free-text feature requests → LLM → plan entries
- Background recording jobs via existing `processing_jobs` infrastructure
  - Note: the existing `processing_jobs` table has a non-null `video_id` FK. Recording jobs produce videos as output, not input. Phase 2 needs either a new `recording_jobs` table or a nullable `video_id` column. Decision deferred to Phase 2 design.
- Results flow into existing articles/videos pipeline
- Storage management view with usage visibility and cleanup
- Auto-offer to delete old version when a feature is re-recorded
- Plan stored as JSON column on the project table
- Extract shared utilities to `packages/shared` if duplication becomes painful

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
| Gemini (2.5 Flash, upgrading to 3 Flash when stable) | Codebase analysis, narration generation, action translation, doc polish, translation | 1 |
| zod | Plan file + recording manifest schema validation | 1 |
| js-yaml | YAML parsing/serialization for plan files | 1 |

## Open Questions (to resolve during implementation)

1. **Screenshot format/quality** — PNG (lossless, larger) vs WebP (smaller, good enough for docs)?
2. **Video resolution defaults** — 1280x720 as default viewport. Should we also support 1920x1080 for higher quality?
3. **TTS voice selection UX** — How do users preview/choose voices? List available voices in the CLI? Audio samples in the web UI?
4. **Rate limiting** — Gemini + TTS API rate limits during large batch runs. Retry/backoff strategy needed.
5. **Action translation DSL strictness** — The deterministic layer handles a small set of known patterns; everything else falls through to AI. If AI-generated plans consistently use patterns outside the deterministic set, we may want to expand it or standardize the action format more strictly. Monitor during dogfooding.
