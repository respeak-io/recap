import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const { data: project } = await db
    .from("projects")
    .select("id, name, slug, subtitle, translations, is_public, chapters(id, title, description, keywords, slug, group, order, translations, articles(id, title, description, keywords, slug, language, status, order))")
    .eq("slug", slug)
    .eq("org_id", auth.orgId)
    .single();

  if (!project) return apiError("Project not found", "NOT_FOUND", 404);

  const chapters = (project.chapters ?? [])
    .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
    .map((ch: Record<string, unknown>) => ({
      ...ch,
      articles: ((ch.articles as { order: number }[]) ?? []).sort(
        (a: { order: number }, b: { order: number }) => a.order - b.order
      ),
    }));

  return Response.json({ ...project, chapters });
}

export async function PATCH(
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
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name;
  if (typeof body.subtitle === "string") update.subtitle = body.subtitle;
  if (body.translations !== undefined) update.translations = body.translations;

  if (Object.keys(update).length === 0) {
    return apiError("No valid fields to update", "VALIDATION_ERROR", 422);
  }

  const { error } = await db.from("projects").update(update).eq("id", project.id);
  if (error) return apiError(error.message, "INTERNAL", 500);

  return Response.json({ ok: true });
}
