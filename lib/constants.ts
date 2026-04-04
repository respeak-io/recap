// File upload limits
export const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25 MB
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_ASSET_SIZE = 2 * 1024 * 1024; // 2 MB

// Allowed MIME types
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

export const VIDEO_MIME_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

// UI timing
export const POLLING_INTERVAL_MS = 2000;
export const SEARCH_DEBOUNCE_MS = 300;
