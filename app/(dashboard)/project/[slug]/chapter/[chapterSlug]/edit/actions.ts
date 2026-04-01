"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveChapterAction(
  id: string,
  contentJsonStr: string,
  description?: string
) {
  const contentJson = JSON.parse(contentJsonStr);
  const supabase = await createClient();
  const updates: Record<string, unknown> = { content_json: contentJson };
  if (description !== undefined) updates.description = description;

  const { error } = await supabase
    .from("chapters")
    .update(updates)
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/");
}
