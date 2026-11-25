import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseManifest } from "../src/sync/manifest.js";
import { buildLinkMap } from "../src/sync/links.js";
import { buildPayload } from "../src/sync/payload.js";
import { selectManifest } from "../src/sync/select.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "recap-order-"));
  mkdirSync(path.join(dir, "en"));
  for (const f of ["one", "two", "three", "four"]) writeFileSync(path.join(dir, "en", `${f}.md`), `# ${f}\n\nText`);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const art = (slug: string, langs = ["en", "de"]) => ({
  slug,
  ...Object.fromEntries(langs.map((l) => [l, { title: slug, file: `en/${slug}.md` }])),
});

// Declared out of order on purpose: the manifest's `order` decides, not the array.
const manifest = () =>
  parseManifest(
    JSON.stringify({
      project_slug: "docs",
      languages: ["en", "de"],
      chapters: [
        { slug: "last", title: "Last", order: 2, articles: [art("one"), art("two", ["en"]), art("three")] },
        { slug: "first", title: "First", order: 0, articles: [art("four")] },
        { slug: "middle", title: "Middle", order: 1, articles: [] },
      ],
    }),
  );

async function orders(only?: string[]) {
  const full = manifest();
  const scoped = only ? selectManifest(full, only) : full;
  const payload = await buildPayload(scoped, dir, {}, buildLinkMap(full), undefined, full);
  return payload.chapters.map((c) => ({
    slug: c.slug,
    order: c.order,
    articles: c.articles.map((a) => [a.slug, a.language, a.order]),
  }));
}

const LAST = {
  slug: "last",
  order: 2,
  articles: [
    ["one", "en", 0],
    ["one", "de", 1],
    ["two", "en", 2],
    ["three", "en", 3],
    ["three", "de", 4],
  ],
};

describe("buildPayload order", () => {
  it("matches the array position on a full push", async () => {
    expect(await orders()).toEqual([
      { slug: "first", order: 0, articles: [["four", "en", 0], ["four", "de", 1]] },
      { slug: "middle", order: 1, articles: [] },
      LAST,
    ]);
  });

  it("keeps the full-manifest position for a scoped chapter", async () => {
    expect(await orders(["last"])).toEqual([LAST]);
  });

  it("keeps the full-manifest position for a scoped article", async () => {
    expect(await orders(["last/three"])).toEqual([
      { slug: "last", order: 2, articles: [["three", "en", 3], ["three", "de", 4]] },
    ]);
  });
});
