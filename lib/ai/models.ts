import { MODELS, thinkingConfigFor, type ModelChoice } from "@respeak/recap/models";

export { thinkingConfigFor, type ModelChoice };

/**
 * Gemini model per task in the web app. Video understanding, doc writing and
 * translation share the CLI's choices (`packages/cli/src/ai/models.ts`), so the
 * dashboard pipeline and `npx @respeak/recap` behave the same.
 *
 * Search answers: gemini-3.5-flash-lite with its default thinking. In a
 * side-by-side test on the experte docs (2026-11-13) it matched
 * gemini-3-flash-preview on answer quality at 0.7 s instead of 5.5 s median
 * latency and about $0.80 instead of $5.20 per 1,000 answers. Setting LOW
 * thinking made it slightly slower and once answered a German question in English.
 */
export const AI_MODELS = {
  /** Public docs search: short answer from up to three articles. */
  searchAnswer: { model: "gemini-3.5-flash-lite" },
  /** Dashboard video pipeline: segments → structured docs. */
  docGeneration: MODELS.docWriting,
  /** Article / chapter translation in the dashboard. */
  translation: MODELS.translation,
} as const satisfies Record<string, ModelChoice>;

/**
 * Standard-tier list prices in USD per 1M tokens (output includes thinking),
 * from the Gemini API pricing page as of 2026-11-13. Used to estimate spend for
 * the daily AI budget; update when Google changes prices.
 */
export const MODEL_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  // Introductory price until 2026-12-31; $1.50 / $7.50 from 2027-01-01. Use the
  // later price so the budget estimate never undercounts.
  "gemini-3.8-flash": { input: 1.5, output: 7.5 },
};

/** Estimated USD cost of one call; unknown models are priced conservatively. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES_USD_PER_MTOK[model] ?? { input: 4, output: 20 };
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
