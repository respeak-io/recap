import { describe, it, expect, vi } from "vitest";

// Mock the generate module to avoid transitive import of reeldocs/ai
vi.mock("@/lib/ai/generate", () => ({
  generateText: vi.fn().mockResolvedValue("mocked"),
}));

const { getTranslationPrompt, getVttTranslationPrompt } = await import(
  "@/lib/ai/translate"
);

describe("getTranslationPrompt", () => {
  it("includes target language", () => {
    const prompt = getTranslationPrompt("German", "Hello world");
    expect(prompt).toContain("German");
  });

  it("includes the content to translate", () => {
    const prompt = getTranslationPrompt("French", "Some documentation text");
    expect(prompt).toContain("Some documentation text");
  });

  it("instructs to preserve formatting and code", () => {
    const prompt = getTranslationPrompt("Spanish", "test");
    expect(prompt).toContain("formatting");
    expect(prompt).toContain("code snippets");
  });

  it("instructs to preserve timestamp references", () => {
    const prompt = getTranslationPrompt("Japanese", "test");
    expect(prompt).toContain("[video:MM:SS]");
  });
});

describe("getVttTranslationPrompt", () => {
  it("includes target language", () => {
    const prompt = getVttTranslationPrompt(
      "German",
      "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello"
    );
    expect(prompt).toContain("German");
  });

  it("includes the VTT content", () => {
    const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello world";
    const prompt = getVttTranslationPrompt("French", vtt);
    expect(prompt).toContain(vtt);
  });

  it("instructs to preserve timestamps", () => {
    const prompt = getVttTranslationPrompt("Spanish", "WEBVTT");
    expect(prompt).toContain("timestamps");
  });
});
