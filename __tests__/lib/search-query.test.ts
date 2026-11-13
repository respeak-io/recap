import { describe, it, expect } from "vitest";
import { buildSearchTsQueries } from "@/lib/search/query";

describe("buildSearchTsQueries", () => {
  it("drops German and English stop words", () => {
    expect(buildSearchTsQueries("Wie lade ich neue Benutzer ein?")?.terms).toEqual(["lade", "neue", "benutzer"]);
    expect(buildSearchTsQueries("How do I change my password")?.terms).toEqual(["change", "password"]);
  });

  it("builds prefix AND/OR queries", () => {
    expect(buildSearchTsQueries("Ergebnisse exportieren")).toEqual({
      and: "ergebnisse:* & exportieren:*",
      or: "ergebnisse:* | exportieren:*",
      terms: ["ergebnisse", "exportieren"],
    });
  });

  it("keeps umlauts and digits, strips tsquery operators", () => {
    expect(buildSearchTsQueries("Größe & (v2) | !über:*")?.terms).toEqual(["größe", "v2"]);
  });

  it("falls back to the stop words when nothing else is left", () => {
    expect(buildSearchTsQueries("wie ist das")?.terms).toEqual(["wie", "ist", "das"]);
    expect(buildSearchTsQueries("wie geht das")?.terms).toEqual(["geht"]);
  });

  it("deduplicates and caps terms", () => {
    const q = buildSearchTsQueries("alpha alpha beta gamma delta epsilon zeta eta theta iota kappa");
    expect(q?.terms).toEqual(["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"]);
  });

  it("returns null for empty or punctuation-only input", () => {
    expect(buildSearchTsQueries("")).toBeNull();
    expect(buildSearchTsQueries("### ...")).toBeNull();
  });
});
