import { writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import { initAI, generateJson } from "../ai/gemini.js";
import { getFeatureDiscoveryPrompt } from "../ai/prompts.js";
import { scanNextjs } from "./scanners/nextjs.js";
import { scanGeneric } from "./scanners/generic.js";
import { PlanSchema, type Plan } from "./plan-schema.js";
import type { CodebaseSummary } from "./scanners/nextjs.js";

export interface AnalyzeOptions {
  codebaseDir: string;
  appUrl: string;
  apiKey: string;
  model?: string;
  hints?: string;
  outputPath?: string;
  onProgress?: (message: string) => void;
}

export async function analyzeCodebase(options: AnalyzeOptions): Promise<Plan> {
  const {
    codebaseDir,
    appUrl,
    apiKey,
    model = "gemini-2.5-flash",
    hints,
    outputPath = "./plan.yaml",
    onProgress = () => {},
  } = options;

  initAI(apiKey);

  // Step 1: Scan the codebase
  onProgress("Scanning codebase...");
  let summary: CodebaseSummary | null = await scanNextjs(codebaseDir);
  if (!summary) {
    onProgress("No Next.js structure found, falling back to generic scan...");
    summary = await scanGeneric(codebaseDir);
  }

  if (summary.routes.length === 0) {
    throw new Error("No routes or pages found in the codebase. Check the --codebase path.");
  }

  onProgress(`Found ${summary.routes.length} routes (${summary.framework}). Asking AI to identify features...`);

  // Step 2: Send to Gemini for feature discovery
  const prompt = getFeatureDiscoveryPrompt(summary, hints);
  const aiResponse = await generateJson<{ features: unknown[] }>(prompt, model);

  // Step 3: Assemble and validate the plan
  const rawPlan = {
    version: 1 as const,
    app: {
      url: appUrl,
      auth: {
        strategy: "credentials" as const,
        credentials: { email: "", password: "" },
      },
      viewport: { width: 1280, height: 720 },
    },
    recording: { max_concurrent: 3 },
    features: aiResponse.features,
    output: {
      video_dir: "./generated/videos",
      docs_dir: "./generated/docs",
      languages: ["en"],
      tts: { provider: "google" as const, voice: "en-US-Studio-O", speed: 1.0 },
      screenshots: true,
    },
  };

  const plan = PlanSchema.parse(rawPlan);

  // Step 4: Write YAML
  const yamlContent = yaml.dump(plan, { lineWidth: 120, noRefs: true });
  await writeFile(outputPath, yamlContent, "utf-8");

  onProgress(`Plan written to ${outputPath}`);
  return plan;
}
