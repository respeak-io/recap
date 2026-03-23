import type { TTSProvider, TTSOptions } from "./interface.js";

export class GoogleTTSProvider implements TTSProvider {
  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Google Cloud TTS requires GOOGLE_CLOUD_TTS_API_KEY or GEMINI_API_KEY");
    }

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: options.language,
            name: options.voice,
          },
          audioConfig: {
            audioEncoding: options.format === "mp3" ? "MP3" : "LINEAR16",
            speakingRate: options.speed,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google TTS failed: ${response.status} ${error}`);
    }

    const data = await response.json() as { audioContent: string };
    return Buffer.from(data.audioContent, "base64");
  }
}
