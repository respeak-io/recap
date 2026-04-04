# Codebase Refactor Plan

> **Date:** 2026-04-04
> **Status:** Proposed
> **Scope:** Web app (`app/`, `lib/`, `components/`, `editor/`, `hooks/`)

## Executive Summary

After a thorough analysis of the codebase, we identified several areas where refactoring would meaningfully improve maintainability, testability, and expandability. The codebase has strong foundations — clear directory structure, good use of Next.js App Router conventions, and logical separation between dashboard/docs/API layers — but rapid feature additions have introduced duplication, inconsistency, and a few "god functions" that will become pain points as the project grows.

This plan is organized into **6 phases**, ordered by impact and dependency. Each phase is independent and can be shipped as its own PR.

---

## Phase 1: Extract Shared Constants & Types

**Goal:** Centralize scattered magic values and duplicated type definitions.
**Estimated scope:** ~10 files touched, low risk.

### 1.1 — Language Configuration (`lib/languages.ts`)

Language labels, flags, and codes are defined in **4+ separate places**:

| Location | What it defines |
|---|---|
| `components/docs/sidebar.tsx:25` | `LANGUAGE_CONFIG` (label + flag) |
| `components/dashboard/project-details-editor.tsx:17` | `LANGUAGE_LABELS` (label only) |
| `components/video-upload.tsx:15` | `LANGUAGES` (id + label) |
| `app/(dashboard)/project/[slug]/media/video-group-detail-dialog.tsx:52` | `AVAILABLE_LANGUAGES` (code + label) |

**Action:** Create `lib/languages.ts`:

```typescript
export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export function getLanguageLabel(code: string): string { ... }
export function getLanguageFlag(code: string): string { ... }
```

Update all 4 consumers to import from this single source.

### 1.2 — Upload Constants (`lib/constants.ts`)

File size limits and MIME types are scattered across route handlers:

| Constant | Value | Files |
|---|---|---|
| Video max size | `25 * 1024 * 1024` | `api/v1/.../videos/route.ts`, `api/projects/[id]/media/upload-video/route.ts` |
| Image max size | `10 * 1024 * 1024` | `api/v1/.../images/route.ts`, `api/projects/[id]/media/upload/route.ts` |
| Asset max size | `2 * 1024 * 1024` | `api/projects/[id]/assets/route.ts` |
| Video MIME types | `video/mp4, video/webm, ...` | 2 files |
| Image MIME types | `image/png, image/jpeg, ...` | 2 files |

**Action:** Create `lib/constants.ts`:

```typescript
export const MAX_VIDEO_SIZE = 25 * 1024 * 1024;
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_ASSET_SIZE = 2 * 1024 * 1024;

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

export const POLLING_INTERVAL_MS = 2000;
export const SEARCH_DEBOUNCE_MS = 300;
```

### 1.3 — Shared Database Types

Several components use loose `Record<string, unknown>` where proper types would improve safety and IDE experience.

**Action:** Create `lib/types.ts` with shared interfaces:

```typescript
export interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  language: string;
  status: "draft" | "published";
  content_json: TiptapDoc;
  content_text: string;
  chapter_id: string | null;
  video_id: string | null;
  project_id: string;
  order: number;
  created_at: string;
}

export interface TiptapDoc {
  type: "doc";
  content: TiptapNode[];
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

// ... VideoRow, ChapterRow, ProjectRow, etc.
```

This directly benefits unit testing — tests can construct typed fixtures instead of guessing shapes.

---

## Phase 2: API Layer Consolidation

**Goal:** Eliminate duplication between v1 API and internal API routes; standardize error handling.
**Estimated scope:** ~20 files touched, medium risk.

### 2.1 — Shared Upload Service (`lib/services/upload.ts`)

Video and image upload logic is **nearly identical** between v1 and internal routes:

