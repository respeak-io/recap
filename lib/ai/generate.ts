import { getAI } from "./gemini";

/**
 * Convenience wrapper around Gemini's generateContent API.
 * Centralizes the call pattern so it's easy to mock in tests.
 */
export async function generateText(
  prompt: string,
  opts?: { model?: string; json?: boolean }
): Promise<string> {
  const response = await getAI().models.generateContent({
    model: opts?.model ?? "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: opts?.json ? { responseMimeType: "application/json" } : undefined,
  });
  return response.text ?? "";
}
