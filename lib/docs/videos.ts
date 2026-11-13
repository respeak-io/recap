import { createClient } from "@/lib/supabase/server";

/**
 * Signed video URLs for a docs page.
 *
 * Deliberately NOT cached: signed URLs expire after an hour. Runs per request
 * on the visitor's session client, so RLS decides visibility (anonymous readers
 * see ready videos of public projects, see the `public_videos` migration).
 * Two round trips at most: one `videos` lookup, one batch signing call.
 */

const SIGNED_URL_TTL_SECONDS = 3600;

// Ids come from article content and are interpolated into a PostgREST `or`
// filter: anything that is not a UUID would break the whole lookup (and with
// it the article's own video) or alter the filter.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

interface VideoRefs {
  videoIds: Set<string>;
  videoGroupIds: Set<string>;
}

function collectVideoRefs(contentJson: Record<string, unknown> | null | undefined): VideoRefs {
  const refs: VideoRefs = { videoIds: new Set(), videoGroupIds: new Set() };
  function walk(nodes: unknown[]) {
    for (const node of nodes) {
      const n = node as Record<string, unknown>;
      if (n.type === "projectVideo" && n.attrs) {
        const attrs = n.attrs as Record<string, unknown>;
        if (attrs.videoGroupId) {
          if (isUuid(attrs.videoGroupId)) refs.videoGroupIds.add(attrs.videoGroupId);
        } else if (isUuid(attrs.videoId)) {
          refs.videoIds.add(attrs.videoId);
        }
      }
      if (Array.isArray(n.content)) walk(n.content);
    }
  }
  const content = contentJson?.content;
  if (Array.isArray(content)) walk(content);
  return refs;
}

interface VideoRow {
  id: string;
  video_group_id: string | null;
  language: string | null;
  storage_path: string | null;
  status: string;
  created_at: string;
}

/**
 * @returns `primaryUrl` for the article's own video (`articles.video_id`) and
 *   `embeddedUrls` keyed by legacy video id or video group id for `projectVideo`
 *   nodes in the content (group variants resolved requested language → project
 *   default → oldest).
 */
export async function resolveDocsVideoUrls(opts: {
  contentJson: Record<string, unknown> | null | undefined;
  primaryVideoId?: string | null;
  language: string;
  projectDefaultLanguage: string;
}): Promise<{ primaryUrl: string | null; embeddedUrls: Record<string, string> }> {
  const { videoIds, videoGroupIds } = collectVideoRefs(opts.contentJson);
  const ids = new Set(videoIds);
  if (isUuid(opts.primaryVideoId)) ids.add(opts.primaryVideoId);

  if (ids.size === 0 && videoGroupIds.size === 0) {
    return { primaryUrl: null, embeddedUrls: {} };
  }

  const supabase = await createClient();

  const filters: string[] = [];
  if (ids.size > 0) filters.push(`id.in.(${[...ids].join(",")})`);
  if (videoGroupIds.size > 0) filters.push(`video_group_id.in.(${[...videoGroupIds].join(",")})`);

  const { data: rows, error } = await supabase
    .from("videos")
    .select("id, video_group_id, language, storage_path, status, created_at")
    .or(filters.join(","));
  if (error) console.error("[docs/videos] video lookup failed:", error.message);

  const all = (rows ?? []) as VideoRow[];
  // Embedded videos only resolve once processing finished; the article's own
  // video is shown whatever its status (unchanged from the previous behaviour).
  const videos = all.filter((v) => v.status === "ready");

  // key (video id or group id) -> storage path to sign
  const wanted = new Map<string, string>();

  const primaryPath =
    all.find((v) => v.id === opts.primaryVideoId)?.storage_path ?? null;
  for (const v of videos) {
    if (v.storage_path && videoIds.has(v.id)) wanted.set(v.id, v.storage_path);
  }

  for (const groupId of videoGroupIds) {
    const variants = videos.filter((v) => v.video_group_id === groupId);
    if (variants.length === 0) continue;
    const match =
      variants.find((v) => v.language === opts.language) ??
      variants.find((v) => v.language === opts.projectDefaultLanguage) ??
      [...variants].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )[0];
    if (match?.storage_path) wanted.set(groupId, match.storage_path);
  }

  const paths = [...new Set([...wanted.values(), ...(primaryPath ? [primaryPath] : [])])];
  if (paths.length === 0) return { primaryUrl: null, embeddedUrls: {} };

  const { data: signed } = await supabase.storage
    .from("videos")
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  const urlByPath = new Map<string, string>();
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl && !s.error) urlByPath.set(s.path, s.signedUrl);
  }

  const embeddedUrls: Record<string, string> = {};
  for (const [key, path] of wanted) {
    const url = urlByPath.get(path);
    if (url) embeddedUrls[key] = url;
  }

  return {
    primaryUrl: primaryPath ? urlByPath.get(primaryPath) ?? null : null,
    embeddedUrls,
  };
}
