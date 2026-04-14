"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateKeywords } from "@/lib/keywords";

export async function saveChapterAction(
  id: string,
  contentJsonStr: string,
  description?: string,
  keywords?: string[]
) {
  const contentJson = JSON.parse(contentJsonStr);
  const supabase = await createClient();
  const updates: Record<string, unknown> = { content_json: contentJson };
  if (description !== undefined) updates.description = description;
  if (keywords !== undefined) {
    const result = validateKeywords(keywords);
    if (!result.ok) throw new Error(result.error);
    updates.keywords = result.value;
  }

  const { error } = await supabase
    .from("chapters")
    .update(updates)
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/");
}
