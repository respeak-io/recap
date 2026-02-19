"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveArticleAction(
  id: string,
  contentJsonStr: string,
  contentText: string
) {
  const contentJson = JSON.parse(contentJsonStr);
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

export async function batchTogglePublishAction(
  updates: { id: string; publish: boolean }[]
) {
  const supabase = await createClient();

  const toPublish = updates.filter((u) => u.publish).map((u) => u.id);
  const toUnpublish = updates.filter((u) => !u.publish).map((u) => u.id);

  if (toPublish.length > 0) {
    await supabase
      .from("articles")
      .update({ status: "published" })
      .in("id", toPublish);
  }

  if (toUnpublish.length > 0) {
    await supabase
      .from("articles")
      .update({ status: "draft" })
      .in("id", toUnpublish);
  }

  revalidatePath("/");
}
