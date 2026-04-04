import { describe, it, expect } from "vitest";
import { validateVideoFile, validateImageFile } from "@/lib/services/upload";

function makeFile(name: string, type: string, size: number): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe("validateVideoFile", () => {
  it("accepts valid mp4", () => {
    expect(validateVideoFile(makeFile("test.mp4", "video/mp4", 1000))).toBeNull();
  });

  it("accepts valid webm", () => {
    expect(validateVideoFile(makeFile("test.webm", "video/webm", 1000))).toBeNull();
  });

  it("accepts valid quicktime", () => {
    expect(
      validateVideoFile(makeFile("test.mov", "video/quicktime", 1000))
    ).toBeNull();
  });

  it("rejects non-video MIME type", () => {
    const result = validateVideoFile(makeFile("test.txt", "text/plain", 1000));
    expect(result).toContain("video");
  });

  it("rejects oversized file", () => {
    const result = validateVideoFile(
      makeFile("big.mp4", "video/mp4", 26 * 1024 * 1024)
    );
    expect(result).toContain("too large");
  });

  it("accepts file exactly at size limit", () => {
    expect(
      validateVideoFile(makeFile("max.mp4", "video/mp4", 25 * 1024 * 1024))
    ).toBeNull();
  });
});

describe("validateImageFile", () => {
  it("accepts valid png", () => {
    expect(validateImageFile(makeFile("test.png", "image/png", 1000))).toBeNull();
  });

  it("accepts valid jpeg", () => {
    expect(
      validateImageFile(makeFile("test.jpg", "image/jpeg", 1000))
    ).toBeNull();
  });

  it("accepts valid svg", () => {
    expect(
      validateImageFile(makeFile("test.svg", "image/svg+xml", 1000))
    ).toBeNull();
  });

  it("rejects non-image MIME type", () => {
    const result = validateImageFile(makeFile("test.pdf", "application/pdf", 1000));
    expect(result).toContain("image");
  });

  it("rejects oversized file", () => {
    const result = validateImageFile(
      makeFile("big.png", "image/png", 11 * 1024 * 1024)
    );
    expect(result).toContain("too large");
  });
});
