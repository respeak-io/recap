"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveArticleAction(
  id: string,
  contentJson: Record<string, unknown>,
  contentText: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("articles")
    .update({ content_json: contentJson, content_text: contentText })
    .eq("id", id);

  if (error) throw error;
}

export async function togglePublishAction(id: string, publish: boolean) {
  const supabase = await createClient();
  await supabase
    .from("articles")
    .update({ status: publish ? "published" : "draft" })
    .eq("id", id);

  revalidatePath("/");
}
