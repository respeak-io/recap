import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject, toSlug } from "@/lib/api-v1-helpers";
import { markdownToTiptapRaw } from "@/lib/ai/markdown-to-tiptap";

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
  if (!body.title) return apiError("title is required", "VALIDATION_ERROR", 422);
  if (!body.content) return apiError("content is required", "VALIDATION_ERROR", 422);

  const articleSlug = body.slug || toSlug(body.title);
  const language = body.language || "en";
  const status = body.status || "draft";

  const { doc: contentJson, text: contentText } = markdownToTiptapRaw(body.content);

  let chapterId: string | null = null;
  if (body.chapter_slug) {
    const { data: chapter } = await db
      .from("chapters")
      .select("id")
      .eq("project_id", project.id)
      .eq("slug", body.chapter_slug)
      .single();
    if (!chapter) return apiError("Chapter not found", "NOT_FOUND", 404);
    chapterId = chapter.id;
  }

  const { data: last } = await db
    .from("articles")
    .select("order")
    .eq("project_id", project.id)
    .eq("chapter_id", chapterId)
    .order("order", { ascending: false })
    .limit(1)
    .single();
  const order = (last?.order ?? -1) + 1;

  const { data, error } = await db
    .from("articles")
    .insert({
      project_id: project.id,
      chapter_id: chapterId,
      title: body.title,
      slug: articleSlug,
      language,
      status,
      content_json: contentJson,
      content_text: contentText,
      order,
    })
    .select("id, title, slug, language, status, order")
    .single();

  if (error) {
    if (error.code === "23505") return apiError("Article slug already exists for this language", "CONFLICT", 409);
    return apiError(error.message, "INTERNAL", 500);
  }

  return Response.json(data, { status: 201 });
}
