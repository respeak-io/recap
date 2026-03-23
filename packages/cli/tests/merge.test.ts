import { describe, it, expect } from "vitest";
import { buildMergeCommand } from "../src/produce/merge.js";

describe("buildMergeCommand", () => {
  it("builds ffmpeg command with audio clips at correct timestamps", () => {
    const cmd = buildMergeCommand({
      videoPath: "input.webm",
      audioClips: [
        { path: "step0.mp3", startAt: 0 },
        { path: "step1.mp3", startAt: 3200 },
        { path: "step2.mp3", startAt: 5600 },
      ],
      outputPath: "output.mp4",
    });

    expect(cmd.binary).toBe("ffmpeg");
    expect(cmd.args).toContain("-i");
    expect(cmd.args).toContain("input.webm");
    expect(cmd.args).toContain("output.mp4");
    const filterArg = cmd.args[cmd.args.indexOf("-filter_complex") + 1];
    expect(filterArg).toContain("adelay=0");
    expect(filterArg).toContain("adelay=3200");
    expect(filterArg).toContain("adelay=5600");
  });

  it("handles single audio clip", () => {
    const cmd = buildMergeCommand({
      videoPath: "input.webm",
      audioClips: [{ path: "step0.mp3", startAt: 0 }],
      outputPath: "output.mp4",
    });

    expect(cmd.binary).toBe("ffmpeg");
    expect(cmd.args).toContain("output.mp4");
  });

  it("handles empty audio clips (video-only output)", () => {
    const cmd = buildMergeCommand({
      videoPath: "input.webm",
      audioClips: [],
      outputPath: "output.mp4",
    });

    expect(cmd.args).toContain("-i");
    expect(cmd.args).toContain("input.webm");
    expect(cmd.args).toContain("output.mp4");
    expect(cmd.args).toContain("-an");
  });

  it("does not include -shortest flag", () => {
    const cmd = buildMergeCommand({
      videoPath: "input.webm",
      audioClips: [{ path: "step0.mp3", startAt: 0 }],
      outputPath: "output.mp4",
    });

    expect(cmd.args).not.toContain("-shortest");
  });
});
