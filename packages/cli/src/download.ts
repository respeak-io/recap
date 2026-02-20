import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const YOUTUBE_PATTERNS = [
  /youtube\.com\/watch/,
  /youtu\.be\//,
  /youtube\.com\/shorts/,
];

export function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_PATTERNS.some((p) => p.test(url));
}

export async function downloadYouTube(url: string): Promise<string> {
  const outPath = join(tmpdir(), `reeldocs-${randomUUID()}.mp4`);

  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
        "--merge-output-format", "mp4",
        "-o", outPath,
        url,
      ],
      { timeout: 300_000 },
      (err, _stdout, stderr) => {
        if (err) {
          if (stderr?.includes("is not recognized") || stderr?.includes("not found")) {
            reject(new Error("yt-dlp not found. Install it: https://github.com/yt-dlp/yt-dlp#installation"));
          } else {
            reject(new Error(`yt-dlp failed: ${stderr || err.message}`));
          }
        } else {
          resolve(outPath);
        }
      }
    );
  });
}
