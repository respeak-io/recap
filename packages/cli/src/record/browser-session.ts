import { type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Plan, Feature, ManifestStep } from "../analyze/plan-schema.js";
import { translateAndExecute } from "./action-translator.js";

export interface FeatureRecordingResult {
  featureId: string;
  status: "success" | "failed";
  videoPath: string;
  steps: ManifestStep[];
  durationMs: number;
  error?: string;
  errorScreenshot?: string;
}

export async function recordFeature(
  browser: Browser,
  feature: Feature,
  plan: Plan,
  screenshotDir: string,
  tempVideoDir: string,
  model: string,
  onProgress?: (message: string) => void
): Promise<FeatureRecordingResult> {
  const log = onProgress ?? (() => {});
  const baseUrl = plan.app.url;
  const { width, height } = plan.app.viewport;

  const featureScreenshotDir = join(screenshotDir, feature.id);
  if (plan.output.screenshots) {
    await mkdir(featureScreenshotDir, { recursive: true });
  }

  const context: BrowserContext = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: tempVideoDir, size: { width, height } },
  });
  const page: Page = await context.newPage();

  const steps: ManifestStep[] = [];
  const recordingStart = Date.now();

  try {
    // Auth setup
    await performAuth(page, plan, model);

    // Execute each step
    for (let i = 0; i < feature.steps.length; i++) {
      const step = feature.steps[i];
      log(`  [${feature.id}] Step ${i + 1}/${feature.steps.length}: ${step.action}`);

      const stepStart = Date.now() - recordingStart;
      try {
        await translateAndExecute(page, step.action, baseUrl, model, step.timeout);
      } catch (err) {
        const errorScreenshotPath = join(featureScreenshotDir, `error-step-${i}.png`);
        await page.screenshot({ path: errorScreenshotPath }).catch(() => {});

        const elapsed = Date.now() - recordingStart;
        steps.push({ stepIndex: i, startedAt: stepStart, completedAt: elapsed });

        const videoPath = await getVideoPath(page);
        await context.close();

        return {
          featureId: feature.id,
          status: "failed",
          videoPath,
          steps,
          durationMs: elapsed,
          error: `Step ${i} failed: ${err instanceof Error ? err.message : String(err)}`,
          errorScreenshot: errorScreenshotPath,
        };
      }

      const stepComplete = Date.now() - recordingStart;

      let screenshotPath: string | undefined;
      if (plan.output.screenshots) {
        screenshotPath = join(featureScreenshotDir, `step-${i}.png`);
        await page.screenshot({ path: screenshotPath }).catch(() => {});
      }

      steps.push({
        stepIndex: i,
        startedAt: stepStart,
        completedAt: stepComplete,
        screenshot: screenshotPath,
      });

      if (step.pause > 0) {
        await page.waitForTimeout(step.pause);
      }
    }

    const durationMs = Date.now() - recordingStart;
    const videoPath = await getVideoPath(page);
    await context.close();

    return {
      featureId: feature.id,
      status: "success",
      videoPath,
      steps,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - recordingStart;
    let videoPath = "";
    try {
      videoPath = await getVideoPath(page);
    } catch {}
    await context.close().catch(() => {});

    return {
      featureId: feature.id,
      status: "failed",
      videoPath,
      steps,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function performAuth(page: Page, plan: Plan, model: string): Promise<void> {
  const { auth } = plan.app;
  const baseUrl = plan.app.url;

  switch (auth.strategy) {
    case "credentials":
      if (!auth.credentials) throw new Error("Credentials required for 'credentials' auth strategy");
      await page.goto(baseUrl + "/login", { waitUntil: "networkidle", timeout: 15000 }).catch(() => {
        return page.goto(baseUrl, { waitUntil: "networkidle", timeout: 15000 });
      });
      try {
        await page.getByLabel(/email/i).fill(auth.credentials.email, { timeout: 5000 });
        await page.getByLabel(/password/i).fill(auth.credentials.password, { timeout: 5000 });
        await page.getByRole("button", { name: /sign in|log in|login|submit/i }).click({ timeout: 5000 });
        await page.waitForURL("**/*", { timeout: 10000 });
      } catch {
        await translateAndExecute(page, `fill email field with '${auth.credentials.email}'`, baseUrl, model);
        await translateAndExecute(page, `fill password field with '${auth.credentials.password}'`, baseUrl, model);
        await translateAndExecute(page, "click the login or sign in button", baseUrl, model);
        await page.waitForURL("**/*", { timeout: 10000 });
      }
      break;

    case "cookie":
    case "script":
      // Handled by setup_script before recording session
      break;
  }
}

async function getVideoPath(page: Page): Promise<string> {
  const video = page.video();
  if (!video) return "";
  return await video.path();
}
