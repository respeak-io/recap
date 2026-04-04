import { describe, it, expect } from "vitest";
import { segmentsToVtt } from "@/lib/vtt";

describe("segmentsToVtt", () => {
  it("generates valid WEBVTT with header", () => {
    const result = segmentsToVtt([]);
    expect(result).toBe("WEBVTT\n\n");
  });

  it("formats a single segment correctly", () => {
    const result = segmentsToVtt([
      { start_time: 0, end_time: 5, spoken_content: "Hello world" },
    ]);
    expect(result).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello world\n\n");
  });

  it("formats multiple segments", () => {
    const result = segmentsToVtt([
      { start_time: 0, end_time: 3.5, spoken_content: "First" },
      { start_time: 3.5, end_time: 10, spoken_content: "Second" },
    ]);
    expect(result).toContain("00:00:00.000 --> 00:00:03.500\nFirst");
    expect(result).toContain("00:00:03.500 --> 00:00:10.000\nSecond");
  });

  it("handles times over an hour", () => {
    const result = segmentsToVtt([
      { start_time: 3661.5, end_time: 3700, spoken_content: "Late" },
    ]);
    expect(result).toContain("01:01:01.500 --> 01:01:40.000");
  });
});
