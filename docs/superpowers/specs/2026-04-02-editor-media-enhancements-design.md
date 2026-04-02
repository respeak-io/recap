# Editor Media Enhancements: Image Resize, Video Upload, Toolbar Icons

**Date:** 2026-04-02  
**Status:** Approved  
**Scope:** Image resize in editor + direct video upload + toolbar media buttons  
**Depends on:** `2026-04-02-editor-media-support-design.md` (image upload & video embed — already implemented)

## Overview

Three enhancements to the editor's media capabilities:

1. **Image Resizing** — Enable built-in TipTap drag-handle resizing on images, persist dimensions, render them in public docs.
2. **Direct Video Upload** — Upload video files directly from the editor (drag & drop, paste, file picker) without going through the "Upload & generate docs" pipeline. Creates a `videos` table entry and inserts a `projectVideo` node.
3. **Toolbar Icons** — Add Image and Video buttons to the editor toolbar for quick media insertion.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Image resize approach | Built-in `@tiptap/extension-image` resize config | Already installed at v3.19.0, no new dependencies |
| Aspect ratio | Always preserved | Prevents distorted images |
| Min image dimensions | 50×50px | Prevents accidentally shrinking to invisible |
| Video upload location | Directly in editor (not separate dashboard page) | Mirrors image upload UX, self-contained editor |
| Max video file size | 25MB | Supabase free tier storage constraint |
| Video title | Auto-derived from filename | Zero-friction; can be renamed later in media gallery |
| Video storage | `videos` bucket (existing) | Consistent with current video storage |
| Video DB entry | `videos` table with `status: 'ready'` | Reuses existing schema; no processing pipeline needed |
| Toolbar placement | New group after divider button | Natural position, doesn't clutter existing groups |

## 1. Image Resizing

### Editor Configuration

Update `Image` extension in `editor/editor.tsx`:

```typescript
Image.configure({
  resize: {
    enabled: true,
    alwaysPreserveAspectRatio: true,
    minWidth: 50,
    minHeight: 50,
  },
})
```

This enables drag handles on selected images. Width and height are automatically stored in the node's attrs (`{ type: "image", attrs: { src, alt, width, height } }`).

### Renderer Update

Update `components/docs/article-renderer.tsx` — the `image` case:
- Read `width` and `height` from node attrs
- When dimensions are set: render `<img>` with inline `width`/`height` style
- When no dimensions: render as before (responsive, full-width)

### Files to Modify

- `editor/editor.tsx` — Image extension config
- `components/docs/article-renderer.tsx` — respect width/height attrs

## 2. Direct Video Upload

### API Endpoint

**`POST /api/projects/[id]/media/upload-video`**

- Accepts: `FormData` with `file` field
- Validates: file type (`video/mp4`, `video/webm`, `video/quicktime`), file size (max 25MB)
- Storage path: `{projectId}/{uuid}.{ext}` in `videos` bucket
- Creates `videos` table row: `{ project_id, title, storage_path, status: 'ready' }`
- Title: derived from filename (minus extension)
- Returns: `{ videoId: string, title: string }`
- Auth: Supabase session (dashboard context)

### Upload Hook

**`useVideoUpload(projectId)`** — mirrors `useMediaUpload` pattern:
- `upload(file: File): Promise<{ videoId: string; title: string } | null>`
- `uploading: boolean`
- `error: string | null`
- Calls `POST /api/projects/[id]/media/upload-video`

### Editor Integration

**FileHandler extension** — extend existing config:
- Add video mime types to `allowedMimeTypes`: `video/mp4`, `video/webm`, `video/quicktime`
- `onDrop` / `onPaste`: detect file type → route to image upload or video upload accordingly
- On video upload success: insert `projectVideo` node with `{ videoId, title }`

**Upload flow (video):**
1. User drops/pastes video file
2. Placeholder with loading indicator inserted
3. File uploaded to `/api/projects/[id]/media/upload-video`
4. On success: placeholder replaced with `projectVideo` node
5. On failure: placeholder removed, toast notification

### Video Picker Update

**`editor/video-picker.tsx`** — add upload capability:
- Add "Upload video" button at the top of the modal
- Clicking opens native file picker for video files
- On file select: upload via endpoint → insert node → close modal
- Existing "pick from project videos" list remains below

### Slash Command Update

**`/Video`** command behavior unchanged — still opens the video picker modal. The modal itself now offers both upload and pick-existing.

### Files to Create

- `app/api/projects/[id]/media/upload-video/route.ts` — video upload endpoint
- `hooks/use-video-upload.ts` — video upload hook

### Files to Modify

- `editor/editor.tsx` — extend FileHandler for video mime types
- `editor/video-picker.tsx` — add upload button/flow

## 3. Toolbar Icons

### New Buttons

Add to `editor/toolbar.tsx`, after the horizontal-rule button, as a new group:

- **Image** (`ImageIcon` from Lucide) — opens native file picker for image upload. Same upload logic as `/Image` slash command. Falls back to URL prompt if no `projectId`.
- **Video** (`Video` from Lucide) — opens video picker modal (with upload option). Only shown when `projectId` is available.

### Props Update

`Toolbar` component receives additional props:
- `projectId?: string`
- `onImageUpload: (file: File) => void` — triggers image upload flow
- `onOpenVideoPicker: () => void` — opens video picker modal

These are provided by the parent `Editor` component which already has all the necessary state and callbacks.

### Files to Modify

- `editor/toolbar.tsx` — add Image and Video buttons, accept new props
- `editor/editor.tsx` — pass new props to Toolbar

## Edge Cases

**Video upload failures:**
- Placeholder removed from editor
- Toast notification with error message
- No retry — user re-inserts

**Oversized video files:**
- API returns 400 with "File too large (max 25MB)" message
- Toast shown to user

**Unsupported video formats:**
- API validates mime type, returns 400
- Toast shown to user

**Image resize persistence:**
- Width/height stored in `content_json` as node attrs
- Existing images without dimensions continue to render responsively (backward compatible)

## Out of Scope (deferred to Spec B: Media Gallery)

- Media gallery / asset browser UI
- Video internationalization (language-based swapping)
- Browsing/managing uploaded images
- Image tracking in database
