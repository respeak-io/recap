# Editor Media Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image upload (drag & drop, paste, file picker) and project video embedding to the TipTap editor.

**Architecture:** Extend the existing Editor component with `@tiptap/extension-file-handler` for image drop/paste, a new upload API endpoint for Supabase Storage, and a custom `projectVideo` TipTap node with picker modal. The Editor component gets a new `projectId` prop to enable both features. The docs-side ArticleRenderer gets a new `projectVideo` case.

**Tech Stack:** TipTap 3.x, Next.js App Router, Supabase Storage (assets bucket), React

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `hooks/use-media-upload.ts` | Reusable hook: uploads a file to the media API, returns public URL + loading/error state |
| `app/api/projects/[id]/media/upload/route.ts` | API route: accepts image file, validates, uploads to `assets` bucket, returns public URL |
| `editor/extensions/project-video.ts` | Custom TipTap node extension for embedded project videos |
| `editor/video-picker.tsx` | Modal component: lists project videos, user selects one to embed |

### Modified Files
| File | Changes |
|------|---------|
| `editor/editor.tsx` | Add `projectId` prop, register `FileHandler` + `ProjectVideo` extensions, wire up upload on drop/paste |
| `editor/slash-menu.tsx` | Update `/Image` command (file picker + URL fallback), add `/Video` command |
| `components/docs/article-renderer.tsx` | Add `projectVideo` node rendering with `<video>` tag |
| `lib/ai/markdown-to-tiptap.ts` | Add `[project-video:{uuid}]` syntax support |
| `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/page.tsx` | Pass `projectId` to client component |
| `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/editor-page-client.tsx` | Accept + forward `projectId` to Editor |
| `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/page.tsx` | Pass `projectId` to client component |
| `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/chapter-editor-client.tsx` | Accept + forward `projectId` to Editor |
| `app/(docs)/[projectSlug]/[articleSlug]/page.tsx` | Pass `projectId` to ArticleRenderer for video URL resolution |
| `components/docs/chapter-page.tsx` | Pass `projectId` to ArticleRenderer |
| `package.json` | Add `@tiptap/extension-file-handler` dependency |

---

### Task 1: Install FileHandler extension

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
pnpm add @tiptap/extension-file-handler
```

- [ ] **Step 2: Verify installation**

```bash
pnpm ls @tiptap/extension-file-handler
```

Expected: Package listed with version 3.x

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit --no-gpg-sign -m "chore: add @tiptap/extension-file-handler dependency"
```

---

### Task 2: Media upload API endpoint

**Files:**
- Create: `app/api/projects/[id]/media/upload/route.ts`

- [ ] **Step 1: Create the upload endpoint**

Create `app/api/projects/[id]/media/upload/route.ts`:

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

  const { data: urlData } = supabase.storage
    .from("assets")
    .getPublicUrl(storagePath);

  return NextResponse.json({ url: urlData.publicUrl });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/\[id\]/media/upload/route.ts
git commit --no-gpg-sign -m "feat: add media upload API endpoint for content images"
```

---

### Task 3: useMediaUpload hook

**Files:**
- Create: `hooks/use-media-upload.ts`

- [ ] **Step 1: Create the hook**

Create `hooks/use-media-upload.ts`:

```typescript
"use client";

import { useState, useCallback } from "react";

