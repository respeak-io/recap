import { ThinkingLevel } from "@google/genai";

/**
 * Gemini model per task: the single place to change models.
 *
 * Chosen 2026-11-13 from the Gemini API pricing page and a side-by-side test
 * (docs/model-comparison-2026-11.md in the repo root):
 * - Quality-critical, run-once work (video understanding, writing docs, planning
 *   features, driving the browser) uses the strongest Flash model.
 * - High-volume, simple work (translation) uses Flash-Lite.
 *
 * `thinkingLevel` left undefined means the model's own default. For
 * gemini-3.5-flash-lite that default produced no thinking tokens in our test,
 * which is cheaper and faster than setting LOW.
 *
 * Note: `gemini-2.5-flash` (the previous default) is deprecated and is routed to
 * gemini-3.5-flash-lite from 2026-12-01.
 */
export interface ModelChoice {
  model: string;
  thinkingLevel?: ThinkingLevel;
}

export const MODELS = {
  /** Video → timestamped segments (one call per video). */
  videoExtraction: { model: "gemini-3.8-flash", thinkingLevel: ThinkingLevel.MEDIUM },
  /** Segments/narration → structured docs and polished prose. */
  docWriting: { model: "gemini-3.8-flash", thinkingLevel: ThinkingLevel.MEDIUM },
  /** Codebase scan → feature plan (`analyze`). */
  analyze: { model: "gemini-3.8-flash", thinkingLevel: ThinkingLevel.MEDIUM },
  /** Natural-language step → Playwright code (`record`); many short calls, so keep latency low. */
  browserActions: { model: "gemini-3.8-flash", thinkingLevel: ThinkingLevel.LOW },
  /** Narration and doc translation. */
  translation: { model: "gemini-3.5-flash-lite" },
} as const satisfies Record<string, ModelChoice>;

export type ModelTask = keyof typeof MODELS;

/**
 * The model for a task. A user-supplied `--model` override replaces the model
 * for every task in that command and uses that model's default thinking.
 */
export function modelFor(task: ModelTask, override?: string): ModelChoice {
  return override ? { model: override } : MODELS[task];
}

/** `generateContent` config fragment for a model choice. */
export function thinkingConfigFor(choice: ModelChoice) {
  return choice.thinkingLevel
    ? { thinkingConfig: { thinkingLevel: choice.thinkingLevel } }
    : {};
}
