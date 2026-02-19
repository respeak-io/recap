import { initAI, uploadVideo, extractVideoContent, getAI } from "./gemini.js";
import { getDocGenerationPrompt } from "./prompts.js";

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

export interface PipelineCallbacks {
  onProgress?: (step: string, message: string) => void;
}

export async function processVideo(
  source: string,
  apiKey: string,
  callbacks?: PipelineCallbacks
): Promise<GeneratedDoc> {
  const log = callbacks?.onProgress ?? (() => {});

  initAI(apiKey);

  log("upload", "Uploading video to Gemini...");
  const { uri, mimeType } = await uploadVideo(source);

  log("extract", "Extracting content from video...");
  const segments: Segment[] = await extractVideoContent(uri, mimeType);

  log("generate", "Generating documentation...");
  const prompt = getDocGenerationPrompt(segments as unknown as Record<string, unknown>[]);
  const response = await getAI().models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });

  const doc = JSON.parse(response.text!);

  return { title: doc.title, chapters: doc.chapters, segments };
}
