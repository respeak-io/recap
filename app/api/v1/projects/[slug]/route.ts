import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";

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
    .select("id, name, slug, subtitle, is_public, chapters(id, title, description, slug, group, order, translations, articles(id, title, description, slug, language, status, order))")
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
