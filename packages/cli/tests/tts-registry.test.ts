import { describe, it, expect } from "vitest";
import { getProvider } from "../src/produce/tts/registry.js";

describe("TTS registry", () => {
  it("returns google provider", () => {
    const provider = getProvider("google");
    expect(provider).toBeDefined();
    expect(typeof provider.synthesize).toBe("function");
  });

  it("returns openai provider", () => {
    const provider = getProvider("openai");
    expect(provider).toBeDefined();
    expect(typeof provider.synthesize).toBe("function");
  });

  it("returns elevenlabs provider", () => {
    const provider = getProvider("elevenlabs");
    expect(provider).toBeDefined();
    expect(typeof provider.synthesize).toBe("function");
  });

  it("throws for unknown provider", () => {
    expect(() => getProvider("unknown")).toThrow("Unknown TTS provider");
  });
});
