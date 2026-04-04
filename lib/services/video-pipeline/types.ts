import { SupabaseClient } from "@supabase/supabase-js";

export interface Segment {
  start_time: number;
  end_time: number;
  spoken_content: string;
  visual_context: string;
}

export interface ArticleData {
  chapterId: string | null;
  title: string;
  slug: string;
  contentJson: Record<string, unknown>;
  contentText: string;
}

export interface PipelineContext {
  db: SupabaseClient;
  videoId: string;
  projectId: string;
  languages: string[];
  // Accumulated state
  segments?: Segment[];
  vtt?: string;
  vttLanguages?: Record<string, string>;
  articles?: ArticleData[];
}

export interface ProgressReporter {
  update(fields: {
    step: string;
    step_message: string;
    progress: number;
    status?: string;
  }): Promise<void>;
}

export type PipelineStep = (
  ctx: PipelineContext,
  progress: ProgressReporter
) => Promise<PipelineContext>;
