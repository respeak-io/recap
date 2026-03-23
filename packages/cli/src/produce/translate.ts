import { generateText } from "../ai/gemini.js";
import { getNarrationTranslationPrompt } from "../ai/prompts.js";

export async function translateNarration(
  narration: string,
  targetLanguage: string,
  model: string = "gemini-2.5-flash"
): Promise<string> {
  if (targetLanguage === "en") return narration;

  const prompt = getNarrationTranslationPrompt(narration, targetLanguage);
  return await generateText(prompt, model);
}

export async function translateNarrations(
  narrations: string[],
  targetLanguage: string,
  model: string = "gemini-2.5-flash"
): Promise<string[]> {
  if (targetLanguage === "en") return narrations;

  const combined = narrations.map((n, i) => `[${i}] ${n}`).join("\n");
  const prompt = `Translate each of the following numbered narration lines to ${targetLanguage}.
Keep them natural and conversational — they will be spoken by a TTS system.
Preserve technical terms and product names in English.
Return each line with its original number prefix. Return ONLY the translated lines, no preamble.

${combined}`;

  const result = await generateText(prompt, model);

  const lines = result.split("\n").filter((l) => l.trim());
  return lines.map((line) => line.replace(/^\[\d+\]\s*/, ""));
}
