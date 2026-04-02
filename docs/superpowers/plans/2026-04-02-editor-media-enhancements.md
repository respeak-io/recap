# Editor Media Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable image resizing in the editor, direct video upload (drag & drop / paste / file picker), and add Image + Video toolbar buttons.

**Architecture:** Three independent enhancements to the existing TipTap editor. Image resizing uses the built-in `@tiptap/extension-image` resize config. Video upload mirrors the existing image upload pattern with a new API endpoint + hook. Toolbar gets two new icon buttons that reuse existing upload/picker logic.

**Tech Stack:** TipTap 3.19.0, Next.js 16 App Router, Supabase Storage, React hooks

**Spec:** `docs/superpowers/specs/2026-04-02-editor-media-enhancements-design.md`

---

## File Structure

### New Files
- `app/api/projects/[id]/media/upload-video/route.ts` — API endpoint for video upload to Supabase `videos` bucket + DB row creation
- `hooks/use-video-upload.ts` — React hook for video upload (mirrors `hooks/use-media-upload.ts`)

### Modified Files
- `editor/editor.tsx` — Image resize config, extend FileHandler for video mime types, pass new props to Toolbar
- `editor/toolbar.tsx` — Add Image and Video buttons with new props
- `editor/video-picker.tsx` — Add "Upload video" button with file picker
- `components/docs/article-renderer.tsx` — Respect `width`/`height` attrs on image nodes

---

### Task 1: Enable Image Resizing

**Files:**
- Modify: `editor/editor.tsx:78`
- Modify: `components/docs/article-renderer.tsx:116-124`

- [ ] **Step 1: Configure Image extension with resize**

In `editor/editor.tsx`, replace line 78:

```typescript
Image,
```

with:

```typescript
Image.configure({
  resize: {
    enabled: true,
    alwaysPreserveAspectRatio: true,
    minWidth: 50,
    minHeight: 50,
  },
}),
```

- [ ] **Step 2: Update article renderer to respect image dimensions**

In `components/docs/article-renderer.tsx`, replace the `case "image":` block (lines 116-124):

```typescript
    case "image":
      return (
        <img
          key={index}
          src={node.attrs?.src as string}
          alt={(node.attrs?.alt as string) ?? ""}
          className="rounded-lg"
        />
      );
```

with:

```typescript
    case "image": {
      const imgWidth = node.attrs?.width as number | undefined;
      const imgHeight = node.attrs?.height as number | undefined;
      return (
        <img
          key={index}
          src={node.attrs?.src as string}
          alt={(node.attrs?.alt as string) ?? ""}
          className="rounded-lg"
          style={imgWidth ? { width: imgWidth, height: imgHeight ?? "auto" } : undefined}
        />
      );
    }
```

- [ ] **Step 3: Verify image resize works**

Run: `npm run dev`

1. Open the editor for any article in the dashboard
2. Insert an image (via `/Image` slash command or drag & drop)
3. Click the image — drag handles should appear on corners/edges
4. Drag a handle — image should resize while preserving aspect ratio
5. Save the article, then view the public docs page — image should render at the resized dimensions

- [ ] **Step 4: Commit**

```bash
git add editor/editor.tsx components/docs/article-renderer.tsx
git commit --no-gpg-sign -m "feat: enable image resizing with drag handles in editor"
```

---

### Task 2: Video Upload API Endpoint

**Files:**
- Create: `app/api/projects/[id]/media/upload-video/route.ts`

- [ ] **Step 1: Create the video upload endpoint**

Create `app/api/projects/[id]/media/upload-video/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

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

  const ext = file.name.split(".").pop() ?? "mp4";
  const storagePath = `${id}/${randomUUID()}.${ext}`;

  // Upload to videos bucket
  const { error: uploadError } = await supabase.storage
    .from("videos")
    .upload(storagePath, file);

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Create videos table row with status 'ready'
  const { data: video, error: insertError } = await supabase
    .from("videos")
    .insert({
      project_id: id,
      title,
      storage_path: storagePath,
      status: "ready",
    })
    .select("id, title")
    .single();

  if (insertError) {
    // Clean up uploaded file if DB insert fails
    await supabase.storage.from("videos").remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ videoId: video.id, title: video.title });
}
```

