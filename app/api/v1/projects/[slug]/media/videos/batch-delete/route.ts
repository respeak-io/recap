import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";

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

  const body = await request.json();
  const ids: string[] = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError("ids must be a non-empty array", "VALIDATION_ERROR", 400);
  }

  const deleted: string[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const id of ids) {
    const { data: video } = await db
      .from("videos")
      .select("storage_path")
      .eq("id", id)
      .eq("project_id", project.id)
      .single();

    if (!video) {
      errors.push({ id, error: "Video not found" });
      continue;
    }

    await db.storage.from("videos").remove([video.storage_path]);

    const { error } = await db
      .from("videos")
      .delete()
      .eq("id", id)
      .eq("project_id", project.id);

    if (error) {
      errors.push({ id, error: error.message });
    } else {
      deleted.push(id);
    }
  }

  return Response.json({ deleted, errors });
}
