import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface AudioClip {
  path: string;
  startAt: number; // ms offset in the video
}

export interface MergeInput {
  videoPath: string;
  audioClips: AudioClip[];
  outputPath: string;
}

export interface MergeCommand {
  binary: string;
  args: string[];
}

export function buildMergeCommand(input: MergeInput): MergeCommand {
  const { videoPath, audioClips, outputPath } = input;

  if (audioClips.length === 0) {
    return {
      binary: "ffmpeg",
      args: ["-y", "-i", videoPath, "-c:v", "libx264", "-an", outputPath],
    };
  }

  const args: string[] = ["-y"];

  // Input: video
  args.push("-i", videoPath);

  // Inputs: each audio clip
  for (const clip of audioClips) {
    args.push("-i", clip.path);
  }

  // Build filter_complex to delay and mix audio clips
  const audioFilters: string[] = [];
  const mixInputs: string[] = [];

  for (let i = 0; i < audioClips.length; i++) {
    const inputIdx = i + 1; // 0 is video
    const delay = audioClips[i].startAt;
    const label = `a${i}`;
    audioFilters.push(`[${inputIdx}:a]adelay=${delay}|${delay}[${label}]`);
    mixInputs.push(`[${label}]`);
  }

  const mixFilter = `${mixInputs.join("")}amix=inputs=${audioClips.length}:duration=longest[aout]`;
  const fullFilter = [...audioFilters, mixFilter].join(";");

  args.push("-filter_complex", fullFilter);
  args.push("-map", "0:v");
  args.push("-map", "[aout]");
  args.push("-c:v", "libx264");
  args.push("-c:a", "aac");
  // Do NOT use -shortest: if narration extends beyond video, ffmpeg will
  // hold the last video frame (still frame padding) which matches the spec.
  args.push(outputPath);

  return { binary: "ffmpeg", args };
}

export async function checkFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function mergeAudioVideo(input: MergeInput): Promise<void> {
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    throw new Error(
      "ffmpeg not found. Install it:\n" +
      "  macOS: brew install ffmpeg\n" +
      "  Ubuntu: sudo apt install ffmpeg\n" +
      "  Windows: https://ffmpeg.org/download.html"
    );
  }

  const cmd = buildMergeCommand(input);
  try {
    await execFileAsync(cmd.binary, cmd.args, { timeout: 300_000 });
  } catch (err) {
    throw new Error(
      `ffmpeg merge failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
