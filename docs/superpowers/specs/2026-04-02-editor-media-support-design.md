# Editor Media Support: Image Upload & Video Embed

**Date:** 2026-04-02  
**Status:** Approved  
**Scope:** Image upload in TipTap editor + project video embeds in content

## Overview

Add two media capabilities to the TipTap editor:

1. **Image Upload** — Upload images via drag & drop, clipboard paste, or file picker into the `assets` Supabase bucket. Replaces the current URL-only `/Image` slash command.
2. **Project Video Embed** — Embed project videos (from the `videos` bucket) inline in article/chapter content via a `/Video` slash command with a picker modal.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Image storage | Existing `assets` bucket, path `{projectId}/content/{uuid}.{ext}` | Already public with RLS policies; separate bucket is unnecessary overhead |
| Image insertion methods | Slash command + drag & drop + paste + URL fallback | Natural UX for all common workflows |
| Video sources | Own project videos only (no YouTube/Vimeo) | Matches current use case; external embeds can be added later |
| Video insertion | Slash command `/Video` with picker modal | Single entry point, clear UX |
| Max image size | 10MB | Generous for screenshots/diagrams, prevents accidental huge uploads |
| Approach | Official TipTap extensions where possible + shared upload hook | Minimizes custom code, leverages maintained ecosystem |
| Media tracking | No new DB tables; images in bucket only, videos use existing `videos` table | YAGNI — media library can be added later if needed |

## 1. Image Upload

### New Dependencies

- `@tiptap/extension-file-handler` — Official TipTap extension for drag & drop and clipboard paste events

### API Endpoint

**`POST /api/projects/[id]/media/upload`**

- Accepts: `FormData` with `file` field (image/*)
- Validates: file type (image/*), file size (max 10MB)
- Storage path: `{projectId}/content/{uuid}.{ext}`
- Bucket: `assets` (public)
- Returns: `{ url: string }` (public URL)
- Auth: Supabase session (dashboard context)

### Editor Integration

**FileHandler extension** configured on the editor with:
- `onDrop(editor, files, pos)` — filters for images, uploads, inserts at drop position
- `onPaste(editor, files, htmlContent)` — filters for images, uploads, inserts at cursor
- `allowedMimeTypes: ['image/*']`

**Slash command `/Image`** updated:
- Opens native file picker (instead of `window.prompt`)
- URL input as secondary option / fallback
- On file select: upload → insert image node

**Upload flow:**
1. User drops/pastes/picks image
2. Placeholder node with loading indicator inserted at position
3. File uploaded to `/api/projects/[id]/media/upload`
4. On success: placeholder replaced with `image` node (`{ type: "image", attrs: { src: publicUrl, alt: "" } }`)
5. On failure: placeholder removed, toast notification with error

### Upload Hook

**`useMediaUpload(projectId)`** — reusable hook for file upload to Supabase:
- `upload(file: File): Promise<string>` — uploads file, returns public URL
- `uploading: boolean` — loading state
- `error: string | null` — error state
- Handles FormData construction, API call, error handling

### Renderer

No changes needed — `ArticleRenderer` already renders `image` nodes as `<img>` tags. Existing images with external URLs remain compatible.

## 2. Project Video Embed

### Custom TipTap Extension: `projectVideo`

**Node definition:**
- Name: `projectVideo`
- Group: `block`
- Atom: `true` (not editable inline)
- Attributes: `videoId` (string, required), `title` (string, optional)
- Command: `setProjectVideo({ videoId, title })`
- HTML serialization: `<div data-project-video data-video-id="..." data-title="...">`

**Editor rendering (NodeView):**
- Non-playable preview block: video icon + title text
- Keeps editor lightweight (no video player in edit mode)
- Selected state styling (border highlight)

### Slash Command: `/Video`

- Opens a popover/modal within the editor
- Lists project videos with status `ready` (queried via Supabase client)
- Shows video title for each entry
- On selection: `editor.chain().setProjectVideo({ videoId, title }).run()`
- Empty state: "No videos in this project" with hint

### Data Source

Direct Supabase query in the modal component:
```sql
SELECT id, title FROM videos 
WHERE project_id = :projectId AND status = 'ready'
ORDER BY created_at DESC
```
No new API endpoint needed — editor runs in dashboard context with Supabase client access.

### ArticleRenderer

New case for `projectVideo` node type:
- Receives `videoId` from node attrs
- Fetches video record + signed URL for `storage_path`
- Renders using existing `<VideoPlayer>` component
- Fallback: "Video nicht verfügbar" message if video not found or deleted

### Markdown API Support

New syntax in `markdownToTiptapRaw`:
- Format: `[project-video:{videoId}]`
- Converts to: `{ type: "projectVideo", attrs: { videoId: "..." } }`
- Allows video embedding via the REST API

## 3. Edge Cases

**Upload failures (images):**
- Placeholder removed from editor
- Toast notification with error message
- No retry logic — user re-inserts

**Deleted videos:**
- ArticleRenderer: shows "Video nicht verfügbar" fallback (not a crash)
- Editor: node remains, shows "Video nicht gefunden" in preview block

**Backward compatibility:**
- Existing `image` nodes with external URLs continue to work unchanged
- No content migration needed
- `content_json` schema is additive (new node type, existing types unchanged)

## Files to Create/Modify

### New Files
- `editor/extensions/project-video.ts` — custom TipTap node extension
- `editor/video-picker-modal.tsx` — video selection modal for `/Video` command
- `app/api/projects/[id]/media/upload/route.ts` — image upload endpoint
- `hooks/use-media-upload.ts` — reusable upload hook

### Modified Files
- `editor/editor.tsx` — add FileHandler + projectVideo extensions
- `editor/slash-menu.tsx` — update `/Image` command, add `/Video` command
- `components/docs/article-renderer.tsx` — add `projectVideo` rendering case
- `lib/ai/markdown-to-tiptap.ts` — add `[project-video:...]` syntax support
- `package.json` — add `@tiptap/extension-file-handler`

## Out of Scope

- YouTube / Vimeo embeds (can be added later via `@tiptap/extension-youtube`)
- Media library UI (browse/manage uploaded images)
- Image optimization / resizing
- Video upload from within the editor (videos are uploaded separately in the dashboard)
- Image tracking in database (images live in bucket only)
