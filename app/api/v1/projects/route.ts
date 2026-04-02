import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";

export async function GET(request: Request) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .select("id, name, slug, subtitle, translations, is_public")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, "INTERNAL", 500);

  return Response.json(data);
}
