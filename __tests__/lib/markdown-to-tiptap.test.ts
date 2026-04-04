import { describe, it, expect } from "vitest";
import {
  markdownToTiptap,
  markdownToTiptapRaw,
} from "@/lib/ai/markdown-to-tiptap";

describe("markdownToTiptap", () => {
  it("creates a doc with heading for each section", () => {
    const result = markdownToTiptap([
      { heading: "Getting Started", content: "Welcome to the docs." },
    ]);

    expect(result.type).toBe("doc");
    expect(result.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
    });
    // Heading text
    const headingText = result.content[0].content as { text: string }[];
    expect(headingText.some((n) => n.text === "Getting Started")).toBe(true);
  });

  it("includes a paragraph for section content", () => {
    const result = markdownToTiptap([
      { heading: "Intro", content: "Some text here." },
    ]);

    const para = result.content.find((n) => n.type === "paragraph");
    expect(para).toBeDefined();
    const texts = (para!.content as { text: string }[]).map((n) => n.text);
    expect(texts.join("")).toContain("Some text here.");
  });

  it("prepends timestampLink when timestamp_ref is provided", () => {
    const result = markdownToTiptap([
      { heading: "Setup", content: "Install it.", timestamp_ref: "1:30" },
    ]);

    const heading = result.content[0];
    const firstChild = (heading.content as { type: string }[])[0];
    expect(firstChild.type).toBe("timestampLink");
  });

  it("handles bold and italic inline formatting", () => {
    const result = markdownToTiptap([
      { heading: "Title", content: "This is **bold** and *italic* text." },
    ]);

    const para = result.content.find((n) => n.type === "paragraph");
    const nodes = para!.content as { text?: string; marks?: { type: string }[] }[];
    const bold = nodes.find(
      (n) => n.marks?.some((m) => m.type === "bold")
    );
    expect(bold).toBeDefined();
    expect(bold!.text).toBe("bold");
  });

  it("handles code blocks", () => {
    const result = markdownToTiptap([
      { heading: "Code", content: "```js\nconsole.log('hi');\n```" },
    ]);

    const codeBlock = result.content.find((n) => n.type === "codeBlock");
    expect(codeBlock).toBeDefined();
    expect(codeBlock!.attrs).toMatchObject({ language: "js" });
  });

  it("handles ordered and unordered lists", () => {
    const result = markdownToTiptap([
      { heading: "Lists", content: "- Item A\n- Item B\n\n1. First\n2. Second" },
    ]);

    const types = result.content.map((n) => n.type);
    expect(types).toContain("bulletList");
    expect(types).toContain("orderedList");
  });

  it("handles tables", () => {
    const result = markdownToTiptap([
      {
        heading: "Data",
        content: "| Name | Value |\n|------|-------|\n| A | 1 |\n| B | 2 |",
      },
    ]);

    const table = result.content.find((n) => n.type === "table");
    expect(table).toBeDefined();
    const rows = table!.content as { type: string }[];
    expect(rows.length).toBe(3); // header + 2 body rows
  });

  it("converts [video:MM:SS] into timestampLink nodes", () => {
    const result = markdownToTiptap([
      { heading: "Demo", content: "See the demo at [video:02:30] for details." },
    ]);

    const para = result.content.find((n) => n.type === "paragraph");
    const nodes = para!.content as { type: string; attrs?: { seconds: number } }[];
    const tsLink = nodes.find((n) => n.type === "timestampLink");
    expect(tsLink).toBeDefined();
    expect(tsLink!.attrs!.seconds).toBe(150);
  });
});

describe("markdownToTiptapRaw", () => {
  it("returns doc and plain text", () => {
    const { doc, text } = markdownToTiptapRaw("# Hello\n\nWorld");
    expect(doc.type).toBe("doc");
    expect(text).toContain("Hello");
    expect(text).toContain("World");
  });

  it("handles callout blocks", () => {
    const md = ":::note\nThis is important.\n:::";
    const { doc } = markdownToTiptapRaw(md);
    const callout = doc.content.find((n) => n.type === "callout");
    expect(callout).toBeDefined();
    expect(callout!.attrs).toMatchObject({ type: "info" });
  });

  it("handles steps blocks", () => {
    const md = ":::steps\n### Step One\nDo this.\n### Step Two\nDo that.\n:::";
    const { doc } = markdownToTiptapRaw(md);
    const steps = doc.content.find((n) => n.type === "steps");
    expect(steps).toBeDefined();
    const stepNodes = steps!.content as { type: string; attrs?: { title: string } }[];
    expect(stepNodes.length).toBe(2);
    expect(stepNodes[0].attrs!.title).toBe("Step One");
    expect(stepNodes[1].attrs!.title).toBe("Step Two");
  });

  it("handles tab blocks", () => {
    const md = ':::tabs\n::tab{title="JS"}\nconsole.log("hi");\n::tab{title="Python"}\nprint("hi")\n:::';
    const { doc } = markdownToTiptapRaw(md);
    const tabGroup = doc.content.find((n) => n.type === "tabGroup");
    expect(tabGroup).toBeDefined();
    const tabs = tabGroup!.content as { type: string; attrs?: { title: string } }[];
    expect(tabs.length).toBe(2);
    expect(tabs[0].attrs!.title).toBe("JS");
  });

  it("handles project-video blocks", () => {
    const md =
      "[project-video:123e4567-e89b-12d3-a456-426614174000]";
    const { doc } = markdownToTiptapRaw(md);
    const video = doc.content.find((n) => n.type === "projectVideo");
    expect(video).toBeDefined();
    expect(video!.attrs).toMatchObject({
      videoId: "123e4567-e89b-12d3-a456-426614174000",
    });
  });

  it("extracts plain text without formatting artifacts", () => {
    const { text } = markdownToTiptapRaw(
      "# Title\n\nSome **bold** text with `code` and a [link](http://example.com)."
    );
    expect(text).toContain("Title");
    expect(text).toContain("bold");
    expect(text).toContain("code");
    expect(text).toContain("link");
    expect(text).not.toContain("**");
    expect(text).not.toContain("`");
  });
});
