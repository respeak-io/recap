import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; imageId: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, imageId } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.alt_text !== undefined) updates.alt_text = body.alt_text;
  if (body.width !== undefined) updates.width = body.width;
  if (body.height !== undefined) updates.height = body.height;

  if (Object.keys(updates).length === 0) {
    return apiError("No valid fields to update (supported: alt_text, width, height)", "VALIDATION_ERROR", 400);
  }

  const { data, error } = await db
    .from("images")
    .update(updates)
    .eq("id", imageId)
    .eq("project_id", project.id)
    .select("id, storage_path, filename, alt_text, width, height, created_at")
    .single();

  if (error) return apiError(error.message, "INTERNAL", 500);
  if (!data) return apiError("Image not found", "NOT_FOUND", 404);

  const { data: urlData } = db.storage.from("assets").getPublicUrl(data.storage_path);

  return Response.json({
    id: data.id,
    url: urlData.publicUrl,
    filename: data.filename,
    alt_text: data.alt_text,
    width: data.width,
    height: data.height,
    created_at: data.created_at,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; imageId: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, imageId } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const { data: image } = await db
    .from("images")
    .select("storage_path")
    .eq("id", imageId)
    .eq("project_id", project.id)
    .single();

  if (!image) return apiError("Image not found", "NOT_FOUND", 404);

  await db.storage.from("assets").remove([image.storage_path]);

  const { error } = await db
    .from("images")
    .delete()
    .eq("id", imageId)
    .eq("project_id", project.id);

  if (error) return apiError(error.message, "INTERNAL", 500);

  return new Response(null, { status: 204 });
}
