import { describe, it, expect } from "vitest";
import { extractHeadings } from "@/lib/extract-headings";

describe("extractHeadings", () => {
  it("returns empty array for empty content", () => {
    expect(extractHeadings({})).toEqual([]);
    expect(extractHeadings({ content: [] })).toEqual([]);
  });

  it("extracts a single heading", () => {
    const result = extractHeadings({
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Getting Started" }],
        },
      ],
    });
    expect(result).toEqual([
      { id: "getting-started", text: "Getting Started", level: 2 },
    ]);
  });

  it("extracts multiple headings at different levels", () => {
    const result = extractHeadings({
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Overview" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Some text" }] },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Details" }],
        },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "overview", text: "Overview", level: 2 });
    expect(result[1]).toEqual({ id: "details", text: "Details", level: 3 });
  });

  it("concatenates text from multiple inline nodes", () => {
    const result = extractHeadings({
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "World" },
          ],
        },
      ],
    });
    expect(result[0].text).toBe("Hello World");
    expect(result[0].id).toBe("hello-world");
  });

  it("defaults to level 2 when attrs.level is missing", () => {
    const result = extractHeadings({
      content: [
        {
          type: "heading",
          content: [{ type: "text", text: "No Level" }],
        },
      ],
    });
    expect(result[0].level).toBe(2);
  });

  it("ignores non-heading nodes", () => {
    const result = extractHeadings({
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Not a heading" }] },
        { type: "codeBlock", content: [{ type: "text", text: "code" }] },
        { type: "bulletList", content: [] },
      ],
    });
    expect(result).toEqual([]);
  });

  it("skips headings with no content", () => {
    const result = extractHeadings({
      content: [{ type: "heading", attrs: { level: 2 } }],
    });
    expect(result).toEqual([]);
  });

  it("generates slugified IDs with special characters removed", () => {
    const result = extractHeadings({
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "What's New in v2.0?" }],
        },
      ],
    });
    expect(result[0].id).toBe("whats-new-in-v20");
  });

  it("handles inline nodes with undefined text", () => {
    const result = extractHeadings({
      content: [
        {
          type: "heading",
          attrs: { level: 3 },
          content: [
            { type: "text", text: "Before " },
            { type: "timestampLink" },
            { type: "text", text: " After" },
          ],
        },
      ],
    });
    expect(result[0].text).toBe("Before  After");
  });
});
