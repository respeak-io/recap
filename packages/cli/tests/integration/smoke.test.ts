import { describe, it, expect } from "vitest";
import { PlanSchema, RecordingManifestSchema } from "../../src/analyze/plan-schema.js";
import { parseDeterministic } from "../../src/record/action-translator.js";
import { buildMergeCommand } from "../../src/produce/merge.js";
import { getProvider } from "../../src/produce/tts/registry.js";
import { assembleRawDoc } from "../../src/produce/docs-generator.js";
import yaml from "js-yaml";

describe("Integration: pipeline wiring", () => {
  const samplePlan = {
    version: 1 as const,
    app: {
      url: "http://localhost:3000",
      auth: { strategy: "credentials" as const, credentials: { email: "a@b.com", password: "p" } },
      viewport: { width: 1280, height: 720 },
    },
    recording: { max_concurrent: 2 },
    features: [
      {
        id: "test-feature",
        title: "Test Feature",
        category: "Testing",
        steps: [
          { action: "navigate to /", narration: "Go home.", pause: 1000 },
          { action: "click button 'Submit'", narration: "Submit the form." },
        ],
      },
    ],
    output: {
      video_dir: "./test-output/videos",
      docs_dir: "./test-output/docs",
      languages: ["en"],
      tts: { provider: "google" as const, voice: "en-US-Studio-O", speed: 1.0 },
      screenshots: true,
    },
  };

  it("plan file round-trips through YAML", () => {
    const yamlStr = yaml.dump(samplePlan);
    const parsed = PlanSchema.parse(yaml.load(yamlStr));
    expect(parsed.features[0].id).toBe("test-feature");
    expect(parsed.features[0].steps[0].timeout).toBe(10000); // default applied
  });

  it("all plan steps parse deterministically", () => {
    const plan = PlanSchema.parse(samplePlan);
    for (const feature of plan.features) {
      for (const step of feature.steps) {
        const parsed = parseDeterministic(step.action);
        expect(parsed).not.toBeNull();
      }
    }
  });

  it("merge command builds from manifest data", () => {
    const manifest = RecordingManifestSchema.parse({
      version: 1,
      recorded_at: new Date().toISOString(),
      features: {
        "test-feature": {
          video_path: "./test.webm",
          status: "success",
          steps: [
            { stepIndex: 0, startedAt: 0, completedAt: 1000 },
            { stepIndex: 1, startedAt: 2000, completedAt: 3000 },
          ],
          duration_ms: 4000,
        },
      },
    });

    const entry = manifest.features["test-feature"];
    const cmd = buildMergeCommand({
      videoPath: entry.video_path,
      audioClips: entry.steps.map((s, i) => ({
        path: `step-${i}.mp3`,
        startAt: s.startedAt,
      })),
      outputPath: "output.mp4",
    });

    expect(cmd.binary).toBe("ffmpeg");
    expect(cmd.args).toContain("output.mp4");
  });

  it("TTS providers are all instantiable", () => {
    for (const name of ["google", "openai", "elevenlabs"]) {
      const provider = getProvider(name);
      expect(typeof provider.synthesize).toBe("function");
    }
  });

  it("docs generator assembles raw markdown", () => {
    const md = assembleRawDoc({
      title: "Test Feature",
      steps: [
        { action: "navigate to /", narration: "Go home." },
        { action: "click button 'Submit'", narration: "Submit the form." },
      ],
    });
    expect(md).toContain("# Test Feature");
    expect(md).toContain("Go home.");
  });
});
