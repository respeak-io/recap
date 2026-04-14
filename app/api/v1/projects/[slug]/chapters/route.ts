import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject, toSlug } from "@/lib/api-v1-helpers";
import { markdownToTiptapRaw } from "@/lib/ai/markdown-to-tiptap";
import { validateKeywords } from "@/lib/keywords";

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

  const chapterSlug = body.slug || toSlug(body.title);

  let order = body.order;
  if (order === undefined) {
    const { data: last } = await db
      .from("chapters")
      .select("order")
      .eq("project_id", project.id)
      .order("order", { ascending: false })
      .limit(1)
      .single();
    order = (last?.order ?? -1) + 1;
  }

  const contentJson = body.content ? markdownToTiptapRaw(body.content).doc : {};

  let keywords: string[] = [];
  if (body.keywords !== undefined) {
    const result = validateKeywords(body.keywords);
    if (!result.ok) return apiError(result.error, "VALIDATION_ERROR", 422);
    keywords = result.value;
  }

  const { data, error } = await db
    .from("chapters")
    .insert({
      project_id: project.id,
      title: body.title,
      description: body.description ?? "",
      content_json: contentJson,
      slug: chapterSlug,
      group: body.group ?? null,
      translations: body.translations ?? null,
      order,
      keywords,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return apiError("Chapter slug already exists", "CONFLICT", 409);
    return apiError(error.message, "INTERNAL", 500);
  }

  return Response.json(data, { status: 201 });
}
