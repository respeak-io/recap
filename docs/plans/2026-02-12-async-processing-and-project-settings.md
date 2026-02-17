# Async Video Processing & Project Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make video processing asynchronous so users can navigate away during processing, add a processing monitor to the dashboard, create a project settings page for language/audience configuration with clear primary language indication.

**Architecture:** Add a `processing_jobs` table to track async job state and progress. Refactor the `/api/videos/process` route to return immediately and use Next.js `after()` to run processing in the background with a service-role Supabase client. Add `primary_language`, `languages`, and `default_audiences` columns to the `projects` table so these are configured once at the project level rather than per-video. The dashboard overview shows active/recent processing jobs with polling-based live updates.

**Tech Stack:** Next.js 16 `after()` API, Supabase (PostgreSQL + service role client), shadcn/ui, polling-based progress tracking

---

### Task 1: Database Migration — Processing Jobs Table + Project Settings Columns

**Files:**
- Create: `supabase/migrations/20260213000000_async_processing_and_project_settings.sql`

**Step 1: Write the migration**

```sql
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
  audiences text[] not null default '{}',
  languages text[] not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger processing_jobs_updated_at
  before update on processing_jobs
  for each row execute function update_updated_at();

-- RLS for processing_jobs
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

-- Project settings columns: languages and audiences configured at project level
alter table projects add column primary_language text not null default 'en';
alter table projects add column languages text[] not null default '{en}';
alter table projects add column default_audiences text[] not null default '{developers}';
```

**Step 2: Apply the migration locally**

Run: `supabase db reset`
Expected: All migrations apply cleanly. `processing_jobs` table exists. `projects` table has new columns.

**Step 3: Commit**

```bash
git add supabase/migrations/20260213000000_async_processing_and_project_settings.sql
git commit --no-gpg-sign -m "feat: add processing_jobs table and project settings columns (languages, audiences)"
```

---

### Task 2: Service Role Supabase Client

The background processing via `after()` runs after the response is sent. The user's session cookies may not be reliably available, and the JWT could expire during long processing. A service role client bypasses RLS and has no expiration.

**Files:**
- Create: `lib/supabase/service.ts`

**Step 1: Write the service role client**

