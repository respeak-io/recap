# Media Gallery & Video Internationalization — Design Spec

## Overview

Add a project-level media gallery for browsing and managing uploaded images and videos, a unified editor media picker that replaces the existing `VideoPicker`, and video internationalization so that a single video embed can serve different recordings per language.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Image tracking | New `images` table (separate from `videos`) | Videos already have 6+ specific columns; unified table would be sparse or require migration |
| Video i18n model | `video_group_id` column on `videos` table | Normalized, no "primary" video, clean gallery queries |
| Usage tracking | On-demand JSONB scan | Always accurate, no write-time overhead, article/chapter count per project is small |
| Gallery location | Standalone page `/projects/[id]/media` | Central source of truth, "where used" needs a proper view |
| Editor picker | Unified `MediaPicker` replacing `VideoPicker` | One consistent flow, tabs for images/videos, browse gallery + upload inline |
| Old content compat | Support both `videoId` and `videoGroupId` attrs | No forced content migration, old nodes keep working |

---

## 1. Database Changes

### New `images` table

```sql
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
```

### Changes to `videos` table

```sql
alter table videos add column language text not null default 'en';
alter table videos add column video_group_id uuid not null default gen_random_uuid();
alter table videos add constraint uq_video_group_language unique (video_group_id, language);
```

**Migration behavior:** Each existing video gets a unique `video_group_id` (the `default gen_random_uuid()` handles this). Each becomes a single-variant group.

---

## 2. Video Internationalization

### Video group concept

- A "video group" is a set of `videos` rows sharing the same `video_group_id`.
- Each video in the group has a unique `language` (enforced by unique constraint `video_group_id, language`).
- No separate groups table. The group exists implicitly.

### Editor node change

- `projectVideo` TipTap node attrs: `{ videoGroupId, title }` (new) alongside `{ videoId, title }` (legacy).
- New inserts use `videoGroupId`. Old content with `videoId` continues to work.

### Rendering fallback chain

1. Look up video in group matching the reader's language.
2. Fallback: project's default language.
3. Fallback: any video in the group (oldest by `created_at`).

### Managing variants (in gallery)

- Video detail view shows all language variants in the group.
- "Add language variant": upload a new video, assign to the existing group with a selected language.
- "Remove variant": deletes that video row and storage file. If last variant, the group ceases to exist.

---

## 3. Image Tracking

### On upload

The existing image upload endpoint (`POST /api/projects/[id]/media/upload`) is updated to also insert a row into the `images` table with: `project_id`, `storage_path`, `filename`, `size_bytes`.

Width and height are not extracted server-side. Optional enhancement: capture client-side before upload.

### Existing untracked images

Images uploaded before this change have no DB row. They do not appear in the gallery. No bulk migration. If an editor re-uploads an image, it gets tracked from that point.

### Reference format

Images in `content_json` are referenced by URL (`src` attr on `image` nodes). This does not change. Usage tracking matches the storage path substring in content_json.

---

## 4. Gallery Page

### Route

`/projects/[id]/media` — new page under the existing project layout.

### Layout

- Tab bar: **Images** | **Videos**
- Upload button in header (contextual to active tab).

### Images tab

- Grid of thumbnails (lazy-loaded from public `assets` URLs).
- Each card: filename, dimensions (if known), upload date.
- Click card: detail panel with full preview, editable alt text, file size, "Used in" list.

### Videos tab

- Grid/list of video groups (not individual videos).
- Each group card: title, language badges (e.g., `EN` `DE`), upload date.
- Click group: detail view with video player, language variant list (add/remove), editable title, "Used in" list.

### "Used in" queries

- **Images:** Scan `articles.content_json` and `chapters.content_json` for the image's storage path as a substring.
- **Videos:** Scan for `videoGroupId` value in `projectVideo` nodes.
- Returns article/chapter titles as links.

### Deletion

- **Delete image:** Removes DB row + storage file. Shows warning if used in content (does not block).
- **Delete video variant:** Removes that language's video from the group. If last variant, group is gone. Same usage warning.

---

## 5. Unified Media Picker in Editor

### Replaces

The current `VideoPicker` component (`editor/video-picker.tsx`) is deleted.

### Trigger points

| Action | Opens picker on |
|--------|-----------------|
| Toolbar Image button | Images tab |
| Toolbar Video button | Videos tab |
| `/Image` slash command (new) | Images tab |
| `/Video` slash command | Videos tab |
| Drag & drop / paste | No picker — direct upload (unchanged) |

### Picker UI

- Dialog with two tabs: **Images** | **Videos**.
- Each tab: grid of existing assets from gallery data + upload button at top.
- Click image: inserts `image` node with URL from `images` table row.
- Click video group: inserts `projectVideo` node with `videoGroupId` and title.

### Changes from current flow

- Image insertion from toolbar currently opens a native file picker or URL prompt. Now opens the unified picker with gallery browse + upload.
- Video insertion now inserts `videoGroupId` instead of `videoId`.
- `/Image` slash command is new.

---

## 6. Edge Cases & Constraints

- **Storage limits:** Images 10MB, videos 25MB (unchanged).
- **No variant for reader's language:** Fallback chain (requested → project default → any oldest).
- **Old `projectVideo` nodes with `videoId`:** Renderer checks `videoId` first, uses directly. No forced migration.
- **Concurrent editors:** Gallery reads from DB, no local state conflicts.
- **Deletion while in use:** Warning shown, not blocked. Broken refs show placeholder in renderer.
- **Orphaned pre-tracking images:** Not in gallery, no automated cleanup.

---

## Out of Scope

- Bulk image migration (backfilling `images` rows for pre-existing uploads)
- Video transcoding or format conversion
- Image editing (crop, rotate) within the gallery
- Folder/tag organization for media assets
- Storage quota tracking or enforcement beyond per-file limits
