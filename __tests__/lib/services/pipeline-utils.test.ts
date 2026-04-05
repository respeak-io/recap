import { describe, it, expect } from "vitest";
import { sanitizeJsonResponse } from "@/lib/services/video-pipeline/utils";

describe("sanitizeJsonResponse edge cases", () => {
  it("handles empty string", () => {
    expect(sanitizeJsonResponse("")).toBe("");
  });

  it("preserves actual newlines in JSON strings", () => {
    const input = '{"text": "line1\nline2\nline3"}';
    expect(sanitizeJsonResponse(input)).toBe(input);
  });

  it("preserves tabs in JSON", () => {
    const input = '{"text": "col1\tcol2"}';
    expect(sanitizeJsonResponse(input)).toBe(input);
  });

  it("strips all control chars from 0x01 to 0x1f except newline/tab/cr", () => {
    let input = "";
    for (let i = 0; i <= 0x1f; i++) {
      input += String.fromCharCode(i);
    }
    const result = sanitizeJsonResponse(input);
    // Should only contain \t (0x09), \n (0x0a), \r (0x0d)
    expect(result).toBe("\t\n\r");
  });

  it("handles large JSON without issues", () => {
    const bigContent = "x".repeat(100000);
    const input = `{"data": "${bigContent}"}`;
    const result = sanitizeJsonResponse(input);
    expect(result).toBe(input);
  });

  it("handles multiple embedded NUL characters", () => {
    const input = "a\x00b\x00c\x00d";
    expect(sanitizeJsonResponse(input)).toBe("abcd");
  });

  it("handles mixed valid and invalid control chars", () => {
    const input = "hello\x00\tworld\x01\nfoo\x7fbar";
    expect(sanitizeJsonResponse(input)).toBe("hello\tworld\nfoobar");
  });
});
