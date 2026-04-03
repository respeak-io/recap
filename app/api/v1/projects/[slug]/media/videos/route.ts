import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MIME_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

interface UploadResult {
  videoId: string;
  title: string;
  videoGroupId: string;
}

interface UploadError {
  filename: string;
  error: string;
}

function validateVideoFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return "File must be a video (MP4, WebM, or MOV)";
  if (file.size > MAX_SIZE) return "File too large (max 25MB)";
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const formData = await request.formData();
  const files = formData.getAll("file") as File[];
  const language = (formData.get("language") as string) || "en";
  const videoGroupId = formData.get("videoGroupId") as string | null;

  if (files.length === 0) return apiError("Missing file", "VALIDATION_ERROR", 400);

  const results: UploadResult[] = [];
  const errors: UploadError[] = [];

  for (const file of files) {
    const validationError = validateVideoFile(file);
    if (validationError) {
      errors.push({ filename: file.name, error: validationError });
      continue;
    }

    const title = file.name.replace(/\.[^.]+$/, "") || "Untitled Video";
    const ext = MIME_TO_EXT[file.type] ?? "mp4";
    const storagePath = `${project.id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await db.storage
      .from("videos")
      .upload(storagePath, file);

    if (uploadError) {
      errors.push({ filename: file.name, error: uploadError.message });
      continue;
    }

    const insertData: Record<string, unknown> = {
      project_id: project.id,
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
      await db.storage.from("videos").remove([storagePath]);
      errors.push({ filename: file.name, error: insertError.message });
      continue;
    }

    results.push({
      videoId: video.id,
      title: video.title,
      videoGroupId: video.video_group_id,
    });
  }

  if (results.length === 0 && errors.length > 0) {
    return apiError(errors[0].error, "VALIDATION_ERROR", 400);
  }

  if (files.length === 1 && results.length === 1) {
    return Response.json(results[0], { status: 201 });
  }

  const body: Record<string, unknown> = { videos: results };
  if (errors.length > 0) body.errors = errors;
  return Response.json(body, { status: 201 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const { data, error } = await db
    .from("videos")
    .select("id, title, language, video_group_id, status, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, "INTERNAL", 500);

  const videos = (data ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    language: v.language,
    videoGroupId: v.video_group_id,
    status: v.status,
    created_at: v.created_at,
  }));

  return Response.json({ videos });
}
