import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function getArticle(
  projectSlug: string,
  articleSlug: string,
  client?: SupabaseClient
) {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("articles")
    .select("*, projects!inner(*), videos(*)")
    .eq("projects.slug", projectSlug)
    .eq("slug", articleSlug)
    .single();

  return data;
}

export async function updateArticle(
  id: string,
  contentJson: Record<string, unknown>,
  contentText: string,
  client?: SupabaseClient
) {
  const supabase = client ?? (await createClient());
  const { error } = await supabase
    .from("articles")
    .update({ content_json: contentJson, content_text: contentText })
    .eq("id", id);

  if (error) throw error;
}

export async function publishArticle(id: string, client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  await supabase
    .from("articles")
    .update({ status: "published" })
    .eq("id", id);
}

export async function unpublishArticle(id: string, client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  await supabase.from("articles").update({ status: "draft" }).eq("id", id);
}

export async function deleteArticle(id: string, client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.from("articles").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteVideo(id: string, client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) throw error;
}
