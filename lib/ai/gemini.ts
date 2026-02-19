import { GoogleGenAI } from "@google/genai";
export { extractVideoContent } from "reeldocs/ai";

let _ai: GoogleGenAI | null = null;

export function getAI() {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return _ai;
}

export async function uploadAndProcessVideo(videoUrl: string) {
  const ai = getAI();

  // Download video from Supabase Storage, then upload to Gemini
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) throw new Error("Failed to download video from storage");
  const videoBlob = await videoResponse.blob();

  const uploadResponse = await ai.files.upload({
    file: videoBlob,
    config: { mimeType: "video/mp4" },
  });

  // Wait for processing
  let fileInfo = await ai.files.get({ name: uploadResponse.name! });
  while (fileInfo.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 5000));
    fileInfo = await ai.files.get({ name: uploadResponse.name! });
  }

  if (fileInfo.state === "FAILED") {
    throw new Error("Gemini video processing failed");
  }

  return fileInfo;
}
