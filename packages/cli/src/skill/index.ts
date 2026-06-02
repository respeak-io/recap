import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Where `--update` writes by default — the conventional skill location. */
export const DEFAULT_SKILL_PATH = ".claude/skills/recap/SKILL.md";

const VERSION_TOKEN = "{{RECAP_VERSION}}";

/**
 * Walk up from this module to the `@respeak/recap` package root (the directory
 * holding its package.json). Works both in dev (`dist/src/skill/index.js`) and
 * in the published package, where the CLI's package.json is the first one found.
 */
function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("could not locate the @respeak/recap package root");
}

/**
 * The canonical agent skill, with `{{RECAP_VERSION}}` replaced by the installed
 * CLI version so a version bump shows up as drift in `--check`. This is the
 * single source of truth repos pull from.
 */
export async function renderSkill(): Promise<string> {
  const root = packageRoot();
  const md = await readFile(path.join(root, "skill", "SKILL.md"), "utf-8");
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf-8")) as {
    version: string;
  };
  return md.split(VERSION_TOKEN).join(pkg.version);
}

const normalize = (s: string): string => s.replace(/\s+$/, "");

export async function printSkill(): Promise<void> {
  process.stdout.write(await renderSkill());
}

/** True when `target` matches the canonical skill (ignoring trailing whitespace). */
export async function checkSkill(target: string): Promise<boolean> {
  if (!existsSync(target)) return false;
  const [canonical, current] = await Promise.all([
    renderSkill(),
    readFile(target, "utf-8"),
  ]);
  return normalize(current) === normalize(canonical);
}

export async function updateSkill(target: string): Promise<void> {
  const canonical = await renderSkill();
  await mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await writeFile(target, normalize(canonical) + "\n", "utf-8");
}
