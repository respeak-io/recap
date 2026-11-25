import { describe, it, expect } from "vitest";
import { docText, firstStructureDiff } from "../src/sync/structure.js";
import { markdownToTiptapRaw } from "../src/markdown/markdown-to-tiptap.js";

const doc = (md: string) => markdownToTiptapRaw(md).doc;
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const para = (...content: unknown[]) => ({ type: "doc", content: [{ type: "paragraph", content }] });

describe("firstStructureDiff", () => {
  it.each([
    ["code-block language", "```bash\nls\n```", "```\nls\n```", 'codeBlock language: remote=none, local="bash"'],
    ["link target", "[a](https://x.test/1)", "[a](https://x.test/2)", /formatting of "a": remote=link\{.*\/2.*local=link\{.*\/1/],
    ["bold", "**a** b", "a b", /formatting|text|children/],
    ["heading level", "## A", "### A", /heading level/],
    ["callout type", ":::warning\nA\n:::", ":::tip\nA\n:::", /callout type: remote="tip", local="warning"/],
    ["image source", "![a](https://x.test/1.png)", "![a](https://x.test/2.png)", /image src/],
    ["block type", "- a", "1. a", "block type: remote=orderedList, local=bulletList"],
    ["extra block", "a\n\nb", "a", "doc children: remote=1, local=2"],
  ])("finds a changed %s", (_name, local, remote, expected) => {
    const found = firstStructureDiff(doc(local), doc(remote));
    if (typeof expected === "string") expect(found).toBe(expected);
    else expect(found).toMatch(expected);
  });

  it("is null for the same markdown after a JSON round trip with reordered keys", () => {
    const md = "## A\n\n[x](https://x.test) **b** `c`\n\n```json\n{}\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n:::steps\n### S\nText\n:::";
    const reorder = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reorder)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)]))
          : v;
    expect(firstStructureDiff(doc(md), reorder(doc(md)))).toBeNull();
  });

  it("ignores null attributes, empty arrays, mark order and text-node splits", () => {
    const bold = { type: "bold" };
    const italic = { type: "italic", attrs: null };
    const a = para(text("ab", [bold, italic]), text(" c"));
    const b = {
      type: "doc",
      attrs: {},
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [text("a", [italic, bold]), text("b", [bold, italic]), text(" c", [])],
        },
      ],
    };
    expect(firstStructureDiff(a, b)).toBeNull();
  });

  it("can leave image sources out of the comparison", () => {
    const [a, b] = [doc("![a](media/1.png)"), doc("![a](https://x.test/1.png)")];
    expect(firstStructureDiff(a, b)).not.toBeNull();
    expect(firstStructureDiff(a, b, { ignoreImageSrc: true })).toBeNull();
  });
});

describe("docText", () => {
  it("collects the text of all nodes", () => {
    expect(docText(doc("## A\n\nb **c**"))).toMatch(/A\s+b\s+c/);
    expect(docText(null)).toBe("");
  });
});
