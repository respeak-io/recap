# Media Gallery & Video Internationalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-level media gallery for browsing images/videos, video internationalization (language variants), image DB tracking, and a unified MediaPicker replacing the existing VideoPicker.

**Architecture:** Database-first — new `images` table + `language`/`video_group_id` columns on `videos`. Gallery is a standalone dashboard page at `/projects/[slug]/media` with client-side Supabase queries for listing and API routes for mutations. The editor's `projectVideo` TipTap node gains a `videoGroupId` attr alongside legacy `videoId`. A unified `MediaPicker` dialog replaces `VideoPicker`.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Storage), TipTap, shadcn/ui (Tabs, Dialog, Select, Button), Tailwind CSS v4

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260402120000_media_gallery.sql` | Create `images` table, add `language` + `video_group_id` to `videos` |
| `app/api/projects/[id]/media/images/[imageId]/route.ts` | DELETE + PATCH for individual images |
| `app/api/projects/[id]/media/videos/[videoId]/route.ts` | DELETE + PATCH for individual videos |
| `app/api/projects/[id]/media/usage/route.ts` | GET endpoint: scan content_json for media references |
| `app/(dashboard)/project/[slug]/media/page.tsx` | Server component: load project, render gallery shell |
| `app/(dashboard)/project/[slug]/media/media-gallery.tsx` | Client component: tabbed gallery with image/video grids |
| `app/(dashboard)/project/[slug]/media/image-detail-dialog.tsx` | Client component: image detail panel with alt text, usage, delete |
| `app/(dashboard)/project/[slug]/media/video-group-detail-dialog.tsx` | Client component: video group detail with variants, usage, delete |
| `editor/media-picker.tsx` | Unified media picker dialog (replaces `editor/video-picker.tsx`) |

### Modified files

| File | Change |
|------|--------|
| `app/api/projects/[id]/media/upload/route.ts` | Insert row into `images` table after upload |
| `app/api/projects/[id]/media/upload-video/route.ts` | Accept `language` + `videoGroupId` form data params |
| `hooks/use-video-upload.ts` | Pass `language`/`videoGroupId`, return `videoGroupId` in result |
| `editor/extensions/project-video.ts` | Add `videoGroupId` attr, update `setProjectVideo` command |
| `editor/editor.tsx` | Replace `VideoPicker` with `MediaPicker`, use `videoGroupId` |
| `editor/toolbar.tsx` | Both image + video buttons open `MediaPicker` on appropriate tab |
| `editor/slash-menu.tsx` | Image + Video commands open `MediaPicker`; update callback signature |
| `components/dashboard/app-sidebar.tsx` | Add "Media" nav item |
| `app/(docs)/[projectSlug]/[articleSlug]/page.tsx` | Language-aware `resolveVideoUrls` with fallback chain |
| `components/docs/article-renderer.tsx` | Handle `videoGroupId` attr alongside `videoId` |

### Deleted files

| File | Reason |
|------|--------|
| `editor/video-picker.tsx` | Replaced by `editor/media-picker.tsx` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260402120000_media_gallery.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- images table
create table images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  alt_text text not null default '',
  width integer,
  height integer,
  size_bytes integer,
  created_at timestamptz not null default now()
);

-- Video i18n columns
alter table videos add column language text not null default 'en';
alter table videos add column video_group_id uuid not null default gen_random_uuid();

-- Each (group, language) pair must be unique
alter table videos add constraint uq_video_group_language unique (video_group_id, language);

-- RLS for images (mirrors videos pattern)
alter table images enable row level security;

create policy "Users can view images in their projects"
  on images for select
  using (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );

create policy "Users can insert images in their projects"
  on images for insert
  with check (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );

create policy "Users can update images in their projects"
  on images for update
  using (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );

create policy "Users can delete images in their projects"
  on images for delete
  using (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );

-- Public read for images (docs pages need to scan for usage)
create policy "Public can view images"
  on images for select
  using (true);
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push`
Expected: Migration applies successfully, `images` table created, `videos` table has `language` and `video_group_id` columns.

- [ ] **Step 3: Verify the schema**

Run: `npx supabase db dump --schema public | grep -A 5 "CREATE TABLE.*images\|video_group_id\|language"`
Expected: See `images` table definition and new columns on `videos`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260402120000_media_gallery.sql
git commit --no-gpg-sign -m "feat: add images table and video i18n columns (language, video_group_id)"
```

---

## Task 2: Update Upload Endpoints & Hook

**Files:**
- Modify: `app/api/projects/[id]/media/upload/route.ts`
- Modify: `app/api/projects/[id]/media/upload-video/route.ts`
- Modify: `hooks/use-video-upload.ts`

- [ ] **Step 1: Update image upload to insert into `images` table**

In `app/api/projects/[id]/media/upload/route.ts`, after the storage upload succeeds and before returning the response, insert a row into `images`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify project exists and user has access
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const ext = file.name.split(".").pop() ?? "png";
  const storagePath = `${id}/content/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(storagePath, file);

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Track the image in the database
  await supabase.from("images").insert({
    project_id: id,
    storage_path: storagePath,
    filename: file.name,
    size_bytes: file.size,
  });

  const { data: urlData } = supabase.storage
    .from("assets")
    .getPublicUrl(storagePath);

  return NextResponse.json({ url: urlData.publicUrl });
}
```

- [ ] **Step 2: Update video upload to accept `language` and `videoGroupId`**

In `app/api/projects/[id]/media/upload-video/route.ts`, read optional `language` and `videoGroupId` from form data. If `videoGroupId` is provided (adding a variant), use it; otherwise let the DB default generate a new one:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MIME_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const language = (formData.get("language") as string) || "en";
  const videoGroupId = formData.get("videoGroupId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File must be a video (MP4, WebM, or MOV)" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 25MB)" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Verify project exists and user has access
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Derive title from filename (minus extension)
  const title = file.name.replace(/\.[^.]+$/, "") || "Untitled Video";

  const ext = MIME_TO_EXT[file.type] ?? "mp4";
  const storagePath = `${id}/${randomUUID()}.${ext}`;

  // Upload to videos bucket
  const { error: uploadError } = await supabase.storage
    .from("videos")
    .upload(storagePath, file);

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Create videos table row with status 'ready'
  const insertData: Record<string, unknown> = {
    project_id: id,
    title,
    storage_path: storagePath,
    status: "ready",
    language,
  };
  if (videoGroupId) {
    insertData.video_group_id = videoGroupId;
  }

  const { data: video, error: insertError } = await supabase
    .from("videos")
    .insert(insertData)
    .select("id, title, video_group_id")
    .single();

  if (insertError) {
    // Clean up uploaded file if DB insert fails
    await supabase.storage.from("videos").remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    videoId: video.id,
    title: video.title,
    videoGroupId: video.video_group_id,
  });
}
```