export function useMediaUpload(projectId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(`/api/projects/${projectId}/media/upload`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }

        const { url } = await res.json();
        return url as string;
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

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-media-upload.ts
git commit --no-gpg-sign -m "feat: add useMediaUpload hook for image uploads"
```

---

### Task 4: Wire up image upload in the Editor

This is the core task — adds FileHandler for drag & drop / paste, and passes `projectId` through the component tree.

**Files:**
- Modify: `editor/editor.tsx`
- Modify: `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/page.tsx`
- Modify: `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/editor-page-client.tsx`
- Modify: `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/page.tsx`
- Modify: `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/chapter-editor-client.tsx`

- [ ] **Step 1: Update Editor component to accept projectId and add FileHandler**

In `editor/editor.tsx`:

Add imports at the top:

```typescript
import { FileHandler } from "@tiptap/extension-file-handler";
import { useMediaUpload } from "@/hooks/use-media-upload";
```

Update the `EditorProps` interface:

```typescript
interface EditorProps {
  content: Record<string, unknown>;
  onUpdate: (json: Record<string, unknown>) => void;
  onTimestampClick?: (seconds: number) => void;
  projectId?: string;
}
```

Update the component signature and add upload handling:

```typescript
export function Editor({ content, onUpdate, onTimestampClick, projectId }: EditorProps) {
  const { upload } = useMediaUpload(projectId ?? "");

  async function handleImageUpload(editor: ReturnType<typeof useEditor>, file: File, pos?: number) {
    if (!editor || !projectId) return;
    const url = await upload(file);
    if (url) {
      if (pos !== undefined) {
        editor.chain().focus().insertContentAt(pos, { type: "image", attrs: { src: url } }).run();
      } else {
        editor.chain().focus().setImage({ src: url }).run();
      }
    }
  }
```

Add `FileHandler` to the extensions array (after the existing `Image` extension):

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

- [ ] **Step 2: Pass projectId through article edit page**

In `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/page.tsx`, update the `EditorPageClient` props to include `projectId`:

Add `projectId={article.project_id}` to the EditorPageClient component call (after the `projectName` prop on line 54):

```typescript
      projectId={article.project_id}
```

In `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/editor-page-client.tsx`:

Add `projectId: string;` to the props destructuring (after `currentLanguage`).

Pass it to the Editor component:

```typescript
        <Editor
          key={article.id}
          content={article.content_json}
          onUpdate={handleUpdate}
          onTimestampClick={handleTimestampClick}
          projectId={projectId}
        />
```

- [ ] **Step 3: Pass projectId through chapter edit page**

In `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/page.tsx`:

Update the query to also select `project_id`:

```typescript
    .select("id, title, description, slug, content_json, project_id, projects!inner(name)")
```

Pass `projectId` to the client component:

```typescript
      projectId={chapter.project_id}
```

In `app/(dashboard)/project/[slug]/chapter/[chapterSlug]/edit/chapter-editor-client.tsx`:

Add `projectId: string;` to `ChapterEditorClientProps`.

Add `projectId` to the destructured props.

Pass it to the Editor:

```typescript
        <Editor
          key={chapter.id}
          content={chapter.content_json}
          onUpdate={handleUpdate}
          projectId={projectId}
        />
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No type errors.

- [ ] **Step 5: Manual test**

```bash
pnpm dev
```

Open an article in the editor. Drag an image into the editor — it should upload and appear inline. Paste a screenshot — same behavior.

- [ ] **Step 6: Commit**

```bash
git add editor/editor.tsx \
  app/\(dashboard\)/project/\[slug\]/article/\[articleSlug\]/edit/page.tsx \
  app/\(dashboard\)/project/\[slug\]/article/\[articleSlug\]/edit/editor-page-client.tsx \
  app/\(dashboard\)/project/\[slug\]/chapter/\[chapterSlug\]/edit/page.tsx \
  app/\(dashboard\)/project/\[slug\]/chapter/\[chapterSlug\]/edit/chapter-editor-client.tsx
git commit --no-gpg-sign -m "feat: wire up image upload via drag & drop and paste in editor"
```

---

### Task 5: Update /Image slash command with file picker

**Files:**
- Modify: `editor/slash-menu.tsx`

- [ ] **Step 1: Update slashCommandSuggestion to accept projectId and replace Image command**

In `editor/slash-menu.tsx`, update the function signatures:

```typescript
function getDefaultItems(projectId?: string): SlashCommandItem[] {
```

```typescript
export function slashCommandSuggestion(projectId?: string) {
```

Update the items call in `slashCommandSuggestion`:

```typescript
    items: ({ query }: { query: string }) => {
      return getDefaultItems(projectId).filter(
```

In `editor/editor.tsx`, pass `projectId` to the slash command suggestion:

```typescript
      SlashCommand.configure({
        suggestion: slashCommandSuggestion(projectId),
      }),
```

- [ ] **Step 2: Replace the Image slash command**

Replace the existing Image item (lines 198-212) with:

```typescript
    {
      title: "Image",
      description: "Upload an image or insert from URL",
      icon: Image,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();

        if (projectId) {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            const formData = new FormData();
            formData.append("file", file);
            try {
              const res = await fetch(`/api/projects/${projectId}/media/upload`, {
                method: "POST",
                body: formData,
              });
              if (!res.ok) throw new Error("Upload failed");
              const { url } = await res.json();
              editor.chain().focus().setImage({ src: url }).run();
            } catch {
              const url = window.prompt("Upload failed. Enter image URL instead:");
              if (url) editor.chain().focus().setImage({ src: url }).run();
            }
          };
          input.click();
        } else {
          const url = window.prompt("Image URL:");
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }
      },
    },
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 4: Manual test**

Open editor, type `/Image`. File picker should open. Select an image — it should upload and insert.

- [ ] **Step 5: Commit**

```bash
git add editor/slash-menu.tsx editor/editor.tsx
git commit --no-gpg-sign -m "feat: update /Image slash command with file picker and URL fallback"
```

---

### Task 6: ProjectVideo TipTap extension

**Files:**
- Create: `editor/extensions/project-video.ts`

- [ ] **Step 1: Create the extension**

Create `editor/extensions/project-video.ts`:

```typescript
import { Node, mergeAttributes } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    projectVideo: {
      setProjectVideo: (attrs: { videoId: string; title: string }) => ReturnType;
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

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add editor/extensions/project-video.ts
git commit --no-gpg-sign -m "feat: add projectVideo TipTap node extension"
```

---

### Task 7: Video picker modal

**Files:**
- Create: `editor/video-picker.tsx`

- [ ] **Step 1: Create the video picker component**

Create `editor/video-picker.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Video } from "lucide-react";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Video</DialogTitle>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No videos in this project. Upload a video first.
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

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add editor/video-picker.tsx
git commit --no-gpg-sign -m "feat: add video picker modal for selecting project videos"
```

---

### Task 8: Integrate ProjectVideo extension + /Video slash command

**Files:**
- Modify: `editor/editor.tsx`
- Modify: `editor/slash-menu.tsx`

- [ ] **Step 1: Register ProjectVideo extension in Editor**

In `editor/editor.tsx`, add import:

```typescript
import { ProjectVideo } from "./extensions/project-video";
```

Add to the extensions array (after `Steps` and `Step`):

```typescript
      ProjectVideo,
```

Add imports to `editor/editor.tsx`:

```typescript
import { useState, useRef, useEffect } from "react";
import { VideoPicker } from "./video-picker";
```

Add state and ref for the video picker in the `Editor` component body:

```typescript
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const editorRef = useRef(editor);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
```

Pass the video picker opener to slash menu suggestion:

```typescript
      SlashCommand.configure({
        suggestion: slashCommandSuggestion(projectId, () => setVideoPickerOpen(true)),
      }),
```

Add the VideoPicker component in the JSX (inside the TooltipProvider, after the `</div>`):

```typescript
      {projectId && (
        <VideoPicker
          projectId={projectId}
          open={videoPickerOpen}
          onOpenChange={setVideoPickerOpen}
          onSelect={(video) => {
            editorRef.current
              ?.chain()
              .focus()
              .setProjectVideo({ videoId: video.id, title: video.title })
              .run();
          }}
        />
      )}
```

- [ ] **Step 2: Add /Video slash command**

In `editor/slash-menu.tsx`, update the function signatures to include `onOpenVideoPicker`:

```typescript
function getDefaultItems(projectId?: string, onOpenVideoPicker?: () => void): SlashCommandItem[] {
```

```typescript
export function slashCommandSuggestion(projectId?: string, onOpenVideoPicker?: () => void) {
```

Pass it through:

```typescript
      return getDefaultItems(projectId, onOpenVideoPicker).filter(
```

Add the Video import from lucide-react (update the existing import line):

```typescript
import {
  // ... existing imports ...
  Video,
  type LucideIcon,
} from "lucide-react";
```

Note: `Video` may conflict with the re-export name if `Image` is already imported from lucide. Check — `Image` is already imported on line 24, and `Video` is a separate icon. Add `Video` to the destructured imports.

Add the /Video item after the Image item in the `getDefaultItems` array:

```typescript
    ...(projectId && onOpenVideoPicker
      ? [
          {
            title: "Video",
            description: "Embed a project video",
            icon: Video,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
              editor.chain().focus().deleteRange(range).run();
              onOpenVideoPicker();
            },
          },
        ]
      : []),
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 4: Manual test**

Open editor, type `/Video`. Video picker modal should open. Select a video — a preview block (film icon + title) should appear in the editor.

- [ ] **Step 5: Commit**

```bash
git add editor/editor.tsx editor/slash-menu.tsx
git commit --no-gpg-sign -m "feat: integrate projectVideo extension and /Video slash command"
```

---

### Task 9: Render projectVideo in ArticleRenderer

**Files:**
- Modify: `components/docs/article-renderer.tsx`
- Modify: `app/(docs)/[projectSlug]/[articleSlug]/page.tsx`
- Modify: `components/docs/chapter-page.tsx`

- [ ] **Step 1: Add projectVideo case to ArticleRenderer**

In `components/docs/article-renderer.tsx`, the renderer needs to handle `projectVideo` nodes. Since signed URLs must be resolved server-side, pass a map of pre-resolved video URLs as a prop.

Update the interfaces:

```typescript
interface ArticleRendererProps {
  content: { type: string; content?: TiptapNode[] };
  onTimestampClick?: (seconds: number) => void;
  videoUrls?: Record<string, string>; // videoId -> signed URL
}
```

Update the `ArticleRenderer` component to pass `videoUrls` through:

```typescript
export function ArticleRenderer({
  content,
  onTimestampClick,
  videoUrls,
}: ArticleRendererProps) {
  if (!content.content) return null;

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      {content.content.map((node, i) => renderNode(node, i, onTimestampClick, videoUrls))}
    </div>
  );
}
```

Update `renderNode` signature to accept `videoUrls`:

```typescript
function renderNode(
  node: TiptapNode,
  index: number,
  onTimestampClick?: (seconds: number) => void,
  videoUrls?: Record<string, string>,
): React.ReactNode {
```

Pass `videoUrls` through all recursive `renderNode` calls (update every call site in the function).

Add the `projectVideo` case in the switch statement (before the `default` case):

```typescript
    case "projectVideo": {
      const videoId = node.attrs?.videoId as string;
      const title = (node.attrs?.title as string) || "Video";
      const src = videoUrls?.[videoId];
      if (!src) {
        return (
          <div key={index} className="rounded-lg border border-dashed p-4 my-4 text-sm text-muted-foreground">
            Video nicht verfügbar
          </div>
        );
      }
      return (
        <video key={index} controls className="w-full rounded-lg my-4" title={title}>
          <source src={src} />
          Your browser does not support the video tag.
        </video>
      );
    }
```

- [ ] **Step 2: Resolve video URLs in the article/chapter docs page**

In `app/(docs)/[projectSlug]/[articleSlug]/page.tsx`, add a helper function to extract projectVideo node IDs from content JSON and resolve their signed URLs:

```typescript
async function resolveVideoUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contentJson: Record<string, unknown>
): Promise<Record<string, string>> {
  const videoIds = new Set<string>();

  function walk(nodes: unknown[]) {
    for (const node of nodes) {
      const n = node as Record<string, unknown>;
      if (n.type === "projectVideo" && n.attrs) {
        const attrs = n.attrs as Record<string, unknown>;
        if (attrs.videoId) videoIds.add(attrs.videoId as string);
      }
      if (Array.isArray(n.content)) walk(n.content);
    }
  }

  const content = contentJson.content;
  if (Array.isArray(content)) walk(content);
  if (videoIds.size === 0) return {};

  const { data: videos } = await supabase
    .from("videos")
    .select("id, storage_path")
    .in("id", Array.from(videoIds))
    .eq("status", "ready");

  const urls: Record<string, string> = {};
  for (const video of videos ?? []) {
    if (video.storage_path) {
      const { data } = await supabase.storage
        .from("videos")
        .createSignedUrl(video.storage_path, 3600);
      if (data?.signedUrl) urls[video.id] = data.signedUrl;
    }
  }
  return urls;
}
```

Call it for article rendering (after the `videoUrl` resolution, before the return):

```typescript
    const embeddedVideoUrls = await resolveVideoUrls(supabase, article.content_json);
```

Pass it to `ArticleWithVideo`:

Update `ArticleWithVideo` to accept and forward `videoUrls`:

In `app/(docs)/[projectSlug]/[articleSlug]/article-with-video.tsx`, add `videoUrls` prop:

```typescript
interface ArticleWithVideoProps {
  title: string;
  description?: string;
  content: any;
  videoUrl: string | null;
  videoUrls?: Record<string, string>;
}
```

Pass it through to ArticleRenderer:

```typescript
      <ArticleRenderer
        content={content}
        onTimestampClick={handleTimestampClick}
        videoUrls={videoUrls}
      />
```

In the page, pass it:

```typescript
          <ArticleWithVideo
            title={article.title}
            description={article.description}
            content={article.content_json}
            videoUrl={videoUrl}
            videoUrls={embeddedVideoUrls}
          />
```

For chapters, do the same in the chapter rendering section:

```typescript
  // Before the chapter return:
  const chapterContentJson = chapter.translations?.[lang]?.content_json ?? chapter.content_json;
  const chapterVideoUrls = chapterContentJson
    ? await resolveVideoUrls(supabase, chapterContentJson as Record<string, unknown>)
    : {};
```

In `components/docs/chapter-page.tsx`, add `videoUrls?: Record<string, string>` to the component's props interface (alongside the existing `projectName`, `projectSlug`, `chapterTitle`, etc. props).

Pass it to ArticleRenderer:

```typescript
        <ArticleRenderer content={contentJson} videoUrls={videoUrls} />
```

Update the ChapterPage call in page.tsx to include `videoUrls={chapterVideoUrls}`.

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add components/docs/article-renderer.tsx \
  app/\(docs\)/\[projectSlug\]/\[articleSlug\]/page.tsx \
  app/\(docs\)/\[projectSlug\]/\[articleSlug\]/article-with-video.tsx \
  components/docs/chapter-page.tsx
git commit --no-gpg-sign -m "feat: render embedded project videos in docs pages"
```

---

### Task 10: Markdown API support for project videos

**Files:**
- Modify: `lib/ai/markdown-to-tiptap.ts`

- [ ] **Step 1: Add project-video syntax as a block-level custom block**

In `lib/ai/markdown-to-tiptap.ts`, handle `[project-video:{uuid}]` at the block level in `extractCustomBlocks`, since project videos are block-level elements (not inline). Add this regex replacement in `extractCustomBlocks`, after the details replacement (around line 282):

```typescript
  // Project video: [project-video:{uuid}]
  cleaned = cleaned.replace(
    /^\[project-video:([0-9a-f-]{36})\]\s*$/gm,
    (_, videoId: string) => {
      const idx = customBlocks.length;
      customBlocks.push({
        type: "projectVideo",
        attrs: { videoId },
      });
      return `\n\n<!--CB:${idx}-->\n\n`;
    }
  );
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/markdown-to-tiptap.ts
git commit --no-gpg-sign -m "feat: add [project-video:{uuid}] syntax to markdown-to-tiptap parser"
```

---

### Task 11: End-to-end verification

- [ ] **Step 1: Start dev server and test all flows**

```bash
pnpm dev
```

Test checklist:
1. Open an article editor → drag an image into it → image uploads and appears
2. Paste a screenshot (Cmd+V) → image uploads and appears
3. Type `/Image` → file picker opens → select image → uploads and appears
4. Type `/Video` → picker modal opens → shows project videos → select one → preview block appears
5. Save the article → reload → both image and video embed are persisted
6. View the published article on docs side → image renders, embedded video plays
7. Open a chapter editor → same image upload flows work
8. Test URL fallback: disconnect network → try `/Image` → upload fails → URL prompt appears

- [ ] **Step 2: Verify TypeScript compilation is clean**

```bash
npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 3: Verify build succeeds**

```bash
pnpm build 2>&1 | tail -20
```

Expected: Build completes without errors.
