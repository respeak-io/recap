import { chromium, type Browser } from "playwright";
import { mkdir, rename, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import yaml from "js-yaml";
import { PlanSchema, type Plan, type RecordingManifest } from "../analyze/plan-schema.js";
import { initAI } from "../ai/gemini.js";
import { recordFeature, type FeatureRecordingResult } from "./browser-session.js";

export interface RecordOptions {
  planPath: string;
  apiKey: string;
  model?: string;
  concurrency?: number;
  onProgress?: (message: string) => void;
}

export async function recordFeatures(options: RecordOptions): Promise<RecordingManifest> {
  const { planPath, apiKey, model = "gemini-2.5-flash", onProgress = () => {} } = options;

  // Load and validate plan
  const planContent = await readFile(planPath, "utf-8");
  const rawPlan = yaml.load(planContent);
  const plan = PlanSchema.parse(rawPlan);

  const concurrency = options.concurrency ?? plan.recording.max_concurrent;

  initAI(apiKey);

  // Create output directories
  const videoDir = resolve(plan.output.video_dir);
  const screenshotDir = join(videoDir, "screenshots");
  await mkdir(videoDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  // Temp dir for Playwright's raw video output
  const tempVideoDir = join(tmpdir(), `reeldocs-video-${randomUUID()}`);
  await mkdir(tempVideoDir, { recursive: true });

  // Run setup script if configured
  if (plan.app.auth.setup_script) {
    onProgress(`Running setup script: ${plan.app.auth.setup_script}`);
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("npx", ["tsx", plan.app.auth.setup_script], { timeout: 60000 });
  }

  onProgress(`Recording ${plan.features.length} features (concurrency: ${concurrency})...`);

  // Launch browser
  const browser: Browser = await chromium.launch({ headless: true });

  // Record features with concurrency limit
  const results: FeatureRecordingResult[] = [];
  const queue = [...plan.features];

  async function worker() {
    while (queue.length > 0) {
      const feature = queue.shift()!;
      onProgress(`Recording: ${feature.title}`);
      const result = await recordFeature(
        browser,
        feature,
        plan,
        screenshotDir,
        tempVideoDir,
        model,
        onProgress
      );

      // Move video to final location
      if (result.videoPath) {
        const finalPath = join(videoDir, `${feature.id}.webm`);
        await rename(result.videoPath, finalPath).catch(() => {});
        result.videoPath = finalPath;
      }

      results.push(result);

      if (result.status === "success") {
        onProgress(`  ✓ ${feature.title}`);
      } else {
        onProgress(`  ✗ ${feature.title}: ${result.error}`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  await browser.close();

  // Build manifest
  const manifest: RecordingManifest = {
    version: 1,
    recorded_at: new Date().toISOString(),
    features: Object.fromEntries(
      results.map((r) => [
        r.featureId,
        {
          video_path: r.videoPath,
          status: r.status,
          steps: r.steps,
          duration_ms: r.durationMs,
          ...(r.error && { error: r.error }),
          ...(r.errorScreenshot && { error_screenshot: r.errorScreenshot }),
        },
      ])
    ),
  };

  // Write manifest
  const manifestPath = join(videoDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  onProgress(`Manifest written to ${manifestPath}`);

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  onProgress(`Done: ${succeeded} succeeded, ${failed} failed`);

  return manifest;
}