- [ ] **Step 2: Verify the endpoint compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `upload-video/route.ts`

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/\[id\]/media/upload-video/route.ts
git commit --no-gpg-sign -m "feat: add video upload API endpoint (25MB max, creates videos row)"
```

---

### Task 3: Video Upload Hook

**Files:**
- Create: `hooks/use-video-upload.ts`

- [ ] **Step 1: Create the video upload hook**

Create `hooks/use-video-upload.ts`:

```typescript
"use client";

import { useState, useCallback } from "react";

interface VideoUploadResult {
  videoId: string;
  title: string;
}

export function useVideoUpload(projectId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<VideoUploadResult | null> => {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);

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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `use-video-upload.ts`

- [ ] **Step 3: Commit**

```bash
git add hooks/use-video-upload.ts
git commit --no-gpg-sign -m "feat: add useVideoUpload hook for editor video uploads"
```

---

### Task 4: Extend FileHandler for Video Drag & Drop

**Files:**
- Modify: `editor/editor.tsx:13,56-68,79-95`

- [ ] **Step 1: Add video upload hook and extend FileHandler**

In `editor/editor.tsx`, add the import for `useVideoUpload` after line 13 (`import { useMediaUpload } ...`):

```typescript
import { useVideoUpload } from "@/hooks/use-video-upload";
```

After line 56 (`const { upload } = useMediaUpload(projectId ?? "");`), add:

```typescript
  const { upload: uploadVideo } = useVideoUpload(projectId ?? "");
```

After the `handleImageUpload` function (after line 68), add:

```typescript
  async function handleVideoUpload(editor: any, file: File, pos?: number) {
    if (!editor || !projectId) return;
    const result = await uploadVideo(file);
    if (result) {
      const node = { type: "projectVideo", attrs: { videoId: result.videoId, title: result.title } };
      if (pos !== undefined) {
        editor.chain().focus().insertContentAt(pos, node).run();
      } else {
        editor.chain().focus().insertContent(node).run();
      }
    }
  }
```

Replace the FileHandler configuration block (lines 79-95):

```typescript
      ...(projectId
        ? [
            FileHandler.configure({
              allowedMimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"],
              onDrop: (editor, files, pos) => {
                for (const file of files) {
                  handleImageUpload(editor, file, pos);
                }
              },
              onPaste: (editor, files) => {
                for (const file of files) {
                  handleImageUpload(editor, file);
                }
              },
            }),
          ]
        : []),
```

with:

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Test drag & drop video upload**

Run: `npm run dev`

1. Open the editor for any article in the dashboard
2. Drag a small MP4 file (< 25MB) into the editor
3. A `projectVideo` preview block should appear with the filename as title
4. View the public docs page — the video should render as a `<video>` player

- [ ] **Step 4: Commit**

```bash
git add editor/editor.tsx
git commit --no-gpg-sign -m "feat: extend FileHandler to support video drag & drop and paste"
```

---

### Task 5: Add Upload to VideoPicker

**Files:**
- Modify: `editor/video-picker.tsx`

- [ ] **Step 1: Add upload button and file picker to VideoPicker**

Replace the entire contents of `editor/video-picker.tsx`:

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
import { Button } from "@/components/ui/button";
import { Upload, Video } from "lucide-react";
import { useVideoUpload } from "@/hooks/use-video-upload";

interface VideoItem {
  id: string;
  title: string;
}

interface VideoPickerProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (video: VideoItem) => void;
}

