import { describe, it, expect } from "vitest";
import {
  MAX_VIDEO_SIZE,
  MAX_IMAGE_SIZE,
  MAX_ASSET_SIZE,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_IMAGE_TYPES,
  VIDEO_MIME_TO_EXT,
} from "@/lib/constants";

describe("upload constants", () => {
  it("video size is 25MB", () => {
    expect(MAX_VIDEO_SIZE).toBe(25 * 1024 * 1024);
  });

  it("image size is 10MB", () => {
    expect(MAX_IMAGE_SIZE).toBe(10 * 1024 * 1024);
  });

  it("asset size is 2MB", () => {
    expect(MAX_ASSET_SIZE).toBe(2 * 1024 * 1024);
  });

  it("video types include mp4 and webm", () => {
    expect(ALLOWED_VIDEO_TYPES).toContain("video/mp4");
    expect(ALLOWED_VIDEO_TYPES).toContain("video/webm");
  });

  it("image types include common formats", () => {
    expect(ALLOWED_IMAGE_TYPES).toContain("image/png");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/jpeg");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/webp");
  });

  it("MIME to ext mappings are correct", () => {
    expect(VIDEO_MIME_TO_EXT["video/mp4"]).toBe("mp4");
    expect(VIDEO_MIME_TO_EXT["video/webm"]).toBe("webm");
    expect(VIDEO_MIME_TO_EXT["video/quicktime"]).toBe("mov");
  });
});