- **Video upload:** `api/v1/.../videos/route.ts` ↔ `api/projects/[id]/media/upload-video/route.ts`
- **Image upload:** `api/v1/.../images/route.ts` ↔ `api/projects/[id]/media/upload/route.ts`

Both validate MIME type, check file size, upload to Supabase Storage, insert a DB row, and return metadata. The only differences are auth mechanism and response shape.

**Action:** Create `lib/services/upload.ts`:

```typescript
interface UploadResult {
  id: string;
  storagePath: string;
  publicUrl?: string;
}

export async function uploadImage(
  db: SupabaseClient,
  projectId: string,
  file: File
): Promise<UploadResult> {
  // Validate type + size (using constants from Phase 1)
  // Upload to storage
  // Insert DB row
  // Return result
}

export async function uploadVideo(
  db: SupabaseClient,
  projectId: string,
  file: File,
  language: string,
  videoGroupId?: string
): Promise<UploadResult> { ... }
```

Both v1 and internal routes call these functions, then format the response per their own conventions. This eliminates ~150 lines of duplication and ensures validation rules stay consistent.

### 2.2 — Shared Batch Delete Service

`api/v1/.../videos/batch-delete/route.ts` and `api/v1/.../images/batch-delete/route.ts` have **identical structure** — loop through IDs, fetch storage path, delete from storage, delete from DB, track successes/errors.

**Action:** Create `lib/services/media.ts`:

```typescript
export async function batchDeleteMedia(
  db: SupabaseClient,
  table: "videos" | "images",
  bucket: string,
  projectId: string,
  ids: string[]
): Promise<{ deleted: string[]; errors: { id: string; error: string }[] }> { ... }
```

### 2.3 — Standardized API Error Handling

Currently two different patterns exist:

```typescript
// v1 API — structured errors via apiError()
return apiError("Not found", "NOT_FOUND", 404);

// Internal API — ad-hoc NextResponse
return NextResponse.json({ error: "Not found" }, { status: 404 });
```

**Action:** Extend `lib/api-key-auth.ts` → rename to `lib/api/errors.ts` and make it the single source for error responses:

```typescript
export type ApiErrorCode =
  | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND"
  | "CONFLICT" | "VALIDATION_ERROR" | "INTERNAL";

export function apiError(message: string, code: ApiErrorCode, status: number): Response {
  return Response.json({ error: message, code }, { status });
}

// Convenience helpers
export const notFound = (msg = "Not found") => apiError(msg, "NOT_FOUND", 404);
export const unauthorized = (msg = "Unauthorized") => apiError(msg, "UNAUTHORIZED", 401);
export const validationError = (msg: string) => apiError(msg, "VALIDATION_ERROR", 422);
export const conflict = (msg: string) => apiError(msg, "CONFLICT", 409);
```

Migrate internal routes to use the same helpers. This also standardizes 400 vs 422 usage (currently inconsistent).

### 2.4 — Response Transformers (`lib/api/transformers.ts`)

Video and image metadata is transformed to API responses in 3+ places each, with slightly different shapes.

**Action:** Create response transformer functions:

```typescript
export function toVideoResponse(video: VideoRow): VideoApiResponse { ... }
export function toImageResponse(image: ImageRow, publicUrl: string): ImageApiResponse { ... }
```

Used by both v1 and internal routes to ensure consistent response shapes.

---

## Phase 3: Break Down the Video Processing Pipeline

**Goal:** Make the 370-line `POST /api/videos/process` testable and maintainable.
**Estimated scope:** ~5 new files, 1 file heavily refactored, medium-high risk.

### Current Problem

`app/api/videos/process/route.ts` is the most complex file in the codebase. It:
1. Validates the request and creates a processing job
2. Uploads video to Gemini and extracts segments
3. Generates VTT subtitles
4. Calls Gemini to generate documentation structure
5. Converts markdown to Tiptap JSON and inserts articles
6. Translates articles into multiple languages
7. Translates VTT subtitles
8. Updates job progress at each step

