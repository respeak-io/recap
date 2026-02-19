# Async Video Processing Implementation Plan

> **Status:** Complete (2026-02-19)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make video processing asynchronous so users can navigate away during processing, with a polling-based progress UI and a dashboard processing monitor.

**Architecture:** Add a `processing_jobs` table to track async job state. Refactor `/api/videos/process` to return immediately and use Next.js `after()` to run processing in the background with a service-role Supabase client. Replace the SSE-based `ProcessingStatus` component with a polling-based `JobProgress` component. Add an `ActiveJobs` section to the project overview dashboard.

**Tech Stack:** Next.js 16 `after()` API, Supabase (PostgreSQL + service role client), shadcn/ui, polling-based progress tracking

---

### Task 1: Database Migration — Processing Jobs Table

**Files:**
- Create: `supabase/migrations/20260218100000_processing_jobs.sql`

**Context:** The codebase uses `uuid_generate_v4()` for PKs, `update_updated_at()` trigger function already exists (defined in `supabase/migrations/20260210130940_init_schema.sql`), and RLS helper functions `is_org_member(org_id)` and `is_org_writer(org_id)` exist (defined in `supabase/migrations/20260210131258_rls_policies.sql`). The `processing_jobs` table references `projects` and `videos` tables.

**Step 1: Write the migration**

```sql
-- supabase/migrations/20260218100000_processing_jobs.sql

-- Processing jobs table: tracks async video processing progress
create table processing_jobs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  step text,
  step_message text,
  progress numeric not null default 0,
  error_message text,
  languages text[] not null default '{en}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger processing_jobs_updated_at
  before update on processing_jobs
  for each row execute function update_updated_at();

-- RLS
alter table processing_jobs enable row level security;

create policy "processing_jobs_select" on processing_jobs for select using (
  exists (select 1 from projects where projects.id = project_id and is_org_member(projects.org_id))
);
create policy "processing_jobs_insert" on processing_jobs for insert with check (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "processing_jobs_update" on processing_jobs for update using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
```

**Step 2: Apply the migration locally**

Run: `supabase db reset`
Expected: All migrations apply cleanly. `processing_jobs` table exists.

**Step 3: Commit**

```bash
git add supabase/migrations/20260218100000_processing_jobs.sql
git commit --no-gpg-sign -m "feat: add processing_jobs table for async video processing"
```

---

### Task 2: Service Role Supabase Client

**Files:**
- Create: `lib/supabase/service.ts`

**Context:** The background processing via `after()` runs after the response is sent. The user's session cookies are not available, and the JWT could expire during long processing. A service role client bypasses RLS and has no expiration. The existing server client is at `lib/supabase/server.ts` and uses `createServerClient` from `@supabase/ssr` with cookies. The service client uses `createClient` from `@supabase/supabase-js` directly (no cookies needed). The env var `SUPABASE_SERVICE_ROLE_KEY` must be set in `.env.local`.

**Step 1: Write the service role client**

```typescript
// lib/supabase/service.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

**Step 2: Verify the env var exists**

Check `.env.local` for `SUPABASE_SERVICE_ROLE_KEY`. If missing, find it in the Supabase dashboard (Settings > API > Service Role Key) and add it:

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

The service role key for local development with `supabase start` is printed in the CLI output. Run `supabase status` to see it.

**Step 3: Commit**

```bash
git add lib/supabase/service.ts
git commit --no-gpg-sign -m "feat: add Supabase service role client for background processing"
```

---

### Task 3: Processing Jobs Query Helpers

**Files:**
- Create: `lib/queries/processing-jobs.ts`

**Context:** Existing query helpers follow the pattern in `lib/queries/videos.ts`: import `createClient` from `@/lib/supabase/server`, create client, query, return `data ?? []`. These are used by server components to fetch data.

**Step 1: Write the query helpers**

```typescript
// lib/queries/processing-jobs.ts
import { createClient } from "@/lib/supabase/server";

