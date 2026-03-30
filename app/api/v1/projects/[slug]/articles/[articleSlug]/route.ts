import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";
import { markdownToTiptapRaw } from "@/lib/ai/markdown-to-tiptap";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; articleSlug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, articleSlug } = await params;
  const db = createServiceClient();
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") || "en";

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.status !== undefined) updates.status = body.status;
  if (body.language !== undefined) updates.language = body.language;

  if (body.content !== undefined) {
    const { doc, text } = markdownToTiptapRaw(body.content);
    updates.content_json = doc;
    updates.content_text = text;
  }

  if (body.chapter_slug !== undefined) {
    if (body.chapter_slug === null) {
      updates.chapter_id = null;
    } else {
      const { data: chapter } = await db
        .from("chapters")
        .select("id")
        .eq("project_id", project.id)
        .eq("slug", body.chapter_slug)
        .single();
      if (!chapter) return apiError("Chapter not found", "NOT_FOUND", 404);
      updates.chapter_id = chapter.id;
    }
  }

  if (Object.keys(updates).length === 0) {
    return apiError("No fields to update", "VALIDATION_ERROR", 422);
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("articles")
    .update(updates)
    .eq("project_id", project.id)
    .eq("slug", articleSlug)
    .eq("language", lang)
    .select("id, title, slug, language, status, order")
    .single();

  if (error) {
    if (error.code === "23505") return apiError("Slug already exists", "CONFLICT", 409);
    return apiError(error.message, "INTERNAL", 500);
  }
  if (!data) return apiError("Article not found", "NOT_FOUND", 404);

  return Response.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; articleSlug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug, articleSlug } = await params;
  const db = createServiceClient();
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang");

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  let query = db
    .from("articles")
    .delete()
    .eq("project_id", project.id)
    .eq("slug", articleSlug);

  if (lang) {
    query = query.eq("language", lang);
  }

  const { error } = await query;
  if (error) return apiError(error.message, "INTERNAL", 500);

  return new Response(null, { status: 204 });
}
