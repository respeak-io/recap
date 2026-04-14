import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";
import { markdownToTiptapRaw } from "@/lib/ai/markdown-to-tiptap";
import { validateKeywords } from "@/lib/keywords";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; chapterSlug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, chapterSlug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const { data, error } = await db
    .from("chapters")
    .select("*, articles(id, title, description, slug, language, status, \"order\")")
    .eq("project_id", project.id)
    .eq("slug", chapterSlug)
    .single();

  if (error || !data) return apiError("Chapter not found", "NOT_FOUND", 404);

  const articles = (data.articles ?? []).sort(
    (a: { order: number }, b: { order: number }) => a.order - b.order
  );

  return Response.json({ ...data, articles });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; chapterSlug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, chapterSlug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.group !== undefined) updates.group = body.group;
  if (body.order !== undefined) updates.order = body.order;
  if (body.translations !== undefined) updates.translations = body.translations;
  if (body.keywords !== undefined) {
    const result = validateKeywords(body.keywords);
    if (!result.ok) return apiError(result.error, "VALIDATION_ERROR", 422);
    updates.keywords = result.value;
  }
  if (body.content !== undefined) updates.content_json = markdownToTiptapRaw(body.content).doc;
  if (body.content_json !== undefined) updates.content_json = body.content_json;

  if (Object.keys(updates).length === 0) {
    return apiError("No fields to update", "VALIDATION_ERROR", 422);
  }

  const { data, error } = await db
    .from("chapters")
    .update(updates)
    .eq("project_id", project.id)
    .eq("slug", chapterSlug)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return apiError("Slug already exists", "CONFLICT", 409);
    return apiError(error.message, "INTERNAL", 500);
  }
  if (!data) return apiError("Chapter not found", "NOT_FOUND", 404);

  return Response.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; chapterSlug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, chapterSlug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const { error } = await db
    .from("chapters")
    .delete()
    .eq("project_id", project.id)
    .eq("slug", chapterSlug);

  if (error) return apiError(error.message, "INTERNAL", 500);

  return new Response(null, { status: 204 });
}