- [ ] **Step 3: Update `useVideoUpload` hook to pass and return new fields**

Replace `hooks/use-video-upload.ts`:

```typescript
"use client";

import { useState, useCallback } from "react";

interface VideoUploadResult {
  videoId: string;
  title: string;
  videoGroupId: string;
}

interface UploadOptions {
  language?: string;
  videoGroupId?: string;
}

export function useVideoUpload(projectId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, options?: UploadOptions): Promise<VideoUploadResult | null> => {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      if (options?.language) formData.append("language", options.language);
      if (options?.videoGroupId) formData.append("videoGroupId", options.videoGroupId);

      try {
        const res = await fetch(
          `/api/projects/${projectId}/media/upload-video`,
          { method: "POST", body: formData }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }

        const result = await res.json();
        return result as VideoUploadResult;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setError(msg);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [projectId]
  );

  return { upload, uploading, error };
}
```

- [ ] **Step 4: Verify the app builds**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds (or only has pre-existing warnings).

- [ ] **Step 5: Commit**

```bash
git add app/api/projects/\[id\]/media/upload/route.ts app/api/projects/\[id\]/media/upload-video/route.ts hooks/use-video-upload.ts
git commit --no-gpg-sign -m "feat: track images in DB on upload, add video i18n params to upload endpoint"
```

---

## Task 3: Gallery API Routes

**Files:**
- Create: `app/api/projects/[id]/media/images/[imageId]/route.ts`
- Create: `app/api/projects/[id]/media/videos/[videoId]/route.ts`
- Create: `app/api/projects/[id]/media/usage/route.ts`

- [ ] **Step 1: Create image mutation API route**

Create `app/api/projects/[id]/media/images/[imageId]/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; imageId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id, imageId } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const { error } = await supabase
    .from("images")
    .update({ alt_text: body.altText })
    .eq("id", imageId)
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, imageId } = await params;
  const supabase = await createClient();

  // Get storage path before deleting row
  const { data: image } = await supabase
    .from("images")
    .select("storage_path")
    .eq("id", imageId)
    .eq("project_id", id)
    .single();

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // Delete storage file
  await supabase.storage.from("assets").remove([image.storage_path]);

  // Delete DB row
  await supabase.from("images").delete().eq("id", imageId).eq("project_id", id);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create video mutation API route**

Create `app/api/projects/[id]/media/videos/[videoId]/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; videoId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id, videoId } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;

  const { error } = await supabase
    .from("videos")
    .update(updates)
    .eq("id", videoId)
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, videoId } = await params;
  const supabase = await createClient();

  // Get storage path before deleting row
  const { data: video } = await supabase
    .from("videos")
    .select("storage_path")
    .eq("id", videoId)
    .eq("project_id", id)
    .single();

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  // Delete storage file
  await supabase.storage.from("videos").remove([video.storage_path]);

  // Delete DB row
  await supabase.from("videos").delete().eq("id", videoId).eq("project_id", id);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create usage scanning API route**

Create `app/api/projects/[id]/media/usage/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // "image" or "video"
  const needle = searchParams.get("needle"); // storage_path substring or videoGroupId

  if (!type || !needle) {
    return NextResponse.json({ error: "Missing type or needle" }, { status: 400 });
  }

  const supabase = await createClient();

  // Fetch all articles for this project
  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, content_json")
    .eq("project_id", id);

  // Fetch all chapters for this project
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, slug, content_json")
    .eq("project_id", id);

  const usedIn: { type: string; title: string; slug: string }[] = [];

  for (const article of articles ?? []) {
    if (article.content_json && JSON.stringify(article.content_json).includes(needle)) {
      usedIn.push({ type: "article", title: article.title, slug: article.slug });
    }
  }

  for (const chapter of chapters ?? []) {
    if (chapter.content_json && JSON.stringify(chapter.content_json).includes(needle)) {
      usedIn.push({ type: "chapter", title: chapter.title, slug: chapter.slug });
    }
  }

  return NextResponse.json({ usedIn });
}
```

- [ ] **Step 4: Verify the app builds**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/api/projects/\[id\]/media/images/ app/api/projects/\[id\]/media/videos/ app/api/projects/\[id\]/media/usage/
git commit --no-gpg-sign -m "feat: add gallery API routes for image/video mutations and usage scanning"
```

---

## Task 4: Gallery Page & Sidebar Navigation

**Files:**
- Create: `app/(dashboard)/project/[slug]/media/page.tsx`
- Create: `app/(dashboard)/project/[slug]/media/media-gallery.tsx`
- Create: `app/(dashboard)/project/[slug]/media/image-detail-dialog.tsx`
- Create: `app/(dashboard)/project/[slug]/media/video-group-detail-dialog.tsx`
- Modify: `components/dashboard/app-sidebar.tsx`

- [ ] **Step 1: Add "Media" to the sidebar navigation**

In `components/dashboard/app-sidebar.tsx`, add the `ImageIcon` import and a "Media" nav item after "Upload Video":

```typescript
import { LayoutDashboard, FileText, Upload, Settings, Globe, BarChart3, Key, ImageIcon } from "lucide-react";
```

Then in the `projectNav` array, add after the "Upload Video" entry:

```typescript
        {
          title: "Media",
          href: `/project/${currentProjectSlug}/media`,
          icon: ImageIcon,
        },
