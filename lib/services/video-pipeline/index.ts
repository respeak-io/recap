import type { PipelineContext, PipelineStep, ProgressReporter } from "./types";
import { extractSegments } from "./steps/extract-segments";
import { generateVtt } from "./steps/generate-vtt";
import { generateDocs } from "./steps/generate-docs";
import { translateArticles } from "./steps/translate-articles";
import { translateVtt } from "./steps/translate-vtt";

export type { PipelineContext, ProgressReporter };
export { createProgressReporter } from "./progress";

const PIPELINE_STEPS: { name: string; run: PipelineStep }[] = [
  { name: "extract-segments", run: extractSegments },
  { name: "generate-vtt", run: generateVtt },
  { name: "generate-docs", run: generateDocs },
  { name: "translate-articles", run: translateArticles },
  { name: "translate-vtt", run: translateVtt },
];

export async function runVideoPipeline(
  ctx: PipelineContext,
  progress: ProgressReporter
): Promise<void> {
  let current = ctx;
  for (const step of PIPELINE_STEPS) {
    current = await step.run(current, progress);
  }
}
