import { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressReporter } from "./types";

export function createProgressReporter(
  db: SupabaseClient,
  jobId: string
): ProgressReporter {
  return {
    async update(fields) {
      await db.from("processing_jobs").update(fields).eq("id", jobId);
    },
  };
}
