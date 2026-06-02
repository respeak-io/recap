import { describe, it, expect } from "vitest";
import { computeDiff, type DiffInput } from "../src/sync/diff.js";
import { parseManifest } from "../src/sync/manifest.js";
import { processMarkdown } from "../src/sync/markdown.js";
import { markdownToTiptapRaw } from "../src/markdown/markdown-to-tiptap.js";
import type { RemoteProject } from "../src/sync/client.js";

// Render an article's content_text exactly as push/server would: process the
// markdown, then run the shared converter. This is the rendering the diff's
// local side now uses, so an unedited article is byte-identical on both sides.
function render(md: string): string {
  const processed = processMarkdown(md, "en/art.md", new Map(), "proj", {}, () => {});
  return markdownToTiptapRaw(processed).text;
}

const manifest = parseManifest(
  JSON.stringify({
    project_slug: "proj",
    languages: ["en"],
    chapters: [
      {
        slug: "ch",
        title: "Chapter",
        description: "",
        articles: [{ slug: "art", en: { title: "Article", file: "en/art.md" } }],
      },
    ],
  }),
);

const remote: RemoteProject = {
  id: "p1",
  name: "",
  slug: "proj",
  subtitle: "",
  translations: null,
  is_public: true,
  chapters: [
    {
      id: "c1",
      title: "Chapter",
      description: "",
      slug: "ch",
      group: null,
      order: 0,
      translations: null,
      articles: [
        { id: "a1", title: "Article", slug: "art", language: "en", status: "published", order: 0 },
      ],
    },
  ],
};

function diffFor(localMd: string, remoteText: string): ReturnType<typeof computeDiff> {
  const input: DiffInput = {
    manifest,
    remote,
    remoteArticles: new Map([
      ["art:en", { slug: "art", language: "en", title: "Article", content_text: remoteText }],
    ]),
    remoteImages: [],
    localImages: [],
    localTexts: new Map([["art:en", render(localMd)]]),
    localFiles: new Map([["art:en", "en/art.md"]]),
  };
  return computeDiff(input);
}

describe("computeDiff content comparison", () => {
  // These markdown shapes ALL produced phantom drift under the old word-overlap
  // approximation (list markers, table pipes, image alt, video refs, step
  // titles). With the shared converter they must report a clean match.
  const SHAPES: Record<string, string> = {
    "plain paragraph": "# Title\n\nHello world.",
    "bulleted list": "# Title\n\n- item one\n- item two\n- item three",
    "ordered list": "# Title\n\n1. first\n2. second",
    "image with alt": "# Title\n\nIntro.\n\n![A login screen](media/login.png)\n\nOutro.",
    "video timestamp": "# Title\n\nClick [video:01:23] to jump.",
    "table": "# Title\n\n| Name | Role |\n|---|---|\n| Tim | Dev |",
    "steps block": "# Title\n\n:::steps\n### Open settings\nClick the gear.\n:::",
  };

  for (const [name, md] of Object.entries(SHAPES)) {
    it(`reports IN SYNC for unedited ${name}`, () => {
      // Server stored content_text is the same render of the same markdown.
      const report = diffFor(md, render(md));
      const contentDiffLines = report.diffs.filter((d) => d.includes("content differs"));
      expect(contentDiffLines).toEqual([]);
      expect(report.contentDiffs).toEqual([]);
      expect(report.info.some((i) => i.startsWith("Content: 1 match"))).toBe(true);
    });
  }

  it("flags a genuinely edited article with a structured content diff", () => {
    const report = diffFor("# Title\n\nThe new text.", render("# Title\n\nThe old text."));
    expect(report.diffs).toContain("Article 'art' (en) content differs  [en/art.md]");
    expect(report.contentDiffs).toHaveLength(1);
    expect(report.contentDiffs[0]).toMatchObject({
      slug: "art",
      lang: "en",
      file: "en/art.md",
      local: "The new text.",
      remote: "The old text.",
    });
  });
});