export async function getActiveJobs(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("processing_jobs")
    .select("*, videos(title)")
    .eq("project_id", projectId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getRecentJobs(projectId: string, limit = 5) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("processing_jobs")
    .select("*, videos(title)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}
```

**Step 2: Commit**

```bash
git add lib/queries/processing-jobs.ts
git commit --no-gpg-sign -m "feat: add query helpers for processing jobs"
```

---

### Task 4: Refactor Video Processing to Async

This is the core change. The process route creates a job record, returns immediately, and uses `after()` to run processing in the background. Progress is written to the `processing_jobs` table instead of streamed via SSE.

**Files:**
- Modify: `app/api/videos/process/route.ts` (full rewrite — currently 236 lines, SSE-based)

**Context:** The current route at `app/api/videos/process/route.ts` accepts `{ videoId, languages }`, creates a `ReadableStream` with SSE events, and processes the video synchronously inside `start(controller)`. The `languages` array comes from the upload form (per-video selection). The processing steps are: upload to Gemini → extract segments → generate docs (one call, no audience loop) → translate per target language. All DB writes currently use the user's session client. The new version must use the service role client inside `after()`.

Key imports already used:
- `uploadAndProcessVideo`, `extractVideoContent`, `getAI` from `@/lib/ai/gemini`
- `getDocGenerationPrompt` from `@/lib/ai/prompts` — takes only `segments` (no audience param)
- `markdownToTiptap` from `@/lib/ai/markdown-to-tiptap`
- `segmentsToVtt` from `@/lib/vtt`
- `translateTiptapJson`, `translateVtt` from `@/lib/ai/translate`
- `slugify` from `slugify`

**Step 1: Rewrite the process route**

Replace the entire content of `app/api/videos/process/route.ts` with:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadAndProcessVideo, extractVideoContent, getAI } from "@/lib/ai/gemini";
import { getDocGenerationPrompt } from "@/lib/ai/prompts";
import { markdownToTiptap } from "@/lib/ai/markdown-to-tiptap";
import { segmentsToVtt } from "@/lib/vtt";
import { translateTiptapJson, translateVtt } from "@/lib/ai/translate";
import { after } from "next/server";
import slugify from "slugify";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { videoId, languages = ["en"] } = await request.json();

  const { data: video } = await supabase
    .from("videos")
    .select("*, projects(id)")
    .eq("id", videoId)
    .single();

  if (!video) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const projectId = (video.projects as { id: string }).id;

  // Create processing job
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      project_id: projectId,
      video_id: videoId,
      status: "pending",
      languages,
    })
    .select()
    .single();

  if (jobError || !job) {
    return Response.json({ error: "Failed to create job" }, { status: 500 });
  }

  // Mark video as processing
  await supabase.from("videos").update({ status: "processing" }).eq("id", videoId);

  // Run processing in background after response is sent
  after(async () => {
    const db = createServiceClient();

    async function updateJob(updates: Record<string, unknown>) {
      await db.from("processing_jobs").update(updates).eq("id", job.id);
    }

    try {
      await updateJob({
        status: "processing",
        started_at: new Date().toISOString(),
        step: "uploading",
        step_message: "Uploading video to AI...",
        progress: 0.05,
      });

      const { data: urlData } = await db.storage
        .from("videos")
        .createSignedUrl(video.storage_path, 3600);

      const fileInfo = await uploadAndProcessVideo(urlData!.signedUrl);

      await updateJob({
        step: "transcribing",
        step_message: "Extracting content from video...",
        progress: 0.2,
      });

      const segments = await extractVideoContent(fileInfo.uri!, fileInfo.mimeType!);

      const segmentRows = segments.map(
        (seg: Record<string, unknown>, i: number) => ({
          video_id: videoId,
          start_time: seg.start_time,
          end_time: seg.end_time,
          spoken_content: seg.spoken_content,
          visual_context: seg.visual_context,
          order: i,
        })
      );
      await db.from("video_segments").insert(segmentRows);

      // Generate VTT from segments
      const vtt = segmentsToVtt(
        segments.map((s: Record<string, unknown>) => ({
          start_time: s.start_time as number,
          end_time: s.end_time as number,
          spoken_content: s.spoken_content as string,
        }))
      );

      const vttLanguages: Record<string, string> = { en: vtt };

      await db
        .from("videos")
        .update({ vtt_content: vtt, vtt_languages: vttLanguages })
        .eq("id", videoId);

      // Generate docs
      await updateJob({
        step: "generating_docs",
        step_message: "Generating documentation...",
        progress: 0.3,
      });

      const prompt = getDocGenerationPrompt(segments);

      const response = await getAI().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" },
      });

      const doc = JSON.parse(response.text!);

      const createdArticles: {
        chapterId: string | null;
        title: string;
        slug: string;
        contentJson: Record<string, unknown>;
        contentText: string;
      }[] = [];

      for (const chapter of doc.chapters) {
        const chapterSlug = slugify(chapter.title, { lower: true, strict: true });

        const { data: chapterRow } = await db
          .from("chapters")
          .upsert(
            {
              project_id: projectId,
              title: chapter.title,
              slug: chapterSlug,
            },
            { onConflict: "project_id,slug" }
          )
          .select()
          .single();

        const contentText = chapter.sections
          .map(
            (s: { heading: string; content: string }) =>
              `${s.heading}\n${s.content}`
          )
          .join("\n\n");

        const articleSlug = slugify(chapter.title, { lower: true, strict: true });
        const contentJson = markdownToTiptap(chapter.sections);

        await db.from("articles").insert({
          project_id: projectId,
          video_id: videoId,
          chapter_id: chapterRow?.id,
          title: chapter.title,
          slug: articleSlug,
          language: "en",
          content_json: contentJson,
          content_text: contentText,
          status: "draft",
        });

        createdArticles.push({
          chapterId: chapterRow?.id ?? null,
          title: chapter.title,
          slug: articleSlug,
          contentJson,
          contentText,
        });
      }

      // Translate to all non-English target languages
      const targetLanguages = languages.filter((l: string) => l !== "en");
      const progressPerLang = 0.4 / Math.max(targetLanguages.length, 1);
      let currentProgress = 0.55;

      for (const lang of targetLanguages) {
        await updateJob({
          step: "translating",
          step_message: `Translating to ${lang}...`,
          progress: currentProgress,
        });

        try {
          const translatedVtt = await translateVtt(vtt, lang);
          vttLanguages[lang] = translatedVtt;
        } catch (e) {
          console.error(`VTT translation to ${lang} failed:`, e);
        }

        for (const article of createdArticles) {
          try {
            const {
              json: translatedJson,
              text: translatedText,
              title: translatedTitle,
            } = await translateTiptapJson(
              article.contentJson,
              article.contentText,
              lang,
              article.title
            );

            await db.from("articles").insert({
              project_id: projectId,
              video_id: videoId,
              chapter_id: article.chapterId,
              title: translatedTitle ?? article.title,
              slug: article.slug,
              language: lang,
              content_json: translatedJson,
              content_text: translatedText,
              status: "draft",
            });
          } catch (e) {
            console.error(
              `Translation of "${article.title}" to ${lang} failed:`,
              e
            );
          }
        }

        currentProgress += progressPerLang;
      }

      // Save all VTT translations
      await db
        .from("videos")
        .update({ vtt_languages: vttLanguages })
        .eq("id", videoId);

      await db
        .from("videos")
        .update({ status: "ready" })
        .eq("id", videoId);

      await updateJob({
        status: "completed",
        step: "complete",
        step_message: "Processing complete!",
        progress: 1.0,
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Video processing error:", error);
      await db
        .from("videos")
        .update({ status: "failed" })
        .eq("id", videoId);
      await updateJob({
        status: "failed",
        step: "error",
        step_message:
          error instanceof Error ? error.message : "Processing failed",
        error_message:
          error instanceof Error ? error.message : "Processing failed",
        progress: 0,
        completed_at: new Date().toISOString(),
      });
    }
  });

  // Return immediately with job ID
  return Response.json({ jobId: job.id });
}
```

**Step 2: Verify the route compiles**

Run: `pnpm run build 2>&1 | head -40`
Expected: No TypeScript errors in the process route file.

**Step 3: Commit**

```bash
git add app/api/videos/process/route.ts
git commit --no-gpg-sign -m "feat: refactor video processing to async using after() and processing_jobs table"
```

---

### Task 5: Polling-Based Job Progress Component

Replace the SSE-based `ProcessingStatus` with a polling-based component that reads from the `processing_jobs` table.

**Files:**
- Create: `components/job-progress.tsx`

**Context:** The existing `ProcessingStatus` component (at `components/processing-status.tsx`) uses `fetch` with a `ReadableStream` reader to consume SSE events. The new component polls the `processing_jobs` table via the Supabase client every 2 seconds. The Supabase browser client is at `lib/supabase/client.ts` and exports `createClient()`. The component should show the same step-by-step progress UI (uploading → transcribing → generating_docs → translating per language → complete) with check/spinner/empty icons.

**Step 1: Write the polling-based job progress component**

```typescript
// components/job-progress.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface ProcessingJob {
  id: string;
  status: string;
  step: string | null;
  step_message: string | null;
  progress: number;
  error_message: string | null;
  languages: string[];
}

interface JobProgressProps {
  jobId: string;
  onComplete?: () => void;
}

const STEP_ORDER = [
  "uploading",
  "transcribing",
  "generating_docs",
  "translating",
  "complete",
];

export function JobProgress({ jobId, onComplete }: JobProgressProps) {
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let active = true;

    async function poll() {
      const { data } = await supabase
        .from("processing_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (!active || !data) return;

      setJob(data as ProcessingJob);

      if (data.status === "completed") {
        onComplete?.();
        return;
      }

      if (data.status === "failed") return;

      setTimeout(poll, 2000);
    }

    poll();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (!job) return null;

  const targetLanguages = job.languages.filter((l) => l !== "en");

  const steps = [
    { key: "uploading", label: "Uploading video to AI" },
    { key: "transcribing", label: "Extracting content" },
    { key: "generating_docs", label: "Generating documentation" },
    ...targetLanguages.map((l) => ({
      key: `translating_${l}`,
      label: `Translating to ${l}`,
    })),
    { key: "complete", label: "Done" },
  ];

  function isStepCompleted(stepKey: string) {
    if (!job) return false;
    if (job.status === "completed") return true;

    const currentStep = job.step ?? "";

    if (stepKey.startsWith("translating_")) {
      const lang = stepKey.replace("translating_", "");
      const langIdx = targetLanguages.indexOf(lang);
      if (currentStep === "translating") {
        const currentLangIdx = targetLanguages.findIndex((l) =>
          job.step_message?.includes(l)
        );
        return langIdx < currentLangIdx;
      }
      const stepIdx = STEP_ORDER.indexOf("translating");
      const currentIdx = STEP_ORDER.indexOf(currentStep);
      return currentIdx > stepIdx;
    }

    if (stepKey === "complete") return job.status === "completed";

    const stepIdx = STEP_ORDER.indexOf(stepKey);
    const currentIdx = STEP_ORDER.indexOf(currentStep);
    return stepIdx >= 0 && currentIdx > stepIdx;
  }

  function isStepActive(stepKey: string) {
    if (!job || job.status !== "processing") return false;
    const currentStep = job.step ?? "";

    if (stepKey.startsWith("translating_")) {
      const lang = stepKey.replace("translating_", "");
      return (
        currentStep === "translating" &&
        (job.step_message?.includes(lang) ?? false)
      );
    }
    return currentStep === stepKey;
  }

  const progress = job.progress ?? 0;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        <div className="space-y-2">
          {steps.map((step) => {
            const completed = isStepCompleted(step.key);
            const active = isStepActive(step.key);

            return (
              <div key={step.key} className="flex items-center gap-2 text-sm">
                {completed ? (
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                )}
                <span
                  className={
                    completed
                      ? "text-muted-foreground line-through"
                      : active
                        ? "font-medium"
                        : "text-muted-foreground"
                  }
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {job.status === "failed" && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {job.error_message ?? "Processing failed"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add components/job-progress.tsx
git commit --no-gpg-sign -m "feat: add polling-based JobProgress component for async processing"
```

---

### Task 6: Update Upload Page — Wire Up Async Processing

Update the `VideoUpload` component to call the new async process endpoint (which returns `{ jobId }`) and render `JobProgress` instead of `ProcessingStatus`. The upload form itself stays the same (per-video language selection).

**Files:**
- Modify: `components/video-upload.tsx` (currently 204 lines)

**Context:** The current `VideoUpload` component:
- Accepts `{ projectId }` as props
- Has per-video language selection via checkboxes
- After upload, sets `processingVideoId` and renders `<ProcessingStatus videoId={...} languages={...} onComplete={...} />`
- The `ProcessingStatus` component calls `POST /api/videos/process` with `{ videoId, languages }` internally

After this change:
- `VideoUpload` calls `POST /api/videos/process` itself (with `{ videoId, languages }`) right after upload
- Gets back `{ jobId }` from the response
- Renders `<JobProgress jobId={...} onComplete={...} />` instead of `ProcessingStatus`
- Shows a "you can navigate away" message

**Step 1: Update the import and processing state**

In `components/video-upload.tsx`:

Replace the import line:
```typescript
import { ProcessingStatus } from "./processing-status";
```
with:
```typescript
import { JobProgress } from "./job-progress";
```

Replace:
```typescript
const [processingVideoId, setProcessingVideoId] = useState<string | null>(null);
```
with:
```typescript
const [processingJobId, setProcessingJobId] = useState<string | null>(null);
```

**Step 2: Update the handleUpload function**

Replace the end of `handleUpload` (after `setUploadProgress(100);`):

Old code (lines 79-80):
```typescript
      setUploading(false);
      setProcessingVideoId(videoId);
```

New code:
```typescript
      // Start async processing
      const processRes = await fetch("/api/videos/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, languages }),
      });
      const { jobId } = await processRes.json();

      setUploading(false);
      setProcessingJobId(jobId);
```

**Step 3: Update the processing complete handler and render**

Replace:
```typescript
  function handleProcessingComplete() {
    setProcessingVideoId(null);
```
with:
```typescript
  function handleProcessingComplete() {
    setProcessingJobId(null);
```

Replace the processing state render block (lines 95-110):
```typescript
  if (processingVideoId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Processing video</CardTitle>
        </CardHeader>
        <CardContent>
          <ProcessingStatus
            videoId={processingVideoId}
            languages={languages}
            onComplete={handleProcessingComplete}
          />
        </CardContent>
      </Card>
    );
  }
```

with:
```typescript
  if (processingJobId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Processing video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <JobProgress
            jobId={processingJobId}
            onComplete={handleProcessingComplete}
          />
          <p className="text-sm text-muted-foreground">
            You can navigate away — processing continues in the background.
            Check progress on the project overview.
          </p>
        </CardContent>
      </Card>
    );
  }
```

**Step 4: Verify the upload page renders**

Run: `pnpm run dev`
Visit any project's upload page. Expected: Upload form with language checkboxes, file picker, title input. No errors in console.

**Step 5: Commit**

```bash
git add components/video-upload.tsx
git commit --no-gpg-sign -m "feat: wire upload page to async processing with JobProgress component"
```

---

### Task 7: Dashboard Processing Monitor

Add an active/recent processing jobs section to the project overview page.

**Files:**
- Create: `components/dashboard/active-jobs.tsx`
- Modify: `app/(dashboard)/project/[slug]/page.tsx` (currently 197 lines)

**Context:** The project overview page at `app/(dashboard)/project/[slug]/page.tsx` is a server component that fetches project data, videos, and articles. It displays stats cards, recent articles, and quick action links. The new `ActiveJobs` component should appear between the stats cards and the articles/quick-links grid. It's a client component that receives initial job data from the server and polls for updates while any jobs are active.

**Step 1: Write the ActiveJobs client component**

```typescript
// components/dashboard/active-jobs.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, AlertCircle, Video } from "lucide-react";

interface Job {
  id: string;
  status: string;
  step: string | null;
  step_message: string | null;
  progress: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  videos: { title: string } | null;
}

interface ActiveJobsProps {
  projectId: string;
  initialJobs: Job[];
}

export function ActiveJobs({ projectId, initialJobs }: ActiveJobsProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const supabase = createClient();

  const hasActiveJobs = jobs.some(
    (j) => j.status === "pending" || j.status === "processing"
  );

  useEffect(() => {
    if (!hasActiveJobs) return;

    let active = true;

    async function poll() {
      const { data } = await supabase
        .from("processing_jobs")
        .select("*, videos(title)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!active || !data) return;
      setJobs(data as Job[]);

      const stillActive = data.some(
        (j: { status: string }) =>
          j.status === "pending" || j.status === "processing"
      );
      if (stillActive) {
        setTimeout(poll, 2000);
      }
    }

    const timer = setTimeout(poll, 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveJobs, projectId]);

  if (jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Processing Jobs
          {hasActiveJobs && (
            <Loader2 className="size-4 animate-spin text-primary" />
          )}
        </CardTitle>
        <CardDescription>Video processing activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {job.status === "processing" || job.status === "pending" ? (
                  <Loader2 className="size-4 animate-spin text-primary flex-shrink-0" />
                ) : job.status === "completed" ? (
                  <Check className="size-4 text-green-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="size-4 text-destructive flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Video className="size-3 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">
                      {job.videos?.title ?? "Untitled video"}
                    </span>
                  </div>
                  {(job.status === "processing" ||
                    job.status === "pending") && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {job.step_message ?? "Waiting..."}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(job.status === "processing" ||
                  job.status === "pending") && (
                  <div className="w-20 bg-secondary rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(job.progress * 100)}%`,
                      }}
                    />
                  </div>
                )}
                <Badge
                  variant={
                    job.status === "completed"
                      ? "default"
                      : job.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {job.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Update the project overview page**

In `app/(dashboard)/project/[slug]/page.tsx`, add these imports at the top (after existing imports):

```typescript
import { getRecentJobs } from "@/lib/queries/processing-jobs";
import { ActiveJobs } from "@/components/dashboard/active-jobs";
```

After the `recentArticles` line (around line 56), add:

```typescript
  const recentJobs = await getRecentJobs(project.id);
```

In the JSX, add the `ActiveJobs` component between the stats grid closing `</div>` (around line 105) and the articles/quick-links grid opening `<div className="grid gap-6 lg:grid-cols-[1fr_320px]">` (around line 107):

```tsx
        {recentJobs.length > 0 && (
          <ActiveJobs projectId={project.id} initialJobs={recentJobs} />
        )}
```

**Step 3: Verify the overview page renders**

Run: `pnpm run dev`
Visit any project's overview page. Expected: Page renders without errors. The ActiveJobs section is hidden if no processing jobs exist (which is the case until you actually process a video).

**Step 4: Commit**

```bash
git add components/dashboard/active-jobs.tsx app/\(dashboard\)/project/\[slug\]/page.tsx
git commit --no-gpg-sign -m "feat: add processing jobs monitor to project overview dashboard"
```

---

### Task 8: Clean Up Old Processing Status Component

The old SSE-based `ProcessingStatus` component is no longer imported anywhere.

**Files:**
- Delete: `components/processing-status.tsx`

**Step 1: Verify no remaining imports**

Search for any remaining references to `processing-status`:

Run: `grep -r "processing-status" --include="*.tsx" --include="*.ts" .`
Expected: No results. (The import in `video-upload.tsx` was replaced in Task 6.)

**Step 2: Delete the file**

```bash
rm components/processing-status.tsx
```

**Step 3: Verify build passes**

Run: `pnpm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors related to `processing-status`.

**Step 4: Commit**

```bash
git add -A components/processing-status.tsx
git commit --no-gpg-sign -m "chore: remove old SSE-based ProcessingStatus component"
```

---

### Task 9: Update E2E Seeds for Processing Jobs Table

The e2e test seeds don't need processing jobs data, but we should verify the migration doesn't break existing tests.

**Files:**
- No code changes expected

**Step 1: Reset the local database**

Run: `supabase db reset`
Expected: All migrations apply cleanly including the new `processing_jobs` table.

**Step 2: Run the e2e tests**

Run: `pnpm exec playwright test`
Expected: All existing tests pass. The `processing_jobs` table exists but has no data, which is fine — the `ActiveJobs` component hides itself when there are no jobs.

**Step 3: If tests pass, no commit needed. If tests fail, investigate and fix.**

---

## Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Database migration: `processing_jobs` table | — |
| 2 | Service role Supabase client | — |
| 3 | Processing jobs query helpers | 1 |
| 4 | Refactor video processing to async with `after()` | 1, 2 |
| 5 | Polling-based `JobProgress` component | 1 |
| 6 | Wire upload page to async processing | 4, 5 |
| 7 | Dashboard processing monitor | 3, 5 |
| 8 | Remove old SSE `ProcessingStatus` component | 6 |
| 9 | Verify e2e tests still pass | 1–8 |