```typescript
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

**Step 2: Commit**

```bash
git add lib/supabase/service.ts
git commit --no-gpg-sign -m "feat: add Supabase service role client for background processing"
```

---

### Task 3: Query Helpers — Processing Jobs + Project Settings

**Files:**
- Create: `lib/queries/processing-jobs.ts`
- Modify: `lib/queries/projects.ts`

**Step 1: Write processing jobs query helpers**

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

**Step 2: Add `updateProjectSettings` to projects.ts**

In `lib/queries/projects.ts`, add this function at the end of the file:

```typescript
export async function updateProjectSettings(
  id: string,
  settings: {
    primary_language?: string;
    languages?: string[];
    default_audiences?: string[];
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update(settings)
    .eq("id", id);

  if (error) throw error;
}
```

**Step 3: Commit**

```bash
git add lib/queries/processing-jobs.ts lib/queries/projects.ts
git commit --no-gpg-sign -m "feat: add query helpers for processing jobs and project settings"
```

---

### Task 4: Refactor Video Processing to Async

This is the core change. The process route creates a job record, returns immediately, and uses `after()` to run processing in the background. Progress is written to the `processing_jobs` table instead of streamed via SSE.

**Files:**
- Modify: `app/api/videos/process/route.ts` (full rewrite)

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
  const { videoId } = await request.json();

  // Fetch video and its project settings
  const { data: video } = await supabase
    .from("videos")
    .select("*, projects(id, primary_language, languages, default_audiences)")
    .eq("id", videoId)
    .single();

  if (!video) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const project = video.projects as {
    id: string;
    primary_language: string;
    languages: string[];
    default_audiences: string[];
  };

  const audiences = project.default_audiences;
  const languages = project.languages;
  const primaryLanguage = project.primary_language;

  // Create processing job
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      project_id: project.id,
      video_id: videoId,
      status: "pending",
      audiences,
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
      await db
        .from("processing_jobs")
        .update(updates)
        .eq("id", job.id);
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

      const vttLanguages: Record<string, string> = { [primaryLanguage]: vtt };

      await db
        .from("videos")
        .update({ vtt_content: vtt, vtt_languages: vttLanguages })
        .eq("id", videoId);

      // Calculate progress allocation
      const targetLanguages = languages.filter((l: string) => l !== primaryLanguage);
      const totalAudienceSteps = audiences.length * (1 + targetLanguages.length);
      const progressPerStep = 0.6 / Math.max(totalAudienceSteps, 1);
      let currentProgress = 0.25;

      // Track created articles for translation
      const createdArticles: {
        audience: string;
        chapterId: string | null;
        title: string;
        slug: string;
        contentJson: Record<string, unknown>;
        contentText: string;
      }[] = [];

      // Generate docs for each audience in primary language
      for (const audience of audiences) {
        await updateJob({
          step: "generating_docs",
          step_message: `Generating ${audience} documentation...`,
          progress: currentProgress,
        });

        const prompt = getDocGenerationPrompt(audience, segments);

        const response = await getAI().models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" },
        });

        const doc = JSON.parse(response.text!);

        for (const chapter of doc.chapters) {
          const chapterSlug = slugify(chapter.title, {
            lower: true,
            strict: true,
          });

          const { data: chapterRow } = await db
            .from("chapters")
            .upsert(
              {
                project_id: project.id,
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

          const articleSlug = slugify(chapter.title, {
            lower: true,
            strict: true,
          });

          const contentJson = markdownToTiptap(chapter.sections);

          await db.from("articles").insert({
            project_id: project.id,
            video_id: videoId,
            chapter_id: chapterRow?.id,
            title: chapter.title,
            slug: articleSlug,
            audience,
            language: primaryLanguage,
            content_json: contentJson,
            content_text: contentText,
            status: "draft",
          });

          createdArticles.push({
            audience,
            chapterId: chapterRow?.id ?? null,
            title: chapter.title,
            slug: articleSlug,
            contentJson,
            contentText,
          });
        }

        currentProgress += progressPerStep;
      }

      // Translate to all non-primary target languages
      for (const lang of targetLanguages) {
        await updateJob({
          step: "translating",
          step_message: `Translating to ${lang}...`,
          progress: currentProgress,
        });

        // Translate VTT
        try {
          const translatedVtt = await translateVtt(vtt, lang);
          vttLanguages[lang] = translatedVtt;
        } catch (e) {
          console.error(`VTT translation to ${lang} failed:`, e);
        }

        // Translate each article
        for (const article of createdArticles) {
          try {
            const { json: translatedJson, text: translatedText, title: translatedTitle } =
              await translateTiptapJson(
                article.contentJson,
                article.contentText,
                lang,
                article.title
              );

            await db.from("articles").insert({
              project_id: project.id,
              video_id: videoId,
              chapter_id: article.chapterId,
              title: translatedTitle ?? article.title,
              slug: article.slug,
              audience: article.audience,
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

        currentProgress += progressPerStep * audiences.length;
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
        step_message: error instanceof Error ? error.message : "Processing failed",
        error_message: error instanceof Error ? error.message : "Processing failed",
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

### Task 5: Job Progress Polling Component

Replace the SSE-based `ProcessingStatus` with a polling-based component that reads from the `processing_jobs` table.

**Files:**
- Create: `components/job-progress.tsx`

**Step 1: Write the polling-based job progress component**

```typescript
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
  audiences: string[];
  languages: string[];
  videos?: { title: string } | null;
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
        .select("*, videos(title)")
        .eq("id", jobId)
        .single();

      if (!active) return;
      if (!data) return;

      setJob(data as ProcessingJob);

      if (data.status === "completed") {
        onComplete?.();
        return;
      }

      if (data.status === "failed") return;

      // Poll again in 2 seconds
      setTimeout(poll, 2000);
    }

    poll();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (!job) return null;

  const primaryLanguage = job.languages[0] ?? "en";
  const targetLanguages = job.languages.filter((l) => l !== primaryLanguage);

  const steps = [
    { key: "uploading", label: "Uploading video to AI" },
    { key: "transcribing", label: "Extracting content" },
    ...job.audiences.map((a) => ({
      key: `generating_docs_${a}`,
      label: `Generating ${a} docs`,
    })),
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

    if (stepKey.startsWith("generating_docs_")) {
      const audience = stepKey.replace("generating_docs_", "");
      const audienceIdx = job.audiences.indexOf(audience);
      if (currentStep === "generating_docs") {
        // Check if current step_message mentions a later audience
        const currentAudienceIdx = job.audiences.findIndex((a) =>
          job.step_message?.includes(a)
        );
        return audienceIdx < currentAudienceIdx;
      }
      const stepIdx = STEP_ORDER.indexOf("generating_docs");
      const currentIdx = STEP_ORDER.indexOf(currentStep);
      return currentIdx > stepIdx;
    }

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

    if (stepKey.startsWith("generating_docs_")) {
      const audience = stepKey.replace("generating_docs_", "");
      return currentStep === "generating_docs" && (job.step_message?.includes(audience) ?? false);
    }
    if (stepKey.startsWith("translating_")) {
      const lang = stepKey.replace("translating_", "");
      return currentStep === "translating" && (job.step_message?.includes(lang) ?? false);
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

### Task 6: Project Settings Page

Create the settings page with language and audience configuration. The primary language is clearly marked with a badge. This page is the first tab of settings — the corporate identity plan can add more sections later.

**Files:**
- Create: `app/(dashboard)/project/[slug]/settings/page.tsx`
- Create: `components/dashboard/project-settings.tsx`

**Step 1: Write the project settings client component**

```typescript
// components/dashboard/project-settings.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, Star } from "lucide-react";

const AUDIENCES = [
  { id: "developers", label: "Developers", description: "Technical docs with code snippets and API references" },
  { id: "end-users", label: "End Users", description: "Step-by-step guides with simple language" },
  { id: "ai-agents", label: "AI Agents", description: "LLM-optimized docs for coding assistants" },
];

const LANGUAGES = [
  { id: "en", label: "English", flag: "\u{1F1FA}\u{1F1F8}" },
  { id: "de", label: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
  { id: "es", label: "Espanol", flag: "\u{1F1EA}\u{1F1F8}" },
  { id: "fr", label: "Francais", flag: "\u{1F1EB}\u{1F1F7}" },
  { id: "ja", label: "Japanese", flag: "\u{1F1EF}\u{1F1F5}" },
  { id: "zh", label: "Chinese", flag: "\u{1F1E8}\u{1F1F3}" },
  { id: "ko", label: "Korean", flag: "\u{1F1F0}\u{1F1F7}" },
  { id: "pt", label: "Portugues", flag: "\u{1F1E7}\u{1F1F7}" },
];

interface ProjectSettingsProps {
  projectId: string;
  primaryLanguage: string;
  languages: string[];
  defaultAudiences: string[];
}

export function ProjectSettings({
  projectId,
  primaryLanguage: initialPrimary,
  languages: initialLanguages,
  defaultAudiences: initialAudiences,
}: ProjectSettingsProps) {
  const [primaryLanguage, setPrimaryLanguage] = useState(initialPrimary);
  const [languages, setLanguages] = useState<string[]>(initialLanguages);
  const [audiences, setAudiences] = useState<string[]>(initialAudiences);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function toggleLanguage(id: string) {
    if (id === primaryLanguage) return; // Can't remove primary
    setLanguages((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  }

  function setPrimary(id: string) {
    setPrimaryLanguage(id);
    // Ensure primary is in the languages list
    setLanguages((prev) => (prev.includes(id) ? prev : [id, ...prev]));
  }

  function toggleAudience(id: string) {
    setAudiences((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter((a) => a !== id);
      }
      return [...prev, id];
    });
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primary_language: primaryLanguage,
        languages,
        default_audiences: audiences,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      {/* Languages */}
      <Card>
        <CardHeader>
          <CardTitle>Languages</CardTitle>
          <CardDescription>
            Configure which languages your documentation is generated in.
            Click the star to set the primary language — docs are generated in
            the primary language first, then translated to the others.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {LANGUAGES.map((l) => {
              const isSelected = languages.includes(l.id);
              const isPrimary = primaryLanguage === l.id;

              return (
                <div
                  key={l.id}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                    isSelected
                      ? isPrimary
                        ? "border-primary bg-primary/5"
                        : "border-primary/50 bg-primary/5"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <label className="flex items-center gap-3 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleLanguage(l.id)}
                      disabled={isPrimary}
                      className="rounded"
                    />
                    <span className="text-base">{l.flag}</span>
                    <span className="text-sm font-medium">{l.label}</span>
                    {isPrimary && (
                      <Badge variant="default" className="text-xs">
                        Primary
                      </Badge>
                    )}
                    {isSelected && !isPrimary && (
                      <Badge variant="secondary" className="text-xs">
                        Auto-translated
                      </Badge>
                    )}
                  </label>
                  {isSelected && (
                    <Button
                      variant={isPrimary ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setPrimary(l.id)}
                      title={isPrimary ? "Primary language" : "Set as primary"}
                    >
                      <Star
                        className={`size-4 ${isPrimary ? "fill-current" : ""}`}
                      />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Audiences */}
      <Card>
        <CardHeader>
          <CardTitle>Default Audiences</CardTitle>
          <CardDescription>
            Choose which audience versions to generate when processing a video.
            Each audience gets its own tailored documentation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {AUDIENCES.map((a) => (
              <label
                key={a.id}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  audiences.includes(a.id)
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={audiences.includes(a.id)}
                  onChange={() => toggleAudience(a.id)}
                  className="mt-0.5 rounded"
                />
                <div>
                  <span className="text-sm font-medium">{a.label}</span>
                  <p className="text-xs text-muted-foreground">
                    {a.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="size-4 mr-2" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Write the settings page server component**

```typescript
// app/(dashboard)/project/[slug]/settings/page.tsx
import { createClient } from "@/lib/supabase/server";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { ProjectSettings } from "@/components/dashboard/project-settings";
import { notFound } from "next/navigation";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug, primary_language, languages, default_audiences")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Settings" }]}
      />
      <div className="p-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Project Settings</h1>
        <p className="text-muted-foreground mb-8">
          Configure languages and audiences for documentation generation.
        </p>
        <ProjectSettings
          projectId={project.id}
          primaryLanguage={project.primary_language}
          languages={project.languages}
          defaultAudiences={project.default_audiences}
        />
      </div>
    </>
  );
}
```

**Step 3: Commit**

```bash
git add app/\(dashboard\)/project/\[slug\]/settings/page.tsx components/dashboard/project-settings.tsx
git commit --no-gpg-sign -m "feat: add project settings page with language and audience configuration"
```

---

### Task 7: Settings Update API Endpoint

**Files:**
- Create: `app/api/projects/[id]/settings/route.ts`

**Step 1: Write the endpoint**

```typescript
// app/api/projects/[id]/settings/route.ts
import { createClient } from "@/lib/supabase/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const { primary_language, languages, default_audiences } = body;

  // Validate: primary must be in languages list
  if (primary_language && languages && !languages.includes(primary_language)) {
    return Response.json(
      { error: "Primary language must be in the languages list" },
      { status: 400 }
    );
  }

  // Validate: at least one audience
  if (default_audiences && default_audiences.length === 0) {
    return Response.json(
      { error: "At least one audience is required" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (primary_language !== undefined) updates.primary_language = primary_language;
  if (languages !== undefined) updates.languages = languages;
  if (default_audiences !== undefined) updates.default_audiences = default_audiences;

  const { error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
```

**Step 2: Commit**

```bash
git add app/api/projects/\[id\]/settings/route.ts
git commit --no-gpg-sign -m "feat: add PUT /api/projects/[id]/settings endpoint"
```

---

### Task 8: Update Upload Page — Use Project Settings, Simplify Form

Remove per-video language and audience selection. The upload page reads project settings and displays them as info. Users go to settings to change languages/audiences.

**Files:**
- Modify: `components/video-upload.tsx` (remove language/audience pickers, show project config)
- Modify: `app/(dashboard)/project/[slug]/upload/page.tsx` (pass project settings)

**Step 1: Update the upload page server component to pass project settings**

Replace the content of `app/(dashboard)/project/[slug]/upload/page.tsx` with:

```typescript
import { createClient } from "@/lib/supabase/server";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { VideoUpload } from "@/components/video-upload";
import { notFound } from "next/navigation";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug, primary_language, languages, default_audiences")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Upload Video" }]}
      />
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">Upload Video</h1>
        <p className="text-muted-foreground mb-8">
          Upload a product video and we'll generate documentation using your
          project's language and audience settings.
        </p>
        <VideoUpload
          projectId={project.id}
          projectSlug={slug}
          primaryLanguage={project.primary_language}
          languages={project.languages}
          audiences={project.default_audiences}
        />
      </div>
    </>
  );
}
```

**Step 2: Rewrite the VideoUpload component**

Replace the entire content of `components/video-upload.tsx` with:

```typescript
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { JobProgress } from "./job-progress";
import { Upload, Settings } from "lucide-react";
import Link from "next/link";

