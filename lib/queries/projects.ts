import { cache } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isReservedDocsSlug } from "@/lib/docs-locale";

/*
 * Server-component helpers. Called without a `client`, they are memoised per
 * request with React `cache()`, so the dashboard layout, nested layouts and the
 * page share one auth check and one lookup each instead of repeating the same
 * Supabase round trips. Passing a `client` bypasses the memo (API routes, tests).
 */

/** The signed-in user for this request (verified with Supabase Auth), or `null`. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

async function fetchUserOrg(supabase: SupabaseClient, userId: string) {
  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .single();
  return membership?.org_id as string | undefined;
}

const getUserOrgCached = cache(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return fetchUserOrg(await createClient(), user.id);
});

export async function getUserOrg(client?: SupabaseClient) {
  if (!client) return getUserOrgCached();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return fetchUserOrg(client, user.id);
}

async function fetchProjects(supabase: SupabaseClient, orgId: string | undefined) {
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

const getProjectsCached = cache(async () =>
  fetchProjects(await createClient(), await getUserOrgCached()),
);

export async function getProjects(client?: SupabaseClient) {
  if (!client) return getProjectsCached();
  return fetchProjects(client, await getUserOrg(client));
}

async function fetchProject(supabase: SupabaseClient, slug: string) {
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

const getProjectCached = cache(async (slug: string) =>
  fetchProject(await createClient(), slug),
);

export async function getProject(slug: string, client?: SupabaseClient) {
  if (!client) return getProjectCached(slug);
  return fetchProject(client, slug);
}

export async function createProject(name: string, slug: string, client?: SupabaseClient) {
  if (isReservedDocsSlug(slug)) {
    throw new Error(`Project slug "${slug}" is reserved (a language code or route segment).`);
  }
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
