import { describe, it, expect } from "vitest";
import { normalizeKeywords, validateKeywords, MAX_KEYWORDS, MAX_KEYWORD_LENGTH } from "@/lib/keywords";

describe("normalizeKeywords", () => {
  it("trims whitespace", () => {
    expect(normalizeKeywords(["  foo  ", "bar "])).toEqual(["foo", "bar"]);
  });

  it("strips leading hash characters", () => {
    expect(normalizeKeywords(["#foo", "##bar"])).toEqual(["foo", "bar"]);
  });

  it("lowercases keywords", () => {
    expect(normalizeKeywords(["FOO", "BaR"])).toEqual(["foo", "bar"]);
  });

  it("deduplicates keeping first occurrence order", () => {
    expect(normalizeKeywords(["foo", "bar", "foo"])).toEqual(["foo", "bar"]);
  });

  it("drops empty strings after normalization", () => {
    expect(normalizeKeywords(["", "  ", "#", "foo"])).toEqual(["foo"]);
  });

  it("applies full pipeline end-to-end", () => {
    expect(normalizeKeywords(["#Onboarding", " onboarding ", "Error", "error", ""]))
      .toEqual(["onboarding", "error"]);
  });

  it("preserves unicode (umlauts, emoji)", () => {
    expect(normalizeKeywords(["Fehlerbehebung", "über", "🚀"]))
      .toEqual(["fehlerbehebung", "über", "🚀"]);
  });
});

describe("validateKeywords", () => {
  it("returns ok for valid input", () => {
    expect(validateKeywords(["foo", "bar"])).toEqual({ ok: true, value: ["foo", "bar"] });
  });

  it("normalizes input before validating", () => {
    expect(validateKeywords(["#FOO", "foo"])).toEqual({ ok: true, value: ["foo"] });
  });

  it("rejects more than MAX_KEYWORDS", () => {
    const tooMany = Array.from({ length: MAX_KEYWORDS + 1 }, (_, i) => `kw${i}`);
    const result = validateKeywords(tooMany);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(new RegExp(`max ${MAX_KEYWORDS}`, "i"));
    }
  });

  it("counts AFTER normalization for the limit", () => {
    // 20 duplicates dedupe to 1, should be valid
    const dupes = Array.from({ length: MAX_KEYWORDS + 5 }, () => "same");
    expect(validateKeywords(dupes)).toEqual({ ok: true, value: ["same"] });
  });

  it("rejects keywords longer than MAX_KEYWORD_LENGTH", () => {
    const tooLong = "a".repeat(MAX_KEYWORD_LENGTH + 1);
    const result = validateKeywords(["ok", tooLong]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/40 characters/i);
      expect(result.error).toContain(tooLong);
    }
  });

  it("rejects non-array input", () => {
    // @ts-expect-error — testing runtime behavior
    expect(validateKeywords("foo").ok).toBe(false);
    // @ts-expect-error — testing runtime behavior
    expect(validateKeywords(null).ok).toBe(false);
  });

  it("rejects non-string entries", () => {
    // @ts-expect-error — testing runtime behavior
    expect(validateKeywords(["ok", 42]).ok).toBe(false);
  });
});
