import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import { readFile } from "node:fs/promises";

let _ai: GoogleGenAI | null = null;

export function initAI(apiKey: string) {
  _ai = new GoogleGenAI({ apiKey });
}

export function getAI(): GoogleGenAI {
  if (!_ai) throw new Error("Call initAI(apiKey) first");
  return _ai;
}

export async function uploadVideo(source: string): Promise<{ uri: string; mimeType: string }> {
  const ai = getAI();

  let blob: Blob;
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
    blob = await res.blob();
  } else {
    const buffer = await readFile(source);
    blob = new Blob([buffer], { type: "video/mp4" });
  }

  const upload = await ai.files.upload({
    file: blob,
    config: { mimeType: "video/mp4" },
  });

  let info = await ai.files.get({ name: upload.name! });
  while (info.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 5000));
    info = await ai.files.get({ name: upload.name! });
  }

  if (info.state === "FAILED") throw new Error("Gemini video processing failed");

  return { uri: info.uri!, mimeType: info.mimeType! };
}

export async function extractVideoContent(fileUri: string, fileMimeType: string, model: string = "gemini-2.5-flash") {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model,
    contents: createUserContent([
      createPartFromUri(fileUri, fileMimeType),
      `Analyze this video and return a JSON array of segments. Each segment should cover a logical section of the video (30-120 seconds each).

For each segment provide:
- "start_time": start in seconds (number)
- "end_time": end in seconds (number)
- "spoken_content": what is being said (transcription)
- "visual_context": what is visually happening on screen (UI elements, code, clicks, navigation)
- "topic": a short title for this segment

Return ONLY valid JSON, no markdown fences.`,
    ]),
    config: { responseMimeType: "application/json" },
  });

  return JSON.parse(response.text!);
}
