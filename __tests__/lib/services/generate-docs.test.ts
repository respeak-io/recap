import { describe, it, expect } from "vitest";
import { sanitizeJsonResponse } from "@/lib/services/video-pipeline/utils";

describe("sanitizeJsonResponse", () => {
  it("passes through clean JSON unchanged", () => {
    const input = '{"title": "Hello"}';
    expect(sanitizeJsonResponse(input)).toBe(input);
  });

  it("preserves newlines, tabs, and carriage returns", () => {
    const input = '{"text": "line1\\nline2\\ttab"}';
    expect(sanitizeJsonResponse(input)).toBe(input);
  });

  it("strips NUL and other control characters", () => {
    const input = '{"text": "hello\x00world\x01!"}';
    const result = sanitizeJsonResponse(input);
    expect(result).toBe('{"text": "helloworld!"}');
    expect(result).not.toContain("\x00");
    expect(result).not.toContain("\x01");
  });

  it("strips DEL character", () => {
    const input = "test\x7fvalue";
    expect(sanitizeJsonResponse(input)).toBe("testvalue");
  });

  it("produces parseable JSON after sanitization", () => {
    const input = '{"chapters": [{"title": "Intro\x00\x02"}]}';
    const sanitized = sanitizeJsonResponse(input);
    expect(() => JSON.parse(sanitized)).not.toThrow();
    expect(JSON.parse(sanitized).chapters[0].title).toBe("Intro");
  });
});
