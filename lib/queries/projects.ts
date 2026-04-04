import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function getUserOrg(client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  return membership?.org_id;
}

export async function getProjects(client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const orgId = await getUserOrg(supabase);

  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getProject(slug: string, client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

export async function createProject(name: string, slug: string, client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const orgId = await getUserOrg(supabase);

  const { data, error } = await supabase
    .from("projects")
    .insert({ org_id: orgId, name, slug })
    .select()
    .single();

  if (error) throw error;
  return data;
}
