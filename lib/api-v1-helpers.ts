import { SupabaseClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/api-key-auth";
import slugify from "slugify";

export async function resolveProject(
  db: SupabaseClient,
  orgId: string,
  slug: string
): Promise<{ id: string } | Response> {
  const { data } = await db
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .eq("org_id", orgId)
    .single();

  if (!data) return apiError("Project not found", "NOT_FOUND", 404);
  return data;
}

export function toSlug(title: string): string {
  return slugify(title, { lower: true, strict: true });
}
