import { createClient } from "@/lib/supabase/server";

export async function getProjectVideos(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("videos")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return data ?? [];
}
