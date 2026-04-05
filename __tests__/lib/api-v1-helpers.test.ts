import { describe, it, expect } from "vitest";
import { toSlug } from "@/lib/api-v1-helpers";

describe("toSlug", () => {
  it("converts a simple title to lowercase slug", () => {
    expect(toSlug("Getting Started")).toBe("getting-started");
  });

  it("removes special characters", () => {
    expect(toSlug("What's New?")).toBe("whats-new");
  });

  it("handles multiple spaces", () => {
    expect(toSlug("Hello   World")).toBe("hello-world");
  });

  it("strips leading/trailing whitespace", () => {
    expect(toSlug("  Trimmed  ")).toBe("trimmed");
  });

  it("handles already-slugified input", () => {
    expect(toSlug("already-a-slug")).toBe("already-a-slug");
  });

  it("handles numbers and mixed case", () => {
    expect(toSlug("Chapter 1: The Beginning")).toBe("chapter-1-the-beginning");
  });

  it("handles unicode characters", () => {
    const result = toSlug("Über Cool Feature");
    expect(result).toBe("uber-cool-feature");
  });

  it("handles empty string", () => {
    expect(toSlug("")).toBe("");
  });

  it("handles ampersands", () => {
    const result = toSlug("Q&A Section");
    expect(result).toMatch(/^q.*a-section$/);
    expect(result).not.toContain("&");
  });
});
