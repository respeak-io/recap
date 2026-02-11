import { createClient } from "@/lib/supabase/server";

export async function getUserOrg() {
  const supabase = await createClient();
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

export async function getProjects() {
  const supabase = await createClient();
  const orgId = await getUserOrg();

  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getProject(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

export async function createProject(name: string, slug: string) {
  const supabase = await createClient();
  const orgId = await getUserOrg();

  const { data, error } = await supabase
    .from("projects")
    .insert({ org_id: orgId, name, slug })
    .select()
    .single();

  if (error) throw error;
  return data;
}
