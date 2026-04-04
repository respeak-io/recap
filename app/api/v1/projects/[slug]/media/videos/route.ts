import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";
import {
  validateVideoFile,
  uploadVideo,
} from "@/lib/services/upload";

interface UploadResultV1 {
  videoId: string;
  title: string;
  videoGroupId: string;
}

interface UploadError {
  filename: string;
  error: string;
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

  const results: UploadResultV1[] = [];
  const errors: UploadError[] = [];

  for (const file of files) {
    const validationError = validateVideoFile(file);
    if (validationError) {
      errors.push({ filename: file.name, error: validationError });
      continue;
    }

    try {
      const result = await uploadVideo(db, project.id, file, language, videoGroupId);
      const { data: video } = await db
        .from("videos")
        .select("id, title, video_group_id")
        .eq("id", result.id)
        .single();

      results.push({
        videoId: video!.id,
        title: video!.title,
        videoGroupId: video!.video_group_id,
      });
    } catch (err) {
      errors.push({
        filename: file.name,
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
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
