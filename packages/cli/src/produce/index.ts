import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import {
  PlanSchema,
  RecordingManifestSchema,
  type Plan,
  type RecordingManifest,
} from "../analyze/plan-schema.js";
import { initAI } from "../ai/gemini.js";
import { getProvider } from "./tts/registry.js";
import type { TTSOptions } from "./tts/interface.js";
import { translateNarrations } from "./translate.js";
import { mergeAudioVideo, checkFfmpeg, type AudioClip } from "./merge.js";
import { generateDocs } from "./docs-generator.js";

export interface ProduceOptions {
  planPath: string;
  apiKey: string;
  model?: string;
  onProgress?: (message: string) => void;
}

export async function produceOutput(options: ProduceOptions): Promise<void> {
  const { planPath, apiKey, model = "gemini-2.5-flash", onProgress = () => {} } = options;

  if (!(await checkFfmpeg())) {
    throw new Error(
      "ffmpeg not found. Install it:\n" +
      "  macOS: brew install ffmpeg\n" +
      "  Ubuntu: sudo apt install ffmpeg\n" +
      "  Windows: https://ffmpeg.org/download.html"
    );
  }

  initAI(apiKey);

  // Load plan
  const planContent = await readFile(planPath, "utf-8");
  const plan = PlanSchema.parse(yaml.load(planContent));

  // Load manifest
  const manifestPath = join(resolve(plan.output.video_dir), "manifest.json");
  const manifestContent = await readFile(manifestPath, "utf-8");
  const manifest = RecordingManifestSchema.parse(JSON.parse(manifestContent));

  // Get TTS provider
  const ttsProvider = getProvider(plan.output.tts.provider);

  const successFeatures = plan.features.filter(
    (f) => manifest.features[f.id]?.status === "success"
  );

  onProgress(`Producing ${successFeatures.length} features across ${plan.output.languages.length} language(s)...`);

  for (const feature of successFeatures) {
    const manifestEntry = manifest.features[feature.id];
    const narrations = feature.steps.map((s) => s.narration);

    for (const lang of plan.output.languages) {
      onProgress(`Producing: ${feature.title} (${lang})`);

      // Translate narrations if needed
      const translatedNarrations =
        lang === "en" ? narrations : await translateNarrations(narrations, lang, model);

      // Generate TTS for each step
      const audioDir = join(resolve(plan.output.video_dir), "audio", feature.id, lang);
      await mkdir(audioDir, { recursive: true });

      const audioClips: AudioClip[] = [];

      for (let i = 0; i < translatedNarrations.length; i++) {
        const text = translatedNarrations[i];
        const stepInfo = manifestEntry.steps[i];
        if (!stepInfo) continue;

        const ttsOptions: TTSOptions = {
          voice: plan.output.tts.voice,
          speed: plan.output.tts.speed,
          language: lang === "en" ? "en-US" : lang,
          format: "mp3",
        };

        const audioBuffer = await ttsProvider.synthesize(text, ttsOptions);
        const audioPath = join(audioDir, `step-${i}.mp3`);
        await writeFile(audioPath, audioBuffer);

        audioClips.push({
          path: audioPath,
          startAt: stepInfo.startedAt,
        });
      }

      // Merge audio + video
      const outputPath = join(
        resolve(plan.output.video_dir),
        `${feature.id}.${lang}.mp4`
      );

      await mergeAudioVideo({
        videoPath: manifestEntry.video_path,
        audioClips,
        outputPath,
      });

      onProgress(`  ✓ Video: ${outputPath}`);
    }
  }

  // Generate text documentation
  onProgress("Generating text documentation...");
  const docFiles = await generateDocs(plan, manifest, model, onProgress);
  onProgress(`  ✓ ${docFiles.length} doc file(s) written`);

  onProgress("Done!");
}