export function VideoPicker({ projectId, open, onOpenChange, onSelect }: VideoPickerProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useVideoUpload(projectId);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    const supabase = createClient();
    supabase
      .from("videos")
      .select("id, title")
      .eq("project_id", projectId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setVideos(data ?? []);
        setLoading(false);
      });
  }, [open, projectId]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await upload(file);
    if (result) {
      onSelect({ id: result.videoId, title: result.title });
      onOpenChange(false);
    }

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Video</DialogTitle>
        </DialogHeader>

        {/* Upload button */}
        <div className="border-b pb-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-4 mr-2" />
            {uploading ? "Uploading..." : "Upload new video"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            MP4, WebM, or MOV — max 25MB
          </p>
        </div>

        {/* Existing videos list */}
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No existing videos in this project.
            </p>
          ) : (
            <div className="space-y-1">
              {videos.map((video) => (
                <button
                  key={video.id}
                  onClick={() => {
                    onSelect(video);
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                >
                  <Video className="size-4 shrink-0 text-muted-foreground" />
                  <span>{video.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Test the updated video picker**

Run: `npm run dev`

1. Open the editor, type `/Video` to open the picker
2. The modal should now show an "Upload new video" button at the top
3. Below it, existing project videos should still be listed
4. Click "Upload new video" → file picker opens for video files
5. Select a small MP4 → "Uploading..." state → video node inserted

- [ ] **Step 4: Commit**

```bash
git add editor/video-picker.tsx
git commit --no-gpg-sign -m "feat: add upload capability to video picker modal"
```

---

### Task 6: Toolbar Image and Video Buttons

**Files:**
- Modify: `editor/toolbar.tsx:3-4,26-28,59,69-186`
- Modify: `editor/editor.tsx:133`

- [ ] **Step 1: Update Toolbar component with Image and Video buttons**

In `editor/toolbar.tsx`, update the import from `lucide-react` (line 3-19) to include `ImageIcon` and `Video`:

```typescript
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
```

Replace the `ToolbarProps` interface (line 26-28):

```typescript
interface ToolbarProps {
  editor: Editor;
  projectId?: string;
  onImageUpload?: (file: File) => void;
  onOpenVideoPicker?: () => void;
}
```

Update the function signature (line 59):

```typescript
export function Toolbar({ editor, projectId, onImageUpload, onOpenVideoPicker }: ToolbarProps) {
```

Add a new function inside `Toolbar`, after the `insertTimestamp` function:

```typescript
  function pickImage() {
    if (onImageUpload) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) onImageUpload(file);
      };
      input.click();
    } else {
      const url = window.prompt("Image URL:");
      if (url) editor.chain().focus().setImage({ src: url }).run();
    }
  }
```

Add the Image and Video buttons at the end of the toolbar, before the closing `</div>` (after the Clock/timestamp button block):

```typescript
      <div className="mx-1 h-6 w-px bg-border" />

      <ToolbarButton onClick={pickImage} tooltip="Insert image">
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>

      {projectId && onOpenVideoPicker && (
        <ToolbarButton onClick={onOpenVideoPicker} tooltip="Insert video">
          <Video className="h-4 w-4" />
        </ToolbarButton>
      )}
```

- [ ] **Step 2: Pass new props from Editor to Toolbar**

In `editor/editor.tsx`, replace the `<Toolbar>` usage (line 133):

```typescript
        <Toolbar editor={editor} />
```

with:

```typescript
        <Toolbar
          editor={editor}
          projectId={projectId}
          onImageUpload={(file) => handleImageUpload(editor, file)}
          onOpenVideoPicker={() => setVideoPickerOpen(true)}
        />
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Test toolbar buttons**

Run: `npm run dev`

1. Open the editor — toolbar should now show Image and Video icons after the timestamp button
2. Click the Image icon → file picker opens → select image → image appears in editor
3. Click the Video icon → video picker modal opens (same as `/Video` slash command)
4. Video button should only appear when editing a project article/chapter (when `projectId` is set)

- [ ] **Step 5: Commit**

```bash
git add editor/toolbar.tsx editor/editor.tsx
git commit --no-gpg-sign -m "feat: add Image and Video buttons to editor toolbar"
```
