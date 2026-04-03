import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; videoId: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, videoId } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  if (body.title === undefined) {
    return apiError("No valid fields to update (supported: title)", "VALIDATION_ERROR", 400);
  }

  const { data, error } = await db
    .from("videos")
    .update({ title: body.title })
    .eq("id", videoId)
    .eq("project_id", project.id)
    .select("id, title, language, video_group_id, status, created_at")
    .single();

  if (error) return apiError(error.message, "INTERNAL", 500);
  if (!data) return apiError("Video not found", "NOT_FOUND", 404);

  return Response.json({
    id: data.id,
    title: data.title,
    language: data.language,
    videoGroupId: data.video_group_id,
    status: data.status,
    created_at: data.created_at,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; videoId: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, videoId } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const { data: video } = await db
    .from("videos")
    .select("storage_path")
    .eq("id", videoId)
    .eq("project_id", project.id)
    .single();

  if (!video) return apiError("Video not found", "NOT_FOUND", 404);

  await db.storage.from("videos").remove([video.storage_path]);

  const { error } = await db
    .from("videos")
    .delete()
    .eq("id", videoId)
    .eq("project_id", project.id);

  if (error) return apiError(error.message, "INTERNAL", 500);

  return new Response(null, { status: 204 });
}
