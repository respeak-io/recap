import { describe, it, expect } from "vitest";
import { parseManifest } from "../src/sync/manifest.js";
import { parseSelectors, selectManifest } from "../src/sync/select.js";

function manifest() {
  return parseManifest(
    JSON.stringify({
      project_slug: "respeak",
      languages: ["en"],
      chapters: [
        {
          slug: "getting-started",
          title: "Getting Started",
          articles: [
            { slug: "install", en: { title: "Install", file: "en/install.md" } },
            { slug: "configure", en: { title: "Configure", file: "en/configure.md" } },
          ],
        },
        {
          slug: "guides",
          title: "Guides",
          articles: [{ slug: "deploy", en: { title: "Deploy", file: "en/deploy.md" } }],
        },
      ],
    }),
  );
}

describe("parseSelectors", () => {
  it("splits bare slugs into chapters and slash forms into articles", () => {
    const sel = parseSelectors(["getting-started", "guides/deploy"]);
    expect(sel.chapters).toEqual(["getting-started"]);
    expect(sel.articles).toEqual([{ chapter: "guides", article: "deploy" }]);
  });

  it("trims whitespace and surrounding slashes, dropping empties", () => {
    const sel = parseSelectors(["  getting-started/ ", "/guides/deploy/", "", "   "]);
    // "  getting-started/ " -> trim -> "getting-started/" -> strip trailing slash -> chapter
    expect(sel.chapters).toEqual(["getting-started"]);
    // "/guides/deploy/" -> strip surrounding slashes -> article
    expect(sel.articles).toEqual([{ chapter: "guides", article: "deploy" }]);
  });
});

describe("selectManifest", () => {
  it("keeps a whole chapter with all its articles", () => {
    const out = selectManifest(manifest(), ["getting-started"]);
    expect(out.chapters.map((c) => c.slug)).toEqual(["getting-started"]);
    expect(out.chapters[0].articles.map((a) => a.slug)).toEqual(["install", "configure"]);
  });

  it("narrows a chapter to a single article", () => {
    const out = selectManifest(manifest(), ["getting-started/install"]);
    expect(out.chapters).toHaveLength(1);
    expect(out.chapters[0].slug).toBe("getting-started");
    expect(out.chapters[0].articles.map((a) => a.slug)).toEqual(["install"]);
  });

  it("preserves chapter-level fields on a narrowed chapter", () => {
    const out = selectManifest(manifest(), ["getting-started/install"]);
    expect(out.chapters[0].title).toBe("Getting Started");
    expect(out.project_slug).toBe("respeak");
  });

  it("supports multiple selectors across chapters", () => {
    const out = selectManifest(manifest(), ["getting-started/configure", "guides"]);
    expect(out.chapters.map((c) => c.slug)).toEqual(["getting-started", "guides"]);
    expect(out.chapters[0].articles.map((a) => a.slug)).toEqual(["configure"]);
    expect(out.chapters[1].articles.map((a) => a.slug)).toEqual(["deploy"]);
  });

  it("throws on a chapter selector that matches nothing", () => {
    expect(() => selectManifest(manifest(), ["nope"])).toThrow(/matched nothing.*nope/);
  });

  it("throws on an article selector that matches nothing", () => {
    expect(() => selectManifest(manifest(), ["getting-started/ghost"])).toThrow(
      /matched nothing.*getting-started\/ghost/,
    );
  });

  it("does not mutate the source manifest", () => {
    const m = manifest();
    selectManifest(m, ["getting-started/install"]);
    expect(m.chapters[0].articles.map((a) => a.slug)).toEqual(["install", "configure"]);
  });
});
