import { getAI } from "./gemini";
import { thinkingConfigFor, type ModelChoice } from "./models";

/**
 * Convenience wrapper around Gemini's generateContent API.
 * Centralizes the call pattern so it's easy to mock in tests.
 * Callers pass a task model from `AI_MODELS` (lib/ai/models.ts).
 */
export async function generateText(
  prompt: string,
  opts: { model: ModelChoice; json?: boolean }
): Promise<string> {
  const response = await getAI().models.generateContent({
    model: opts.model.model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
      ...thinkingConfigFor(opts.model),
    },
  });
  return response.text ?? "";
}