const LANGUAGE_LABELS: Record<string, { label: string; flag: string }> = {
  en: { label: "English", flag: "\u{1F1FA}\u{1F1F8}" },
  de: { label: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
  es: { label: "Espanol", flag: "\u{1F1EA}\u{1F1F8}" },
  fr: { label: "Francais", flag: "\u{1F1EB}\u{1F1F7}" },
  ja: { label: "Japanese", flag: "\u{1F1EF}\u{1F1F5}" },
  zh: { label: "Chinese", flag: "\u{1F1E8}\u{1F1F3}" },
  ko: { label: "Korean", flag: "\u{1F1F0}\u{1F1F7}" },
  pt: { label: "Portugues", flag: "\u{1F1E7}\u{1F1F7}" },
};

interface VideoUploadProps {
  projectId: string;
  projectSlug: string;
  primaryLanguage: string;
  languages: string[];
  audiences: string[];
}

export function VideoUpload({
  projectId,
  projectSlug,
  primaryLanguage,
  languages,
  audiences,
}: VideoUploadProps) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const urlRes = await fetch("/api/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const { videoId, uploadUrl } = await urlRes.json();
      if (!uploadUrl) throw new Error("Failed to get upload URL");

      setUploadProgress(10);
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      setUploadProgress(80);

      await supabase
        .from("videos")
        .update({ title: title || file.name })
        .eq("id", videoId);

      setUploadProgress(100);

      // Start async processing
      const processRes = await fetch("/api/videos/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      const { jobId } = await processRes.json();

      setUploading(false);
      setProcessingJobId(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  }

  function handleProcessingComplete() {
    setProcessingJobId(null);
    setTitle("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  if (processingJobId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Processing video</CardTitle>
        </CardHeader>
        <CardContent>
          <JobProgress
            jobId={processingJobId}
            onComplete={handleProcessingComplete}
          />
          <p className="text-sm text-muted-foreground mt-4">
            You can navigate away — processing continues in the background.
            Check progress on the project overview.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleUpload} className="space-y-8">
      {/* Video file */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Video file</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Upload an MP4, MOV, or WebM file. Screen recordings, product demos,
            and tutorials work best.
          </p>
        </div>
        <div className="space-y-3">
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
            <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              {file ? file.name : "Drag and drop or click to select"}
            </p>
            <Input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="max-w-xs mx-auto"
              required
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Title */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Title</Label>
          <p className="text-sm text-muted-foreground mt-1">
            A name for this video. Used as the default title for generated
            articles.
          </p>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Getting Started Tutorial"
        />
      </div>

      <Separator />

      {/* Project config summary */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Languages</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Configured in project settings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {languages.map((l) => {
            const info = LANGUAGE_LABELS[l];
            const isPrimary = l === primaryLanguage;
            return (
              <Badge
                key={l}
                variant={isPrimary ? "default" : "secondary"}
                className="text-sm py-1 px-3"
              >
                {info?.flag} {info?.label ?? l}
                {isPrimary && " (Primary)"}
              </Badge>
            );
          })}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/project/${projectSlug}/settings`}>
              <Settings className="size-4 mr-1" />
              Change
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Audiences</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Configured in project settings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {audiences.map((a) => (
            <Badge key={a} variant="secondary" className="text-sm py-1 px-3">
              {a}
            </Badge>
          ))}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/project/${projectSlug}/settings`}>
              <Settings className="size-4 mr-1" />
              Change
            </Link>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Upload status */}
      {uploading && <Progress value={uploadProgress} className="w-full" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={uploading || !file} size="lg">
          {uploading ? "Uploading..." : "Upload & generate docs"}
        </Button>
      </div>
    </form>
  );
}
```

**Step 3: Verify the upload page renders correctly**

Run: `pnpm run dev`
Visit `http://localhost:3000/project/<slug>/upload`. Expected: Upload form with video file picker, title input, and project language/audience badges with "Change" links to settings. No per-video language/audience checkboxes.

**Step 4: Commit**

```bash
git add components/video-upload.tsx app/\(dashboard\)/project/\[slug\]/upload/page.tsx
git commit --no-gpg-sign -m "feat: simplify upload page to use project-level language and audience settings"
```

---

### Task 9: Dashboard Processing Monitor

Add an active/recent processing jobs section to the project overview page.

**Files:**
- Create: `components/dashboard/active-jobs.tsx`
- Modify: `app/(dashboard)/project/[slug]/page.tsx` (add active jobs section)

**Step 1: Write the active jobs client component**

```typescript
// components/dashboard/active-jobs.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const hasActiveJobs = jobs.some((j) => j.status === "pending" || j.status === "processing");

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
        (j: { status: string }) => j.status === "pending" || j.status === "processing"
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
                  {(job.status === "processing" || job.status === "pending") && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {job.step_message ?? "Waiting..."}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(job.status === "processing" || job.status === "pending") && (
                  <div className="w-20 bg-secondary rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round(job.progress * 100)}%` }}
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

**Step 2: Update the project overview page to include active jobs**

In `app/(dashboard)/project/[slug]/page.tsx`, add the import at the top:

```typescript
import { getRecentJobs } from "@/lib/queries/processing-jobs";
import { ActiveJobs } from "@/components/dashboard/active-jobs";
```

After the `recentArticles` computation (around line 56), add:

```typescript
const recentJobs = await getRecentJobs(project.id);
```

In the JSX, add the `ActiveJobs` component between the stats row and the articles/quick-links grid (after the closing `</div>` of the stats grid at line 105):

```tsx
{recentJobs.length > 0 && (
  <ActiveJobs projectId={project.id} initialJobs={recentJobs} />
)}
```

**Step 3: Verify the overview shows active jobs**

Run: `pnpm run dev`
Visit `http://localhost:3000/project/<slug>`. Expected: If there are processing jobs, they show below the stats cards with live progress. If no jobs, the section is hidden.

**Step 4: Commit**

```bash
git add components/dashboard/active-jobs.tsx app/\(dashboard\)/project/\[slug\]/page.tsx
git commit --no-gpg-sign -m "feat: add processing jobs monitor to project overview dashboard"
```

---

### Task 10: Clean Up Old Processing Status Component

The old SSE-based `ProcessingStatus` component is no longer used. Remove it.

**Files:**
- Delete: `components/processing-status.tsx`

**Step 1: Verify no remaining imports**

Search the codebase for any remaining imports of `processing-status`:

Run: `grep -r "processing-status" --include="*.tsx" --include="*.ts" .`
Expected: No results (the old import in `video-upload.tsx` was already replaced in Task 8).

**Step 2: Delete the file**

```bash
rm components/processing-status.tsx
```

**Step 3: Verify build passes**

Run: `pnpm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add -A components/processing-status.tsx
git commit --no-gpg-sign -m "chore: remove old SSE-based ProcessingStatus component"
```

---

## Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Database migration: processing_jobs table + project settings columns | — |
| 2 | Service role Supabase client | — |
| 3 | Query helpers for processing jobs + project settings | 1 |
| 4 | Refactor video processing to async with `after()` | 1, 2 |
| 5 | Polling-based JobProgress component | 1 |
| 6 | Project settings page (languages + audiences) | 1, 3 |
| 7 | Settings update API endpoint | 1 |
| 8 | Simplify upload page to use project settings | 4, 5, 6, 7 |
| 9 | Dashboard processing monitor | 3, 5 |
| 10 | Remove old SSE ProcessingStatus component | 8 |
