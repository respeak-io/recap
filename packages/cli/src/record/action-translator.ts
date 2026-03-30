import type { Page } from "playwright";
import { generateText } from "../ai/gemini.js";
import { getActionTranslationPrompt } from "../ai/prompts.js";

// --- Deterministic parsing ---

export type ParsedAction =
  | { type: "navigate"; path: string }
  | { type: "click_button"; name: string }
  | { type: "click_link"; name: string }
  | { type: "click_text"; name: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "select"; option: string; label: string }
  | { type: "wait"; ms: number };

const PATTERNS: Array<{ regex: RegExp; parse: (m: RegExpMatchArray) => ParsedAction }> = [
  {
    regex: /^navigate to (\/\S*)$/i,
    parse: (m) => ({ type: "navigate", path: m[1] }),
  },
  {
    regex: /^click button '([^']+)'$/i,
    parse: (m) => ({ type: "click_button", name: m[1] }),
  },
  {
    regex: /^click link '([^']+)'$/i,
    parse: (m) => ({ type: "click_link", name: m[1] }),
  },
  {
    regex: /^click '([^']+)'$/i,
    parse: (m) => ({ type: "click_text", name: m[1] }),
  },
  {
    regex: /^fill (input\[[^\]]+\]) with '([^']+)'$/i,
    parse: (m) => ({ type: "fill", selector: m[1], value: m[2] }),
  },
  {
    regex: /^select '([^']+)' from '([^']+)'$/i,
    parse: (m) => ({ type: "select", option: m[1], label: m[2] }),
  },
  {
    regex: /^wait (\d+)$/i,
    parse: (m) => ({ type: "wait", ms: parseInt(m[1], 10) }),
  },
];

export function parseDeterministic(action: string): ParsedAction | null {
  for (const { regex, parse } of PATTERNS) {
    const match = action.match(regex);
    if (match) return parse(match);
  }
  return null;
}

// --- Execute a parsed action against a Playwright page ---

export async function executeParsedAction(
  page: Page,
  parsed: ParsedAction,
  baseUrl: string,
  timeout: number
): Promise<void> {
  switch (parsed.type) {
    case "navigate":
      await page.goto(baseUrl + parsed.path, { timeout, waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      break;
    case "click_button":
      await page.getByRole("button", { name: parsed.name }).click({ timeout });
      break;
    case "click_link":
      await page.getByRole("link", { name: parsed.name }).click({ timeout });
      break;
    case "click_text":
      await page.getByText(parsed.name, { exact: true }).click({ timeout });
      break;
    case "fill": {
      const locator = page.locator(parsed.selector);
      await locator.fill(parsed.value, { timeout });
      break;
    }
    case "select": {
      const select = page.getByLabel(parsed.label);
      await select.selectOption(parsed.option, { timeout });
      break;
    }
    case "wait":
      await page.waitForTimeout(parsed.ms);
      break;
  }
}

// --- AI-driven fallback ---

async function executeWithAI(
  page: Page,
  action: string,
  model: string,
  timeout: number
): Promise<void> {
  const snapshot = await page.locator("body").ariaSnapshot();
  const prompt = getActionTranslationPrompt(action, snapshot);
  const playwrightCode = await generateText(prompt, model);

  const cleanCode = playwrightCode.trim().replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();

  if (!cleanCode.startsWith("page.")) {
    throw new Error(`AI returned unexpected code: ${cleanCode}`);
  }

  const fn = new Function("page", `return ${cleanCode}`);
  const result = fn(page);
  if (result && typeof result.then === "function") {
    await Promise.race([
      result,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`AI action timed out after ${timeout}ms`)), timeout)
      ),
    ]);
  }
}

// --- Main entry point: translate and execute ---

export async function translateAndExecute(
  page: Page,
  action: string,
  baseUrl: string,
  model: string,
  timeout: number = 10000
): Promise<void> {
  const parsed = parseDeterministic(action);
  if (parsed) {
    await executeParsedAction(page, parsed, baseUrl, timeout);
  } else {
    await executeWithAI(page, action, model, timeout);
  }
}
