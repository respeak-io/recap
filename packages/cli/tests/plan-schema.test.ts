import { describe, it, expect } from "vitest";
import {
  PlanSchema,
  RecordingManifestSchema,
  type RecordingManifest,
} from "../src/analyze/plan-schema.js";

describe("PlanSchema", () => {
  const validPlan = {
    version: 1 as const,
    app: {
      url: "http://localhost:3000",
      auth: {
        strategy: "credentials" as const,
        credentials: { email: "demo@test.com", password: "pass" },
      },
      viewport: { width: 1280, height: 720 },
    },
    recording: { max_concurrent: 3 },
    features: [
      {
        id: "create-project",
        title: "Creating a Project",
        category: "Getting Started",
        steps: [
          {
            action: "navigate to /dashboard",
            narration: "Open the dashboard.",
            pause: 2000,
          },
          {
            action: "click button 'New Project'",
            narration: "Click New Project.",
          },
        ],
      },
    ],
    output: {
      video_dir: "./generated/videos",
      docs_dir: "./generated/docs",
      languages: ["en"],
      tts: { provider: "google" as const, voice: "en-US-Studio-O", speed: 1.0 },
      screenshots: true,
    },
  };

  it("accepts a valid plan", () => {
    const result = PlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it("rejects plan with missing features", () => {
    const invalid = { ...validPlan, features: [] };
    const result = PlanSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("applies default timeout to steps", () => {
    const result = PlanSchema.parse(validPlan);
    expect(result.features[0].steps[0].timeout).toBe(10000);
  });

  it("applies default pause of 0 to steps", () => {
    const result = PlanSchema.parse(validPlan);
    expect(result.features[0].steps[1].pause).toBe(0);
  });

  it("rejects invalid auth strategy", () => {
    const invalid = {
      ...validPlan,
      app: {
        ...validPlan.app,
        auth: { ...validPlan.app.auth, strategy: "invalid" },
      },
    };
    const result = PlanSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid TTS provider", () => {
    const invalid = {
      ...validPlan,
      output: {
        ...validPlan.output,
        tts: { ...validPlan.output.tts, provider: "invalid" },
      },
    };
    const result = PlanSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("allows optional setup_script", () => {
    const withScript = {
      ...validPlan,
      app: {
        ...validPlan.app,
        auth: { ...validPlan.app.auth, setup_script: "./seed.ts" },
      },
    };
    const result = PlanSchema.safeParse(withScript);
    expect(result.success).toBe(true);
  });
});

describe("RecordingManifestSchema", () => {
  const validManifest: RecordingManifest = {
    version: 1,
    recorded_at: "2026-03-23T14:30:00Z",
    features: {
      "create-project": {
        video_path: "./generated/videos/create-project.webm",
        status: "success",
        steps: [
          { stepIndex: 0, startedAt: 0, completedAt: 1200, screenshot: "step-0.png" },
        ],
        duration_ms: 1200,
      },
    },
  };

  it("accepts a valid manifest", () => {
    const result = RecordingManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it("accepts failed features with error info", () => {
    const withFailure: RecordingManifest = {
      ...validManifest,
      features: {
        "broken-feature": {
          video_path: "./generated/videos/broken.webm",
          status: "failed",
          error: "Element not found",
          error_screenshot: "error.png",
          steps: [],
          duration_ms: 0,
        },
      },
    };
    const result = RecordingManifestSchema.safeParse(withFailure);
    expect(result.success).toBe(true);
  });
});