All of this happens in a single `after()` callback with checkpoint logic. This makes it:
- **Impossible to unit test** — the entire pipeline is one function
- **Hard to modify** — adding a step requires understanding the whole flow
- **Hard to retry partially** — checkpoints help but are interleaved with business logic

### Proposed Architecture: `lib/services/video-pipeline/`

```
lib/services/video-pipeline/
├── index.ts              # Pipeline orchestrator
├── types.ts              # Shared types (PipelineContext, StepResult)
├── steps/
│   ├── extract-segments.ts    # Step 1: Upload to Gemini + extract
│   ├── generate-vtt.ts        # Step 2: Create VTT from segments
│   ├── generate-docs.ts       # Step 3: Gemini doc generation + markdown conversion
│   ├── translate-articles.ts  # Step 4: Multi-language translation
│   └── translate-vtt.ts       # Step 5: VTT translation
└── progress.ts           # Job progress updater
```

**Pipeline context** — each step receives and returns a shared context:

```typescript
interface PipelineContext {
  db: SupabaseClient;
  videoId: string;
  projectId: string;
  languages: string[];
  // Accumulated state
  segments?: Segment[];
  vtt?: string;
  vttLanguages?: Record<string, string>;
  articles?: ArticleData[];
}

type PipelineStep = (
  ctx: PipelineContext,
  progress: ProgressReporter
) => Promise<PipelineContext>;
```

**Orchestrator:**

```typescript
export async function runVideoPipeline(
  ctx: PipelineContext,
  progress: ProgressReporter
): Promise<void> {
  const steps: { name: string; run: PipelineStep; weight: number }[] = [
    { name: "extract-segments", run: extractSegments, weight: 0.2 },
    { name: "generate-vtt",     run: generateVtt,     weight: 0.05 },
    { name: "generate-docs",    run: generateDocs,    weight: 0.25 },
    { name: "translate-articles", run: translateArticles, weight: 0.4 },
    { name: "translate-vtt",    run: translateVtt,     weight: 0.1 },
  ];

  for (const step of steps) {
    ctx = await step.run(ctx, progress);
  }
}
```

**The route handler** becomes thin (~30 lines): validate request, create job, call `runVideoPipeline()` inside `after()`.

**Testability wins:**
- Each step can be tested in isolation with a mocked `PipelineContext`
- The orchestrator can be tested with mock steps
- Progress reporting can be verified independently
- Checkpoint logic moves into each step (check if work already done, skip if so)

---

## Phase 4: Component Decomposition

**Goal:** Break down oversized components, extract reusable patterns.
**Estimated scope:** ~15 files touched, low risk.

### 4.1 — Theme Editor Decomposition

`components/dashboard/theme-editor.tsx` is **605 lines** combining 5 distinct concerns:

**Action:** Split into:

```
components/dashboard/theme-editor/
├── index.tsx              # Shell with tabs (re-exports ThemeEditor)
├── brand-assets.tsx       # Logo + favicon upload
├── color-picker.tsx       # Color fields with presets
├── typography.tsx         # Font selection
├── custom-css.tsx         # CSS override editor
└── theme-presets.ts       # THEME_PRESETS constant
```

Each sub-component receives the theme state and an `onChange` callback. The parent manages save/dirty state.

### 4.2 — Docs Sidebar Decomposition

`components/docs/sidebar.tsx` is **311 lines** with navigation, language switching, and responsive behavior all interleaved.

**Action:** Extract:
- `DocsSidebarNav` — chapter list with collapsibles
- `LanguageSwitcher` — language dropdown (reusable in other places)

### 4.3 — Async Action Hook

Multiple components repeat this pattern:

```typescript
const [loading, setLoading] = useState(false);
async function handleAction() {
  setLoading(true);
  try {
    const res = await fetch(...);
    if (res.ok) { /* update state */ }
  } finally {
    setLoading(false);
  }
}
```

Found in: `api-key-table.tsx`, `article-tree.tsx`, `video-gallery.tsx`, `theme-editor.tsx`, `project-details-editor.tsx`.

