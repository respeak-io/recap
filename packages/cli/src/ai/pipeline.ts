import { initAI, uploadVideo, extractVideoContent, getAI } from "./gemini.js";
import { getDocGenerationPrompt } from "./prompts.js";
import { isYouTubeUrl, downloadYouTube } from "../download.js";
import { unlink } from "node:fs/promises";

export interface Segment {
  start_time: number;
  end_time: number;
  spoken_content: string;
  visual_context: string;
  topic: string;
}

export interface Section {
  heading: string;
  content: string;
  timestamp_ref?: string;
}

export interface Chapter {
  title: string;
  sections: Section[];
}

export interface GeneratedDoc {
  title: string;
  chapters: Chapter[];
  segments: Segment[];
}

export interface PipelineOptions {
  model?: string;
  onProgress?: (step: string, message: string) => void;
}

export async function processVideo(
  source: string,
  apiKey: string,
  options?: PipelineOptions
): Promise<GeneratedDoc> {
  const model = options?.model ?? "gemini-2.5-flash";
  const log = options?.onProgress ?? (() => {});

  initAI(apiKey);

  let videoPath = source;
  let tempFile: string | null = null;

  if (isYouTubeUrl(source)) {
    log("download", "Downloading video from YouTube...");
    videoPath = await downloadYouTube(source);
    tempFile = videoPath;
  }

  try {
    log("upload", "Uploading video to Gemini...");
    const { uri, mimeType } = await uploadVideo(videoPath);

    log("extract", "Extracting content from video...");
    const segments: Segment[] = await extractVideoContent(uri, mimeType, model);

    log("generate", "Generating documentation...");
    const prompt = getDocGenerationPrompt(segments as unknown as Record<string, unknown>[]);
    const response = await getAI().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });

    const doc = JSON.parse(response.text!);

    return { title: doc.title, chapters: doc.chapters, segments };
  } finally {
    if (tempFile) {
      await unlink(tempFile).catch(() => {});
    }
  }
}
