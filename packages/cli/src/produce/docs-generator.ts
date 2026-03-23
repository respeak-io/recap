import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText } from "../ai/gemini.js";
import { getDocsPolishPrompt } from "../ai/prompts.js";
import { translateNarration } from "./translate.js";
import type { Plan, Feature, RecordingManifest } from "../analyze/plan-schema.js";

export interface RawDocInput {
  title: string;
  steps: Array<{
    action: string;
    narration: string;
    screenshot?: string;
  }>;
}

export function assembleRawDoc(input: RawDocInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}\n`);

  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i];
    lines.push(`${step.narration}\n`);
    if (step.screenshot) {
      lines.push(`![Step ${i + 1}](${step.screenshot})\n`);
    }
  }

  return lines.join("\n");
}

export async function generateDocs(
  plan: Plan,
  manifest: RecordingManifest,
  model: string = "gemini-2.5-flash",
  onProgress?: (message: string) => void
): Promise<string[]> {
  const log = onProgress ?? (() => {});
  const docsDir = plan.output.docs_dir;
  await mkdir(docsDir, { recursive: true });

  const writtenFiles: string[] = [];

  // Group features by category
  const categories = new Map<string, Feature[]>();
  for (const feature of plan.features) {
    const manifestEntry = manifest.features[feature.id];
    if (!manifestEntry || manifestEntry.status !== "success") continue;

    const cat = feature.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(feature);
  }

  for (const lang of plan.output.languages) {
    const langDir = plan.output.languages.length > 1 ? join(docsDir, lang) : docsDir;
    await mkdir(langDir, { recursive: true });

    for (const [_category, features] of categories) {
      for (const feature of features) {
        log(`Generating docs: ${feature.title} (${lang})`);
        const manifestEntry = manifest.features[feature.id];

        const stepsWithScreenshots = feature.steps.map((step, i) => ({
          action: step.action,
          narration: step.narration,
          screenshot: manifestEntry.steps[i]?.screenshot,
        }));

        // Polish with AI
        const polishPrompt = getDocsPolishPrompt(feature.title, stepsWithScreenshots);
        let polished = await generateText(polishPrompt, model);

        // Translate if non-English
        if (lang !== "en") {
          polished = await translateNarration(polished, lang, model);
        }

        // Write markdown file (use feature.id for uniqueness)
        const filename = `${feature.id}.md`;
        const filepath = join(langDir, filename);
        await writeFile(filepath, polished, "utf-8");
        writtenFiles.push(filepath);
      }
    }
  }

  return writtenFiles;
}