**Action:** Create `hooks/use-async-action.ts`:

```typescript
export function useAsyncAction<T>(
  action: () => Promise<T>
): { execute: () => Promise<T | undefined>; loading: boolean } {
  const [loading, setLoading] = useState(false);
  const execute = useCallback(async () => {
    setLoading(true);
    try {
      return await action();
    } finally {
      setLoading(false);
    }
  }, [action]);
  return { execute, loading };
}
```

### 4.4 — Upload Hook Consolidation

`hooks/use-media-upload.ts` and `hooks/use-video-upload.ts` share ~90% identical logic (state management, FormData construction, error handling).

**Action:** Create a generic `hooks/use-upload.ts` and have both media and video hooks delegate to it:

```typescript
export function useUpload(config: {
  projectId: string;
  endpoint: string;
  buildFormData: (file: File, form: FormData) => void;
}) { ... }

// Then:
export function useMediaUpload(projectId: string) {
  return useUpload({
    projectId,
    endpoint: `/api/projects/${projectId}/media/upload`,
    buildFormData: (file, form) => form.append("file", file),
  });
}
```

### 4.5 — Status Badge Component

Badge variant logic is duplicated in 4+ components with slight variations.

**Action:** Create `components/ui/status-badge.tsx`:

```typescript
const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  completed: "default",
  published: "default",
  ready: "default",
  processing: "secondary",
  pending: "secondary",
  draft: "secondary",
  failed: "destructive",
  revoked: "destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANTS[status] ?? "outline"}>{status}</Badge>;
}
```

---

## Phase 5: AI & Translation Layer Cleanup

**Goal:** Reduce duplication in AI calls, improve testability.
**Estimated scope:** ~5 files touched, low risk.

### 5.1 — Gemini Call Wrapper

`lib/ai/translate.ts` has 3 near-identical `getAI().models.generateContent()` calls differing only in prompt and config.

**Action:** Create `lib/ai/generate.ts`:

```typescript
export async function generateText(
  prompt: string,
  opts?: { model?: string; json?: boolean }
): Promise<string> {
  const response = await getAI().models.generateContent({
    model: opts?.model ?? "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: opts?.json ? { responseMimeType: "application/json" } : undefined,
  });
  return response.text!;
}
```

This makes it trivial to mock AI calls in tests — just mock `generateText`.

### 5.2 — llms-txt Deduplication

`lib/llms-txt.ts` has two functions (`generateLlmsTxt` and `generateLlmsFullTxt`) that share ~70% of their code (identical data fetching and filtering).

**Action:** Extract shared data-fetching into a private helper:

```typescript
async function fetchLlmsData(projectSlug: string, lang: string) {
  // Fetch project, chapters, articles (shared by both functions)
  return { project, chapters, articles };
}

export async function generateLlmsTxt(slug: string, lang: string) {
  const data = await fetchLlmsData(slug, lang);
  // Format as summary
}

export async function generateLlmsFullTxt(slug: string, lang: string) {
  const data = await fetchLlmsData(slug, lang);
  // Format as full text
}
```

---

## Phase 6: Prepare for Unit Testing

**Goal:** Structural changes that make the codebase ready for comprehensive test coverage.
**Estimated scope:** Architectural guidance, low direct code changes.

### 6.1 — Dependency Injection Points

The main barrier to unit testing is that most functions create their own Supabase client internally:

```typescript
export async function getProjects() {
  const supabase = await createClient(); // Hard to mock
  ...
}
```

**Action:** Add optional client parameter to all query functions:

```typescript
export async function getProjects(client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  ...
}
```

This is a non-breaking change — existing callers continue to work, but tests can inject a mock client. Apply this pattern to all functions in `lib/queries/` and `lib/services/`.

### 6.2 — Pure Function Extraction

Several files mix pure logic with I/O. Extract pure functions that are easy to test:

