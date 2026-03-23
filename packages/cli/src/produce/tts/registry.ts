import type { TTSProvider } from "./interface.js";
import { GoogleTTSProvider } from "./google.js";
import { OpenAITTSProvider } from "./openai.js";
import { ElevenLabsTTSProvider } from "./elevenlabs.js";

const providers: Record<string, () => TTSProvider> = {
  google: () => new GoogleTTSProvider(),
  openai: () => new OpenAITTSProvider(),
  elevenlabs: () => new ElevenLabsTTSProvider(),
};

export function getProvider(name: string): TTSProvider {
  const factory = providers[name];
  if (!factory) {
    throw new Error(`Unknown TTS provider: "${name}". Available: ${Object.keys(providers).join(", ")}`);
  }
  return factory();
}
