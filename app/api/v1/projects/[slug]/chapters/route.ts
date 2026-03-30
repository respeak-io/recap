import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject, toSlug } from "@/lib/api-v1-helpers";

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

  const { data, error } = await db
    .from("chapters")
    .insert({
      project_id: project.id,
      title: body.title,
      slug: chapterSlug,
      group: body.group ?? null,
      order,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return apiError("Chapter slug already exists", "CONFLICT", 409);
    return apiError(error.message, "INTERNAL", 500);
  }

  return Response.json(data, { status: 201 });
}
