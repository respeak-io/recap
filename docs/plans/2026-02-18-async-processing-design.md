# Async Video Processing Design — Reeldocs

**Date:** 2026-02-18
**Status:** Complete (2026-02-19)
**Replaces:** `2026-02-12-async-processing-and-project-settings.md` (obsoleted by audience removal)

## Problem

Video processing is synchronous via SSE. The user must keep the browser tab open for the entire 30-120 second process. If they navigate away, the connection drops and processing may be interrupted. There's no way to check on processing status from anywhere other than the upload page.

## Solution

Make processing async using Next.js `after()`. The process route creates a `processing_jobs` record, returns immediately, and runs processing in the background with a service role Supabase client. A polling-based UI replaces the SSE client.

## Key Decisions

- **Per-video language selection stays** — languages are picked on the upload form, not at the project level
- **No audience concept** — one doc generation per video, no audience loops
- **Polling over Realtime** — 2s polling is simple and sufficient for a multi-minute process
- **Dashboard monitor included** — project overview shows active/recent processing jobs

## Architecture

### Database

New `processing_jobs` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK → projects |
| video_id | uuid | FK → videos |
| status | text | pending / processing / completed / failed |
| step | text | Current step identifier |
| step_message | text | Human-readable progress message |
| progress | numeric | 0.0 → 1.0 |
| error_message | text | Null unless failed |
| languages | text[] | Languages requested for this job |
| started_at | timestamptz | When processing began |
| completed_at | timestamptz | When processing finished |
| created_at | timestamptz | Row creation |
| updated_at | timestamptz | Auto-updated |

RLS: org members can read, org writers can insert/update.

### Processing Flow

```
Upload form → POST /api/videos/process { videoId, languages }
  ├─ Creates processing_jobs row (status: pending)
  ├─ Returns { jobId } immediately
  └─ after() → background processing with service role client
       ├─ uploading: signed URL → Gemini upload
       ├─ transcribing: extract video content → segments
       ├─ generating_docs: Gemini → chapters/articles
       ├─ translating_<lang>: per target language
       └─ complete: mark video ready
```

### Components

- **`lib/supabase/service.ts`** — Service role client for background processing
- **`components/job-progress.tsx`** — Polling-based progress display (replaces `processing-status.tsx`)
- **`components/dashboard/active-jobs.tsx`** — Dashboard processing monitor
- **`lib/queries/processing-jobs.ts`** — Query helpers for fetching jobs

### Upload Flow Change

`VideoUpload` calls process endpoint → gets `jobId` → renders `JobProgress` with "you can navigate away" message. No SSE stream.
