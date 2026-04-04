import { describe, it, expect } from "vitest";
import { LANGUAGES, getLanguageLabel, getLanguageFlag } from "@/lib/languages";

describe("LANGUAGES", () => {
  it("contains at least English, German, and French", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("de");
    expect(codes).toContain("fr");
  });

  it("has unique codes", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every entry has code, label, and flag", () => {
    for (const lang of LANGUAGES) {
      expect(lang.code).toBeTruthy();
      expect(lang.label).toBeTruthy();
      expect(lang.flag).toBeTruthy();
    }
  });
});

describe("getLanguageLabel", () => {
  it("returns the label for a known code", () => {
    expect(getLanguageLabel("en")).toBe("English");
    expect(getLanguageLabel("de")).toBe("Deutsch");
  });

  it("returns the code itself for an unknown language", () => {
    expect(getLanguageLabel("xx")).toBe("xx");
  });
});

describe("getLanguageFlag", () => {
  it("returns the flag for a known code", () => {
    expect(getLanguageFlag("en")).toBe("\u{1F1FA}\u{1F1F8}");
  });

  it("returns globe emoji for an unknown language", () => {
    expect(getLanguageFlag("xx")).toBe("\u{1F310}");
  });
});
