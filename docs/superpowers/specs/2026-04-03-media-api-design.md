# Media API Design

**Date:** 2026-04-03
**Status:** Approved

## Goal

Expose media upload, listing, metadata updates, deletion, and batch operations through the v1 API so that API consumers (agents, CI pipelines) can manage images and videos, then reference them in article Markdown content.

## Workflow

Two-step process:
1. Agent uploads media via dedicated endpoints, receives URL (images) or videoId (videos)
2. Agent creates/updates article with Markdown referencing the media: `![alt](url)` for images, `[project-video:{videoId}]` for videos

## Endpoints

All endpoints use `validateApiKey` auth middleware and org-scoped project resolution (same as existing v1 routes).

---

### Images

#### POST /api/v1/projects/:slug/media/images

Upload one or more images to the project.

**Request:** `multipart/form-data`
- `file` (required) — one or more image files (PNG, JPEG, GIF, WebP, SVG; max 10MB each)

**Single file response:** `201 Created`
```json
{
  "imageId": "uuid",
  "url": "https://...supabase.co/storage/v1/object/public/assets/{project_id}/content/{uuid}.{ext}",
  "filename": "original-name.png"
}
```

**Multiple files response:** `201 Created`
```json
{
  "images": [
    { "imageId": "uuid", "url": "https://...", "filename": "photo1.png" },
    { "imageId": "uuid", "url": "https://...", "filename": "photo2.jpg" }
  ]
}
```

When multiple files are sent, each is uploaded independently. If some fail, the response includes both `images` (successes) and `errors` (failures):
```json
{
  "images": [ ... ],
  "errors": [
    { "filename": "bad.exe", "error": "File must be an image" }
  ]
}
```

**Errors:** `400` no files / all invalid, `401` bad API key, `404` project not found

#### GET /api/v1/projects/:slug/media/images

List all images in the project, ordered by `created_at` descending.

**Response:** `200 OK`
```json
{
  "images": [
    {
      "id": "uuid",
      "url": "https://...",
      "filename": "photo.png",
      "alt_text": "A photo",
      "width": 800,
      "height": 600,
      "created_at": "2026-04-03T12:00:00Z"
    }
  ]
}
```

#### PATCH /api/v1/projects/:slug/media/images/:imageId

Update image metadata.

**Request:** `application/json`
```json
{ "alt_text": "Updated description" }
```

**Response:** `200 OK` with updated image object.

**Errors:** `400` no valid fields, `404` image not found

#### DELETE /api/v1/projects/:slug/media/images/:imageId

Delete a single image (removes from storage and database).

**Response:** `204 No Content`

**Errors:** `404` image not found

#### POST /api/v1/projects/:slug/media/images/batch-delete

Delete multiple images in one request.

**Request:** `application/json`
```json
{ "ids": ["uuid-1", "uuid-2", "uuid-3"] }
```

**Response:** `200 OK`
```json
{
  "deleted": ["uuid-1", "uuid-2"],
  "errors": [
    { "id": "uuid-3", "error": "Image not found" }
  ]
}
```

---

### Videos

#### POST /api/v1/projects/:slug/media/videos

Upload one or more videos to the project.

**Request:** `multipart/form-data`
- `file` (required) — one or more video files (MP4, WebM, MOV; max 25MB each)
- `language` (optional) — ISO language code, defaults to "en" (applies to all files in the request)
- `videoGroupId` (optional) — UUID to group multilingual variants; auto-generated per file if omitted

**Single file response:** `201 Created`
```json
{
  "videoId": "uuid",
  "title": "filename-without-extension",
  "videoGroupId": "uuid"
}
```

**Multiple files response:** `201 Created`
```json
{
  "videos": [
    { "videoId": "uuid", "title": "demo", "videoGroupId": "uuid" },
    { "videoId": "uuid", "title": "intro", "videoGroupId": "uuid" }
  ]
}
```

Same partial-failure pattern as images — includes `errors` array when some uploads fail.

**Errors:** `400` no files / all invalid, `401` bad API key, `404` project not found

#### GET /api/v1/projects/:slug/media/videos

List all videos in the project, ordered by `created_at` descending.

**Response:** `200 OK`
```json
{
  "videos": [
    {
      "id": "uuid",
      "title": "Demo Video",
      "language": "en",
      "videoGroupId": "uuid",
      "status": "ready",
      "created_at": "2026-04-03T12:00:00Z"
    }
  ]
}
```

#### PATCH /api/v1/projects/:slug/media/videos/:videoId

Update video metadata.

**Request:** `application/json`
```json
{ "title": "Updated Title" }
```

**Response:** `200 OK` with updated video object.

**Errors:** `400` no valid fields, `404` video not found

#### DELETE /api/v1/projects/:slug/media/videos/:videoId

Delete a single video (removes from storage and database).

**Response:** `204 No Content`

**Errors:** `404` video not found

#### POST /api/v1/projects/:slug/media/videos/batch-delete

Delete multiple videos in one request.

**Request:** `application/json`
```json
{ "ids": ["uuid-1", "uuid-2"] }
```

**Response:** `200 OK`
```json
{
  "deleted": ["uuid-1"],
  "errors": [
    { "id": "uuid-2", "error": "Video not found" }
  ]
}
```

---

## Implementation

### New files

| File | Responsibility |
|------|---------------|
| `app/api/v1/projects/[slug]/media/images/route.ts` | POST (upload, single + bulk) + GET (list) |
| `app/api/v1/projects/[slug]/media/images/[imageId]/route.ts` | PATCH (metadata) + DELETE (single) |
| `app/api/v1/projects/[slug]/media/images/batch-delete/route.ts` | POST (batch delete) |
| `app/api/v1/projects/[slug]/media/videos/route.ts` | POST (upload, single + bulk) + GET (list) |
| `app/api/v1/projects/[slug]/media/videos/[videoId]/route.ts` | PATCH (metadata) + DELETE (single) |
| `app/api/v1/projects/[slug]/media/videos/batch-delete/route.ts` | POST (batch delete) |

### Shared pattern

All route files follow the same structure as existing v1 routes:
1. Call `validateApiKey(request)` to get `orgId`
2. Resolve project slug to project ID, scoped by org
3. Perform the operation
4. Return JSON response

The slug-to-project resolution and auth pattern is already in the article routes.

### Modified files

| File | Changes |
|------|---------|
| `docs/api.md` | Add Media section documenting all endpoints |
| `.claude/commands/docs-api.md` | Add media endpoints to the skill reference |

### Storage

- Images: `assets` bucket, path `{project_id}/content/{uuid}.{ext}` (matches internal route)
- Videos: `videos` bucket, path `{project_id}/{uuid}.{ext}` (matches internal route)
- Video DB rows created with `status: 'ready'`

### Delete behavior

- Storage file removed first, then DB row deleted
- Batch delete processes each item independently; partial success is possible
- Mirrors existing internal delete routes
