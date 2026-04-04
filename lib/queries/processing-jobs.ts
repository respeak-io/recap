import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function getActiveJobs(projectId: string, client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("processing_jobs")
    .select("*, videos(title)")
    .eq("project_id", projectId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getRecentJobs(projectId: string, limit = 5, client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("processing_jobs")
    .select("*, videos(title)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}
