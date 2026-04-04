import { SupabaseClient } from "@supabase/supabase-js";

interface BatchDeleteResult {
  deleted: string[];
  errors: { id: string; error: string }[];
}

export async function batchDeleteMedia(
  db: SupabaseClient,
  table: "videos" | "images",
  bucket: string,
  projectId: string,
  ids: string[]
): Promise<BatchDeleteResult> {
  const deleted: string[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const id of ids) {
    const { data: row } = await db
      .from(table)
      .select("storage_path")
      .eq("id", id)
      .eq("project_id", projectId)
      .single();

    if (!row) {
      errors.push({ id, error: `${table === "videos" ? "Video" : "Image"} not found` });
      continue;
    }

    await db.storage.from(bucket).remove([row.storage_path]);

    const { error } = await db
      .from(table)
      .delete()
      .eq("id", id)
      .eq("project_id", projectId);

    if (error) {
      errors.push({ id, error: error.message });
    } else {
      deleted.push(id);
    }
  }

  return { deleted, errors };
}
