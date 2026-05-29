import { describe, it, expect } from "vitest";
import { buildLinkMap, rewriteInternalLinks } from "../src/sync/links.js";
import { parseManifest } from "../src/sync/manifest.js";

const manifest = parseManifest(
  JSON.stringify({
    project_slug: "respeak",
    languages: ["en", "de"],
    chapters: [
      {
        slug: "getting-started",
        title: "Getting Started",
        content: {
          en: "en/01_getting-started/_index.md",
          de: "de/01_erste-schritte/_index.md",
        },
        articles: [
          {
            slug: "sign-in",
            en: { title: "Sign In", file: "en/01_getting-started/01_sign-in.md" },
            de: { title: "Anmelden", file: "de/01_erste-schritte/01_anmelden.md" },
          },
        ],
      },
      {
        slug: "multichat",
        title: "Multichat",
        content: { en: "en/05_multichat/_index.md" },
        articles: [
          {
            slug: "trigger",
            en: { title: "Trigger", file: "en/05_multichat/02_trigger.md" },
          },
        ],
      },
    ],
  }),
);

const linkMap = buildLinkMap(manifest);
const SRC = "en/01_getting-started/01_sign-in.md";

function rewrite(content: string, onWarn?: (m: string) => void): string {
  return rewriteInternalLinks(content, SRC, linkMap, "respeak", onWarn);
}

describe("buildLinkMap", () => {
  it("maps chapter _index files (all languages) to the chapter slug", () => {
    expect(linkMap.get("en/01_getting-started/_index.md")).toBe("getting-started");
    expect(linkMap.get("de/01_erste-schritte/_index.md")).toBe("getting-started");
    expect(linkMap.get("en/05_multichat/_index.md")).toBe("multichat");
  });

  it("maps every article language file to the shared article slug", () => {
    expect(linkMap.get("en/01_getting-started/01_sign-in.md")).toBe("sign-in");
    expect(linkMap.get("de/01_erste-schritte/01_anmelden.md")).toBe("sign-in");
    expect(linkMap.get("en/05_multichat/02_trigger.md")).toBe("trigger");
  });
});

describe("rewriteInternalLinks", () => {
  it("rewrites a repo-relative .md cross-link to the public slug URL", () => {
    expect(rewrite("See the [trigger](../05_multichat/02_trigger.md).")).toBe(
      "See the [trigger](/respeak/trigger).",
    );
  });

  it("preserves a #fragment when rewriting", () => {
    expect(rewrite("Jump to [step](../05_multichat/02_trigger.md#step-2).")).toBe(
      "Jump to [step](/respeak/trigger#step-2).",
    );
  });

  it("resolves a link to a chapter _index file to the chapter slug", () => {
    // From en/01_getting-started/01_sign-in.md, `_index.md` resolves to the
    // sibling chapter intro -> chapter slug.
    expect(rewrite("Back to [overview](_index.md).")).toBe(
      "Back to [overview](/respeak/getting-started).",
    );
  });

  it("rewrites multiple links in one document", () => {
    const out = rewrite(
      "[a](../05_multichat/02_trigger.md) and [b](./_index.md)",
    );
    expect(out).toBe("[a](/respeak/trigger) and [b](/respeak/getting-started)");
  });

  it("leaves http(s), mailto and absolute links untouched", () => {
    expect(rewrite("[ext](https://example.com/page.md)")).toBe(
      "[ext](https://example.com/page.md)",
    );
    expect(rewrite("[mail](mailto:team@respeak.io)")).toBe("[mail](mailto:team@respeak.io)");
    expect(rewrite("[abs](/respeak/already.md)")).toBe("[abs](/respeak/already.md)");
  });

  it("leaves non-.md links (e.g. images) untouched", () => {
    expect(rewrite("![shot](media/login.png)")).toBe("![shot](media/login.png)");
    expect(rewrite("[asset](./diagram.svg)")).toBe("[asset](./diagram.svg)");
  });

  it("warns and leaves the link unchanged when it does not resolve to a slug", () => {
    const warnings: string[] = [];
    const out = rewrite("[gone](../99_missing/00_nope.md)", (m) => warnings.push(m));
    expect(out).toBe("[gone](../99_missing/00_nope.md)");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("unresolved cross-link");
    expect(warnings[0]).toContain("../99_missing/00_nope.md");
  });
});