| File | Pure logic to extract |
|---|---|
| `lib/ai/markdown-to-tiptap.ts` | Already pure — excellent testability |
| `lib/vtt.ts` | Already pure — `segmentsToVtt()`, `formatTime()` |
| `lib/extract-headings.ts` | Already pure |
| `lib/theme.ts` | `resolveTheme()`, `themeToCssVars()` already pure |
| `app/api/videos/process/route.ts` | JSON sanitization logic (line 200-204) → extract to `lib/utils.ts` |
| `components/docs/article-renderer.tsx` | Tiptap JSON → React tree conversion logic |
| `components/dashboard/article-tree.tsx` | `groupArticles()` helper (already partially extracted) |

### 6.3 — Test File Organization

Recommended structure for the upcoming test suite:

```
__tests__/
├── lib/
│   ├── ai/
│   │   ├── markdown-to-tiptap.test.ts
│   │   ├── translate.test.ts
│   │   └── generate.test.ts
│   ├── services/
│   │   ├── upload.test.ts
│   │   ├── media.test.ts
│   │   └── video-pipeline/
│   │       ├── extract-segments.test.ts
│   │       ├── generate-docs.test.ts
│   │       └── orchestrator.test.ts
│   ├── languages.test.ts
│   ├── vtt.test.ts
│   ├── extract-headings.test.ts
│   └── theme.test.ts
├── components/
│   ├── status-badge.test.tsx
│   └── ...
└── api/
    ├── v1/
    │   └── articles.test.ts
    └── ...
```

### 6.4 — Key Modules to Test First (highest value)

1. **`markdown-to-tiptap.ts`** — Complex parsing with many edge cases, already pure
2. **`vtt.ts`** — Pure function, easy to test, critical for correctness
3. **Video pipeline steps** — After Phase 3 extraction, each step is independently testable
4. **Upload service** — After Phase 2 extraction, validates business rules
5. **`lib/languages.ts`** — After Phase 1, simple but used everywhere

---

## Migration Order & Dependencies

```
Phase 1 (Constants & Types)     ← No dependencies, start here
    ↓
Phase 2 (API Consolidation)     ← Uses constants from Phase 1
    ↓
Phase 3 (Pipeline Refactor)     ← Uses types from Phase 1, services pattern from Phase 2
    ↓
Phase 4 (Components)            ← Uses constants from Phase 1, independent of 2/3
    ↓
Phase 5 (AI Layer)              ← Can run in parallel with Phase 4
    ↓
Phase 6 (Test Prep)             ← Benefits from all prior phases
```

Phases 4 and 5 are independent of each other and can be done in parallel.

---

## What This Plan Does NOT Propose

To keep scope manageable and avoid unnecessary churn:

- **No state management library** — Local state + server components is sufficient for this app's complexity
- **No React Query/SWR** — The current fetch-in-useEffect pattern works; adding a caching layer adds complexity without clear benefit given the app's data patterns
- **No monorepo restructuring** — The current `packages/` setup works well
- **No ORM adoption** — Supabase client is fine; an ORM would add a layer without improving the query patterns
- **No component library migration** — shadcn/ui is the right choice
- **No major routing changes** — The App Router structure is clean

---

## Summary

| Phase | Effort | Risk | Impact | Files |
|---|---|---|---|---|
| 1. Constants & Types | Small | Low | Medium | ~10 |
| 2. API Consolidation | Medium | Medium | High | ~20 |
| 3. Pipeline Refactor | Medium | Medium-High | High | ~6 |
| 4. Components | Medium | Low | Medium | ~15 |
| 5. AI Layer | Small | Low | Medium | ~5 |
| 6. Test Prep | Small | Low | High | ~10 |

The biggest wins for **expandability** come from Phases 2 and 3 (new API endpoints and pipeline steps become trivial to add). The biggest wins for **testability** come from Phases 3 and 6. The biggest wins for **day-to-day developer experience** come from Phases 1 and 4.