```

The full `projectNav` array becomes:

```typescript
  const projectNav = currentProjectSlug
    ? [
        {
          title: "Overview",
          href: `/project/${currentProjectSlug}`,
          icon: LayoutDashboard,
        },
        {
          title: "Articles",
          href: `/project/${currentProjectSlug}/articles`,
          icon: FileText,
        },
        {
          title: "Upload Video",
          href: `/project/${currentProjectSlug}/upload`,
          icon: Upload,
        },
        {
          title: "Media",
          href: `/project/${currentProjectSlug}/media`,
          icon: ImageIcon,
        },
        {
          title: "Analytics",
          href: `/project/${currentProjectSlug}/analytics`,
          icon: BarChart3,
        },
        {
          title: "Public Site",
          href: `/${currentProjectSlug}`,
          icon: Globe,
          external: true,
        },
        {
          title: "Settings",
          href: `/project/${currentProjectSlug}/settings`,
          icon: Settings,
        },
      ]
    : [];
```

- [ ] **Step 2: Create the gallery server page**

Create `app/(dashboard)/project/[slug]/media/page.tsx`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { notFound } from "next/navigation";
import { MediaGallery } from "./media-gallery";

export default async function MediaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Media" }]}
      />
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Media Gallery</h1>
        <MediaGallery projectId={project.id} />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Create the main gallery client component**

Create `app/(dashboard)/project/[slug]/media/media-gallery.tsx`:

```typescript
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, ImageIcon, Video, Languages } from "lucide-react";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useVideoUpload } from "@/hooks/use-video-upload";
import { ImageDetailDialog } from "./image-detail-dialog";
import { VideoGroupDetailDialog } from "./video-group-detail-dialog";
import { toast } from "sonner";

interface ImageItem {
  id: string;
  storage_path: string;
  filename: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  created_at: string;
}

interface VideoItem {
  id: string;
  title: string;
  language: string;
  video_group_id: string;
  created_at: string;
  storage_path: string;
}

interface VideoGroup {
  videoGroupId: string;
  title: string;
  languages: string[];
  videos: VideoItem[];
  createdAt: string;
}

