export const MAX_KEYWORDS = 20;
export const MAX_KEYWORD_LENGTH = 40;

export function normalizeKeywords(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const stripped = raw.replace(/^#+/, "").trim().toLowerCase();
    if (stripped.length === 0) continue;
    if (seen.has(stripped)) continue;
    seen.add(stripped);
    out.push(stripped);
  }
  return out;
}

export type ValidationResult =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

export function validateKeywords(input: unknown): ValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "keywords must be an array of strings" };
  }
  if (!input.every((v) => typeof v === "string")) {
    return { ok: false, error: "keywords must be an array of strings" };
  }

  const normalized = normalizeKeywords(input as string[]);

  const tooLong = normalized.find((kw) => kw.length > MAX_KEYWORD_LENGTH);
  if (tooLong) {
    return {
      ok: false,
      error: `keyword exceeds ${MAX_KEYWORD_LENGTH} characters: "${tooLong}"`,
    };
  }
  if (normalized.length > MAX_KEYWORDS) {
    return { ok: false, error: `max ${MAX_KEYWORDS} keywords allowed` };
  }
  return { ok: true, value: normalized };
}
