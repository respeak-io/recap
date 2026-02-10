import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";

let _ai: GoogleGenAI | null = null;

function getAI() {
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

export async function extractVideoContent(
  fileUri: string,
  fileMimeType: string
) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text!);
}

export { getAI };