function groupVideos(videos: VideoItem[]): VideoGroup[] {
  const map = new Map<string, VideoGroup>();
  for (const v of videos) {
    const existing = map.get(v.video_group_id);
    if (existing) {
      existing.languages.push(v.language);
      existing.videos.push(v);
    } else {
      map.set(v.video_group_id, {
        videoGroupId: v.video_group_id,
        title: v.title,
        languages: [v.language],
        videos: [v],
        createdAt: v.created_at,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function MediaGallery({ projectId }: { projectId: string }) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<VideoGroup | null>(null);
  const [supabaseUrl, setSupabaseUrl] = useState("");

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { upload: uploadImage, uploading: uploadingImage } = useMediaUpload(projectId);
  const { upload: uploadVideo, uploading: uploadingVideo } = useVideoUpload(projectId);

  const fetchMedia = useCallback(async () => {
    const supabase = createClient();

    const [{ data: imgData }, { data: vidData }] = await Promise.all([
      supabase
        .from("images")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("videos")
        .select("id, title, language, video_group_id, created_at, storage_path")
        .eq("project_id", projectId)
        .eq("status", "ready")
        .order("created_at", { ascending: false }),
    ]);

    setImages(imgData ?? []);
    setVideos(vidData ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchMedia();
    setSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  }, [fetchMedia]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file);
    if (url) {
      toast.success("Image uploaded");
      fetchMedia();
    } else {
      toast.error("Image upload failed");
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadVideo(file);
    if (result) {
      toast.success("Video uploaded");
      fetchMedia();
    } else {
      toast.error("Video upload failed");
    }
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  const videoGroups = groupVideos(videos);

  function getImageUrl(storagePath: string) {
    return `${supabaseUrl}/storage/v1/object/public/assets/${storagePath}`;
  }

  return (
    <>
      <Tabs defaultValue="images">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="videos">Videos</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="images">
          <div className="mb-4">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button
              variant="outline"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImage}
            >
              <Upload className="size-4 mr-2" />
              {uploadingImage ? "Uploading..." : "Upload Image"}
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : images.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="size-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No images uploaded yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(img)}
                  className="group relative aspect-square rounded-lg border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                >
                  <img
                    src={getImageUrl(img.storage_path)}
                    alt={img.alt_text || img.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-xs text-white truncate">{img.filename}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="videos">
          <div className="mb-4">
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={handleVideoUpload}
            />
            <Button
              variant="outline"
              onClick={() => videoInputRef.current?.click()}
              disabled={uploadingVideo}
            >
              <Upload className="size-4 mr-2" />
              {uploadingVideo ? "Uploading..." : "Upload Video"}
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : videoGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Video className="size-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No videos uploaded yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {videoGroups.map((group) => (
                <button
                  key={group.videoGroupId}
                  onClick={() => setSelectedGroup(group)}
                  className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-accent transition-colors"
                >
                  <Video className="size-5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{group.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Languages className="size-3.5 text-muted-foreground" />
                      <div className="flex gap-1">
                        {group.languages.map((lang) => (
                          <span
                            key={lang}
                            className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium uppercase"
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(group.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ImageDetailDialog
        image={selectedImage}
        projectId={projectId}
        supabaseUrl={supabaseUrl}
        onClose={() => setSelectedImage(null)}
        onUpdate={fetchMedia}
      />

      <VideoGroupDetailDialog
        group={selectedGroup}
        projectId={projectId}
        onClose={() => setSelectedGroup(null)}
        onUpdate={fetchMedia}
      />
    </>
  );
}
```

- [ ] **Step 4: Create the image detail dialog**

Create `app/(dashboard)/project/[slug]/media/image-detail-dialog.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ImageItem {
  id: string;
  storage_path: string;
  filename: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  created_at: string;
}

interface Props {
  image: ImageItem | null;
  projectId: string;
  supabaseUrl: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function ImageDetailDialog({ image, projectId, supabaseUrl, onClose, onUpdate }: Props) {
  const [altText, setAltText] = useState("");
  const [saving, setSaving] = useState(false);
  const [usedIn, setUsedIn] = useState<{ type: string; title: string; slug: string }[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    if (!image) return;
    setAltText(image.alt_text);

    // Fetch usage
    setLoadingUsage(true);
    fetch(`/api/projects/${projectId}/media/usage?type=image&needle=${encodeURIComponent(image.storage_path)}`)
      .then((r) => r.json())
      .then((data) => setUsedIn(data.usedIn ?? []))
      .finally(() => setLoadingUsage(false));
  }, [image, projectId]);

  async function saveAltText() {
    if (!image) return;
    setSaving(true);
    await fetch(`/api/projects/${projectId}/media/images/${image.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ altText }),
    });
    setSaving(false);
    toast.success("Alt text saved");
    onUpdate();
  }

  async function deleteImage() {
    if (!image) return;
    const confirmed = window.confirm(
      usedIn.length > 0
        ? `This image is used in ${usedIn.length} place(s). Delete anyway?`
        : "Delete this image?"
    );
    if (!confirmed) return;

    await fetch(`/api/projects/${projectId}/media/images/${image.id}`, {
      method: "DELETE",
    });
    toast.success("Image deleted");
    onClose();
    onUpdate();
  }

  if (!image) return null;

  const imageUrl = `${supabaseUrl}/storage/v1/object/public/assets/${image.storage_path}`;

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">{image.filename}</DialogTitle>
        </DialogHeader>

        <img
          src={imageUrl}
          alt={image.alt_text || image.filename}
          className="w-full rounded-lg border"
        />

        <div className="space-y-3">
          <div>
            <Label htmlFor="alt-text">Alt text</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="alt-text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe this image..."
              />
              <Button onClick={saveAltText} disabled={saving} size="sm">
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            {image.size_bytes && (
              <p>Size: {(image.size_bytes / 1024).toFixed(0)} KB</p>
            )}
            <p>Uploaded: {new Date(image.created_at).toLocaleDateString()}</p>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Used in</p>
            {loadingUsage ? (
              <p className="text-xs text-muted-foreground">Scanning...</p>
            ) : usedIn.length === 0 ? (
              <p className="text-xs text-muted-foreground">Not used in any content.</p>
            ) : (
              <ul className="text-sm space-y-0.5">
                {usedIn.map((ref) => (
                  <li key={ref.slug} className="text-muted-foreground">
                    {ref.title} ({ref.type})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button variant="destructive" size="sm" onClick={deleteImage}>
            <Trash2 className="size-4 mr-2" />
            Delete Image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Create the video group detail dialog**

Create `app/(dashboard)/project/[slug]/media/video-group-detail-dialog.tsx`:

```typescript
"use client";

import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Upload, Languages } from "lucide-react";
import { useVideoUpload } from "@/hooks/use-video-upload";
import { toast } from "sonner";

interface VideoItem {
  id: string;
  title: string;
  language: string;
  video_group_id: string;
  created_at: string;
  storage_path: string;
}

interface VideoGroup {
  videoGroupId: string;
  title: string;
  languages: string[];
  videos: VideoItem[];
  createdAt: string;
}

interface Props {
  group: VideoGroup | null;
  projectId: string;
  onClose: () => void;
  onUpdate: () => void;
}

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "zh", label: "中文" },
];

export function VideoGroupDetailDialog({ group, projectId, onClose, onUpdate }: Props) {
  const [usedIn, setUsedIn] = useState<{ type: string; title: string; slug: string }[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [newLang, setNewLang] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useVideoUpload(projectId);

  useEffect(() => {
    if (!group) return;

    setLoadingUsage(true);
    fetch(`/api/projects/${projectId}/media/usage?type=video&needle=${encodeURIComponent(group.videoGroupId)}`)
      .then((r) => r.json())
      .then((data) => setUsedIn(data.usedIn ?? []))
      .finally(() => setLoadingUsage(false));
  }, [group, projectId]);

  async function handleAddVariant(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !group || !newLang) return;

    const result = await upload(file, {
      language: newLang,
      videoGroupId: group.videoGroupId,
    });
    if (result) {
      toast.success(`Added ${newLang.toUpperCase()} variant`);
      setNewLang("");
      onUpdate();
    } else {
      toast.error("Upload failed");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteVariant(videoId: string, language: string) {
    if (!group) return;
    const isLast = group.videos.length === 1;
    const confirmed = window.confirm(
      isLast
        ? "This is the last variant. Deleting it will remove the video group entirely. Continue?"
        : `Delete the ${language.toUpperCase()} variant?`
    );
    if (!confirmed) return;

    await fetch(`/api/projects/${projectId}/media/videos/${videoId}`, {
      method: "DELETE",
    });
    toast.success(`Deleted ${language.toUpperCase()} variant`);
    if (isLast) onClose();
    onUpdate();
  }

  if (!group) return null;

  const availableLanguages = LANGUAGE_OPTIONS.filter(
    (l) => !group.languages.includes(l.value)
  );

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">{group.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Language variants */}
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Languages className="size-4" />
              Language Variants
            </p>
            <div className="space-y-2">
              {group.videos.map((video) => (
                <div
                  key={video.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-secondary font-medium uppercase">
                      {video.language}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {LANGUAGE_OPTIONS.find((l) => l.value === video.language)?.label ?? video.language}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteVariant(video.id, video.language)}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Add variant */}
          {availableLanguages.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Add Language Variant</p>
              <div className="flex gap-2">
                <Select value={newLang} onValueChange={setNewLang}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Language..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLanguages.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={handleAddVariant}
                />
                <Button
                  variant="outline"
                  disabled={!newLang || uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4 mr-2" />
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </div>
          )}

          {/* Usage */}
          <div>
            <p className="text-sm font-medium mb-1">Used in</p>
            {loadingUsage ? (
              <p className="text-xs text-muted-foreground">Scanning...</p>
            ) : usedIn.length === 0 ? (
              <p className="text-xs text-muted-foreground">Not used in any content.</p>
            ) : (
              <ul className="text-sm space-y-0.5">
                {usedIn.map((ref) => (
                  <li key={ref.slug} className="text-muted-foreground">
                    {ref.title} ({ref.type})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            <p>Group ID: <code className="bg-muted px-1 rounded">{group.videoGroupId}</code></p>
            <p>Created: {new Date(group.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Verify the app builds**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/app-sidebar.tsx app/\(dashboard\)/project/\[slug\]/media/
git commit --no-gpg-sign -m "feat: add media gallery page with image/video tabs and detail dialogs"
```

---

## Task 5: ProjectVideo Extension & Renderer (Video i18n)

**Files:**
- Modify: `editor/extensions/project-video.ts`
- Modify: `app/(docs)/[projectSlug]/[articleSlug]/page.tsx`
- Modify: `components/docs/article-renderer.tsx`

- [ ] **Step 1: Add `videoGroupId` to the ProjectVideo TipTap extension**

Replace `editor/extensions/project-video.ts`:

```typescript
import { Node, mergeAttributes } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    projectVideo: {
      setProjectVideo: (attrs: { videoId?: string; videoGroupId?: string; title: string }) => ReturnType;
    };
  }
}

export const ProjectVideo = Node.create({
  name: "projectVideo",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      videoId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-video-id"),
        renderHTML: (attributes) => ({ "data-video-id": attributes.videoId }),
      },
      videoGroupId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-video-group-id"),
        renderHTML: (attributes) => ({ "data-video-group-id": attributes.videoGroupId }),
      },
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="projectVideo"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const title = HTMLAttributes["data-title"] || "Video";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "projectVideo",
        class: "flex items-center gap-3 rounded-lg border border-dashed p-4 my-4 bg-muted/30",
      }),
      [
        "div",
        { class: "flex items-center gap-3 text-sm text-muted-foreground" },
        ["span", {}, "🎬"],
        ["span", {}, title],
      ],
    ];
  },

  addCommands() {
    return {
      setProjectVideo:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
```

- [ ] **Step 2: Update `resolveVideoUrls` for language-aware lookup with fallback chain**

In `app/(docs)/[projectSlug]/[articleSlug]/page.tsx`, replace the `resolveVideoUrls` function (lines 39-76):

```typescript
async function resolveVideoUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contentJson: Record<string, unknown>,
  language: string,
  projectDefaultLanguage: string
): Promise<Record<string, string>> {
  const videoIds = new Set<string>();
  const videoGroupIds = new Set<string>();

  function walk(nodes: unknown[]) {
    for (const node of nodes) {
      const n = node as Record<string, unknown>;
      if (n.type === "projectVideo" && n.attrs) {
        const attrs = n.attrs as Record<string, unknown>;
        if (attrs.videoGroupId) videoGroupIds.add(attrs.videoGroupId as string);
        else if (attrs.videoId) videoIds.add(attrs.videoId as string);
      }
      if (Array.isArray(n.content)) walk(n.content);
    }
  }

  const content = (contentJson as Record<string, unknown>).content;
  if (Array.isArray(content)) walk(content);

  if (videoIds.size === 0 && videoGroupIds.size === 0) return {};

  const urls: Record<string, string> = {};

  // Handle legacy videoId references
  if (videoIds.size > 0) {
    const { data: legacyVideos } = await supabase
      .from("videos")
      .select("id, storage_path")
      .in("id", Array.from(videoIds))
      .eq("status", "ready");

    for (const video of legacyVideos ?? []) {
      if (video.storage_path) {
        const { data } = await supabase.storage
          .from("videos")
          .createSignedUrl(video.storage_path, 3600);
        if (data?.signedUrl) urls[video.id] = data.signedUrl;
      }
    }
  }

  // Handle videoGroupId references with language fallback
  if (videoGroupIds.size > 0) {
    const { data: groupVideos } = await supabase
      .from("videos")
      .select("id, video_group_id, language, storage_path, created_at")
      .in("video_group_id", Array.from(videoGroupIds))
      .eq("status", "ready");

    // Group by video_group_id
    const grouped = new Map<string, typeof groupVideos>();
    for (const v of groupVideos ?? []) {
      const list = grouped.get(v.video_group_id) ?? [];
      list.push(v);
      grouped.set(v.video_group_id, list);
    }

    for (const [groupId, variants] of grouped) {
      if (!variants || variants.length === 0) continue;

      // Fallback chain: requested language -> project default -> oldest
      const match =
        variants.find((v) => v.language === language) ??
        variants.find((v) => v.language === projectDefaultLanguage) ??
        variants.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

      if (match?.storage_path) {
        const { data } = await supabase.storage
          .from("videos")
          .createSignedUrl(match.storage_path, 3600);
        if (data?.signedUrl) urls[groupId] = data.signedUrl;
      }
    }
  }

  return urls;
}
```

- [ ] **Step 3: Update the call sites for `resolveVideoUrls`**

In the same file, find the article branch call (around line 182):

Replace:
```typescript
    const embeddedVideoUrls = await resolveVideoUrls(supabase, article.content_json);
```
With:
```typescript
    const embeddedVideoUrls = await resolveVideoUrls(supabase, article.content_json, lang, "en");
```

And the chapter branch call (around line 240-241):

Replace:
```typescript
  const chapterVideoUrls = chapterContentJson
    ? await resolveVideoUrls(supabase, chapterContentJson as Record<string, unknown>)
    : {};
```
With:
```typescript
  const chapterVideoUrls = chapterContentJson
    ? await resolveVideoUrls(supabase, chapterContentJson as Record<string, unknown>, lang, "en")
    : {};
```

- [ ] **Step 4: Update the article renderer to handle `videoGroupId`**

In `components/docs/article-renderer.tsx`, update the `projectVideo` case (around line 254):

Replace:
```typescript
    case "projectVideo": {
      const videoId = node.attrs?.videoId as string;
      const title = (node.attrs?.title as string) || "Video";
      const src = videoUrls?.[videoId];
```
With:
```typescript
    case "projectVideo": {
      const videoId = node.attrs?.videoId as string | undefined;
      const videoGroupId = node.attrs?.videoGroupId as string | undefined;
      const title = (node.attrs?.title as string) || "Video";
      const src = videoUrls?.[videoGroupId ?? videoId ?? ""];
```

- [ ] **Step 5: Verify the app builds**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add editor/extensions/project-video.ts app/\(docs\)/\[projectSlug\]/\[articleSlug\]/page.tsx components/docs/article-renderer.tsx
git commit --no-gpg-sign -m "feat: add video i18n with videoGroupId attr and language-aware fallback chain"
```

---

## Task 6: Unified MediaPicker & Editor Integration

**Files:**
- Create: `editor/media-picker.tsx`
- Modify: `editor/editor.tsx`
- Modify: `editor/toolbar.tsx`
- Modify: `editor/slash-menu.tsx`
- Delete: `editor/video-picker.tsx`

- [ ] **Step 1: Create the unified MediaPicker component**

Create `editor/media-picker.tsx`:

```typescript
"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, ImageIcon, Video, Languages } from "lucide-react";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useVideoUpload } from "@/hooks/use-video-upload";

interface ImageItem {
  id: string;
  storage_path: string;
  filename: string;
  alt_text: string;
}

interface VideoGroup {
  videoGroupId: string;
  title: string;
  languages: string[];
}

interface VideoRow {
  id: string;
  title: string;
  language: string;
  video_group_id: string;
}

export type MediaPickerTab = "images" | "videos";

interface MediaPickerProps {
  projectId: string;
  open: boolean;
  defaultTab?: MediaPickerTab;
  onOpenChange: (open: boolean) => void;
  onSelectImage: (url: string) => void;
  onSelectVideoGroup: (videoGroupId: string, title: string) => void;
}

function groupVideoRows(rows: VideoRow[]): VideoGroup[] {
  const map = new Map<string, VideoGroup>();
  for (const v of rows) {
    const existing = map.get(v.video_group_id);
    if (existing) {
      existing.languages.push(v.language);
    } else {
      map.set(v.video_group_id, {
        videoGroupId: v.video_group_id,
        title: v.title,
        languages: [v.language],
      });
    }
  }
  return Array.from(map.values());
}

export function MediaPicker({
  projectId,
  open,
  defaultTab = "images",
  onOpenChange,
  onSelectImage,
  onSelectVideoGroup,
}: MediaPickerProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { upload: uploadImage, uploading: uploadingImage } = useMediaUpload(projectId);
  const { upload: uploadVideo, uploading: uploadingVideo } = useVideoUpload(projectId);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

    const supabase = createClient();
    Promise.all([
      supabase
        .from("images")
        .select("id, storage_path, filename, alt_text")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("videos")
        .select("id, title, language, video_group_id")
        .eq("project_id", projectId)
        .eq("status", "ready")
        .order("created_at", { ascending: false }),
    ]).then(([{ data: imgData }, { data: vidData }]) => {
      setImages(imgData ?? []);
      setVideoGroups(groupVideoRows(vidData ?? []));
      setLoading(false);
    });
  }, [open, projectId]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file);
    if (url) {
      onSelectImage(url);
      onOpenChange(false);
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadVideo(file);
    if (result) {
      onSelectVideoGroup(result.videoGroupId, result.title);
      onOpenChange(false);
    }
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  function getImageUrl(storagePath: string) {
    return `${supabaseUrl}/storage/v1/object/public/assets/${storagePath}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Insert Media</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full">
            <TabsTrigger value="images" className="flex-1">Images</TabsTrigger>
            <TabsTrigger value="videos" className="flex-1">Videos</TabsTrigger>
          </TabsList>

          <TabsContent value="images" className="mt-3">
            {/* Upload */}
            <div className="border-b pb-3 mb-3">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
              >
                <Upload className="size-4 mr-2" />
                {uploadingImage ? "Uploading..." : "Upload new image"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                PNG, JPG, GIF, WebP, SVG — max 10MB
              </p>
            </div>

            {/* Gallery grid */}
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
              ) : images.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No images in this project.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => {
                        onSelectImage(getImageUrl(img.storage_path));
                        onOpenChange(false);
                      }}
                      className="aspect-square rounded-md border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                    >
                      <img
                        src={getImageUrl(img.storage_path)}
                        alt={img.alt_text || img.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="videos" className="mt-3">
            {/* Upload */}
            <div className="border-b pb-3 mb-3">
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={handleVideoUpload}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadingVideo}
              >
                <Upload className="size-4 mr-2" />
                {uploadingVideo ? "Uploading..." : "Upload new video"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                MP4, WebM, or MOV — max 25MB
              </p>
            </div>

            {/* Video groups list */}
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
              ) : videoGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No videos in this project.
                </p>
              ) : (
                <div className="space-y-1">
                  {videoGroups.map((group) => (
                    <button
                      key={group.videoGroupId}
                      onClick={() => {
                        onSelectVideoGroup(group.videoGroupId, group.title);
                        onOpenChange(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                    >
                      <Video className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{group.title}</span>
                      <div className="flex gap-1">
                        {group.languages.map((lang) => (
                          <span
                            key={lang}
                            className="text-[10px] px-1 py-0.5 rounded bg-secondary font-medium uppercase"
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update editor.tsx to use MediaPicker instead of VideoPicker**

Replace `editor/editor.tsx`:

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { FileHandler } from "@tiptap/extension-file-handler";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useVideoUpload } from "@/hooks/use-video-upload";
import { TimestampLink } from "./extensions/timestamp-link";
import { Callout } from "./extensions/callout";
import { ProjectVideo } from "./extensions/project-video";
import { SlashCommand } from "./extensions/slash-command";
import { slashCommandSuggestion } from "./slash-menu";
import { BubbleMenuContent } from "./bubble-menu";
import { MediaPicker, type MediaPickerTab } from "./media-picker";
import Link from "@tiptap/extension-link";
import { Details, DetailsSummary, DetailsContent } from "@tiptap/extension-details";
import { mergeAttributes } from "@tiptap/core";
import { TabGroup, Tab } from "./extensions/tabs";
import { Steps, Step } from "./extensions/steps";
import Typography from "@tiptap/extension-typography";
import { Toolbar } from "./toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

const lowlight = createLowlight(common);

// Override DetailsSummary to render as div[data-type="detailsSummary"] instead of
// native <summary>. The tiptap extension's own CSS targets this data-type selector,
// but renders <summary> by default — causing a mismatch with Tailwind v4's compilation.
const CustomDetailsSummary = DetailsSummary.extend({
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { "data-type": "detailsSummary" }), 0];
  },
  parseHTML() {
    return [
      { tag: 'div[data-type="detailsSummary"]' },
      { tag: "summary" },
    ];
  },
});

interface EditorProps {
  content: Record<string, unknown>;
  onUpdate: (json: Record<string, unknown>) => void;
  onTimestampClick?: (seconds: number) => void;
  projectId?: string;
}

export function Editor({ content, onUpdate, onTimestampClick, projectId }: EditorProps) {
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState<MediaPickerTab>("images");
  const { upload } = useMediaUpload(projectId ?? "");
  const { upload: uploadVideo } = useVideoUpload(projectId ?? "");

  function openMediaPicker(tab: MediaPickerTab) {
    setMediaPickerTab(tab);
    setMediaPickerOpen(true);
  }

  async function handleImageUpload(editor: any, file: File, pos?: number) {
    if (!editor || !projectId) return;
    const url = await upload(file);
    if (url) {
      if (pos !== undefined) {
        editor.chain().focus().insertContentAt(pos, { type: "image", attrs: { src: url } }).run();
      } else {
        editor.chain().focus().setImage({ src: url }).run();
      }
    } else {
      toast.error("Image upload failed. Please try again.");
    }
  }

  async function handleVideoUpload(editor: any, file: File, pos?: number) {
    if (!editor || !projectId) return;
    const result = await uploadVideo(file);
    if (result) {
      const node = { type: "projectVideo", attrs: { videoGroupId: result.videoGroupId, title: result.title } };
      if (pos !== undefined) {
        editor.chain().focus().insertContentAt(pos, node).run();
      } else {
        editor.chain().focus().insertContent(node).run();
      }
    } else {
      toast.error("Video upload failed. Please try again.");
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Image.configure({
        resize: {
          enabled: true,
          alwaysPreserveAspectRatio: true,
          minWidth: 50,
          minHeight: 50,
        },
      }),
      ...(projectId
        ? [
            FileHandler.configure({
              allowedMimeTypes: [
                "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
                "video/mp4", "video/webm", "video/quicktime",
              ],
              onDrop: (editor, files, pos) => {
                for (const file of files) {
                  if (file.type.startsWith("video/")) {
                    handleVideoUpload(editor, file, pos);
                  } else {
                    handleImageUpload(editor, file, pos);
                  }
                }
              },
              onPaste: (editor, files) => {
                for (const file of files) {
                  if (file.type.startsWith("video/")) {
                    handleVideoUpload(editor, file);
                  } else {
                    handleImageUpload(editor, file);
                  }
                }
              },
            }),
          ]
        : []),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder: "Start writing..." }),
      TimestampLink.configure({ onTimestampClick }),
      Callout,
      Link.configure({ openOnClick: false }),
      Details,
      CustomDetailsSummary,
      DetailsContent,
      TabGroup,
      Tab,
      Steps,
      Step,
      ProjectVideo,
      Typography,
      SlashCommand.configure({
        suggestion: slashCommandSuggestion(projectId, (tab: MediaPickerTab) => openMediaPicker(tab)),
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getJSON());
    },
  });

  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  if (!editor) return null;

  return (
    <TooltipProvider>
      <div className="border rounded-lg">
        <Toolbar
          editor={editor}
          projectId={projectId}
          onOpenMediaPicker={openMediaPicker}
        />
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none p-4 min-h-[400px] focus-within:outline-none [&_.ProseMirror]:outline-none"
        />
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor, state }) => {
            const { from, to } = state.selection;
            if (from === to) return false;
            if (editor.isActive("codeBlock")) return false;
            return true;
          }}
        >
          <BubbleMenuContent editor={editor} />
        </BubbleMenu>
      </div>
      {projectId && (
        <MediaPicker
          projectId={projectId}
          open={mediaPickerOpen}
          defaultTab={mediaPickerTab}
          onOpenChange={setMediaPickerOpen}
          onSelectImage={(url) => {
            editorRef.current?.chain().focus().setImage({ src: url }).run();
          }}
          onSelectVideoGroup={(videoGroupId, title) => {
            editorRef.current
              ?.chain()
              .focus()
              .setProjectVideo({ videoGroupId, title })
              .run();
          }}
        />
      )}
    </TooltipProvider>
  );
}
```

- [ ] **Step 3: Update toolbar to use unified MediaPicker callbacks**

Replace `editor/toolbar.tsx`:

```typescript
"use client";

import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Code,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Minus,
  Info,
  AlertTriangle,
  Lightbulb,
  Clock,
  ImageIcon,
  Video,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MediaPickerTab } from "./media-picker";

interface ToolbarProps {
  editor: Editor;
  projectId?: string;
  onOpenMediaPicker?: (tab: MediaPickerTab) => void;
}

function ToolbarButton({
  onClick,
  active,
  tooltip,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function Toolbar({ editor, projectId, onOpenMediaPicker }: ToolbarProps) {
  function insertTimestamp() {
    const input = prompt("Enter timestamp (MM:SS):");
    if (!input) return;
    const parts = input.split(":");
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(parts[1], 10) || 0;
    editor.commands.insertTimestamp(minutes * 60 + seconds);
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        tooltip="Bold"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        tooltip="Italic"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        tooltip="Inline code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-6 w-px bg-border" />

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        active={editor.isActive("heading", { level: 2 })}
        tooltip="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        active={editor.isActive("heading", { level: 3 })}
        tooltip="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-6 w-px bg-border" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        tooltip="Bullet list"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        tooltip="Numbered list"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        tooltip="Code block"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        tooltip="Quote"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        tooltip="Divider"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-6 w-px bg-border" />

      <ToolbarButton
        onClick={() => editor.chain().focus().setCallout("info").run()}
        tooltip="Info callout"
      >
        <Info className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setCallout("warning").run()}
        tooltip="Warning callout"
      >
        <AlertTriangle className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setCallout("tip").run()}
        tooltip="Tip callout"
      >
        <Lightbulb className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-6 w-px bg-border" />

      <ToolbarButton onClick={insertTimestamp} tooltip="Insert timestamp">
        <Clock className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-6 w-px bg-border" />

      <ToolbarButton
        onClick={() => onOpenMediaPicker?.("images")}
        tooltip="Insert image"
      >
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>

      {projectId && onOpenMediaPicker && (
        <ToolbarButton
          onClick={() => onOpenMediaPicker("videos")}
          tooltip="Insert video"
        >
          <Video className="h-4 w-4" />
        </ToolbarButton>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update slash-menu.tsx to open MediaPicker**

In `editor/slash-menu.tsx`, change the callback signature and update the Image and Video slash commands.

Change the function signature:

```typescript
import type { MediaPickerTab } from "./media-picker";
```

Update `getDefaultItems` signature:
```typescript
function getDefaultItems(projectId?: string, onOpenMediaPicker?: (tab: MediaPickerTab) => void): SlashCommandItem[] {
```

Replace the Image command (the one starting at line 199 with `title: "Image"`):

```typescript
    {
      title: "Image",
      description: "Browse gallery or upload an image",
      icon: Image,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        onOpenMediaPicker?.("images");
      },
    },
```

Replace the Video command (the conditional block starting at line 236):

```typescript
    ...(projectId && onOpenMediaPicker
      ? [
          {
            title: "Video",
            description: "Browse gallery or upload a video",
            icon: Video,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
              editor.chain().focus().deleteRange(range).run();
              onOpenMediaPicker("videos");
            },
          },
        ]
      : []),
```

Update `slashCommandSuggestion` signature:

```typescript
export function slashCommandSuggestion(projectId?: string, onOpenMediaPicker?: (tab: MediaPickerTab) => void) {
  return {
    items: ({ query }: { query: string }) => {
      return getDefaultItems(projectId, onOpenMediaPicker).filter(
```

- [ ] **Step 5: Delete the old VideoPicker**

Run: `rm editor/video-picker.tsx`

- [ ] **Step 6: Verify the app builds**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds. No references to `VideoPicker` remain.

- [ ] **Step 7: Commit**

```bash
git add editor/media-picker.tsx editor/editor.tsx editor/toolbar.tsx editor/slash-menu.tsx
git rm editor/video-picker.tsx
git commit --no-gpg-sign -m "feat: replace VideoPicker with unified MediaPicker, use videoGroupId for new inserts"
```

---

## Summary

| Task | Description | Key files |
|------|-------------|-----------|
| 1 | Database migration — `images` table + video i18n columns | `supabase/migrations/20260402120000_media_gallery.sql` |
| 2 | Upload endpoints — image DB tracking, video i18n params | `upload/route.ts`, `upload-video/route.ts`, `use-video-upload.ts` |
| 3 | Gallery API routes — CRUD + usage scanning | `images/[imageId]/route.ts`, `videos/[videoId]/route.ts`, `usage/route.ts` |
| 4 | Gallery page + sidebar — browsing images/videos with detail dialogs | `media/page.tsx`, `media-gallery.tsx`, detail dialogs, sidebar |
| 5 | Video i18n in renderer — `videoGroupId` attr + language fallback chain | `project-video.ts`, docs page, `article-renderer.tsx` |
| 6 | Unified MediaPicker — replace VideoPicker, update toolbar/slash commands | `media-picker.tsx`, `editor.tsx`, `toolbar.tsx`, `slash-menu.tsx` |
