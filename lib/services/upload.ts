import { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  MAX_VIDEO_SIZE,
  MAX_IMAGE_SIZE,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_IMAGE_TYPES,
  VIDEO_MIME_TO_EXT,
} from "@/lib/constants";

export interface UploadResult {
  id: string;
  storagePath: string;
  publicUrl?: string;
}

export function validateVideoFile(
  file: File
): string | null {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type as (typeof ALLOWED_VIDEO_TYPES)[number])) {
    return "File must be a video (MP4, WebM, or MOV)";
  }
  if (file.size > MAX_VIDEO_SIZE) return "File too large (max 25MB)";
  return null;
}

export function validateImageFile(
  file: File
): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return "File must be an image (PNG, JPEG, GIF, WebP, SVG)";
  }
  if (file.size > MAX_IMAGE_SIZE) return "File too large (max 10MB)";
  return null;
}

export async function uploadVideo(
  db: SupabaseClient,
  projectId: string,
  file: File,
  language: string,
  videoGroupId?: string | null
): Promise<UploadResult> {
  const title = file.name.replace(/\.[^.]+$/, "") || "Untitled Video";
  const ext = VIDEO_MIME_TO_EXT[file.type] ?? "mp4";
  const storagePath = `${projectId}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await db.storage
    .from("videos")
    .upload(storagePath, file);

  if (uploadError) throw new Error(uploadError.message);

  const insertData: Record<string, unknown> = {
    project_id: projectId,
    title,
    storage_path: storagePath,
    status: "ready",
    language,
  };
  if (videoGroupId) insertData.video_group_id = videoGroupId;

  const { data: video, error: insertError } = await db
    .from("videos")
    .insert(insertData)
    .select("id, title, video_group_id")
    .single();

  if (insertError) {
    // Clean up uploaded file if DB insert fails
    await db.storage.from("videos").remove([storagePath]);
    throw new Error(insertError.message);
  }

  return {
    id: video.id,
    storagePath,
    publicUrl: undefined,
  };
}

export async function uploadImage(
  db: SupabaseClient,
  projectId: string,
  file: File
): Promise<UploadResult> {
  const ext = file.name.split(".").pop() ?? "png";
  const storagePath = `${projectId}/content/${randomUUID()}.${ext}`;

  const { error: uploadError } = await db.storage
    .from("assets")
    .upload(storagePath, file);

  if (uploadError) throw new Error(uploadError.message);

  const { data: row, error: insertError } = await db
    .from("images")
    .insert({
      project_id: projectId,
      storage_path: storagePath,
      filename: file.name,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);

  const { data: urlData } = db.storage
    .from("assets")
    .getPublicUrl(storagePath);

  return {
    id: row.id,
    storagePath,
    publicUrl: urlData.publicUrl,
  };
}
