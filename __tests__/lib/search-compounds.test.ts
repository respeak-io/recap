import { describe, it, expect } from "vitest";
import { Vocabulary, expandCompoundTerms, splitCompound } from "@/lib/search/compounds";

const vocab = new Vocabulary([
  "akte", "akten", "einträge", "eintrag", "lesen", "arbeit", "bereich", "bereiche",
  "einstellungen", "einstellung", "wissens", "wissen", "lücken", "quellen", "karten",
]);

describe("Vocabulary.hasPrefix", () => {
  it("finds words starting with a prefix", () => {
    expect(vocab.hasPrefix("eintr")).toBe(true);
    expect(vocab.hasPrefix("akteneintr")).toBe(false);
    expect(vocab.hasPrefix("zzz")).toBe(false);
  });
});

describe("splitCompound", () => {
  it("splits a compound the docs never use, normalising the linking -n", () => {
    expect(splitCompound("akteneinträge", vocab)).toEqual(["akte", "einträge"]);
    expect(splitCompound("akteneintrag", vocab)).toEqual(["akte", "eintrag"]);
  });

  it("handles the linking -s", () => {
    expect(splitCompound("arbeitsbereich", vocab)).toEqual(["arbeit", "bereich"]);
  });

  it("splits into three parts when needed", () => {
    expect(splitCompound("quellenkartenakte", vocab)).toEqual(["quellen", "karten", "akte"]);
  });

  it("returns null when the parts are not all known", () => {
    expect(splitCompound("aktenschrank", vocab)).toBeNull();
  });
});

describe("expandCompoundTerms", () => {
  it("only splits terms that match nothing", () => {
    expect(expandCompoundTerms(["lese", "akteneinträge"], vocab)).toEqual(["lese", "akte", "einträge"]);
    // "einstellungen" exists, so it is not torn into "ein" + "stellungen".
    expect(expandCompoundTerms(["einstellungen"], vocab)).toEqual(["einstellungen"]);
  });

  it("keeps unknown terms that cannot be split and removes duplicates", () => {
    expect(expandCompoundTerms(["aktenschrank", "akte", "akteneinträge"], vocab)).toEqual([
      "aktenschrank", "akte", "einträge",
    ]);
  });
});
