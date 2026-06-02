import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderSkill, checkSkill, updateSkill, DEFAULT_SKILL_PATH } from "../src/skill/index.js";

const pkgVersion = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf-8"),
).version as string;

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "recap-skill-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("renderSkill", () => {
  it("keeps frontmatter at the top and substitutes the version token", async () => {
    const md = await renderSkill();
    expect(md.startsWith("---\nname: recap-docs-sync")).toBe(true);
    expect(md).not.toContain("{{RECAP_VERSION}}");
    expect(md).toContain(`@respeak/recap v${pkgVersion}`);
  });

  it("defaults to the conventional skill path", () => {
    expect(DEFAULT_SKILL_PATH).toBe(".claude/skills/recap/SKILL.md");
  });
});

describe("checkSkill / updateSkill", () => {
  it("reports drift for a missing file", async () => {
    expect(await checkSkill(path.join(dir, "nope.md"))).toBe(false);
  });

  it("round-trips: update then check is in sync", async () => {
    const target = path.join(dir, "skill.md");
    await updateSkill(target);
    expect(await checkSkill(target)).toBe(true);
  });

  it("creates intermediate directories on update", async () => {
    const target = path.join(dir, "deep", "nested", "SKILL.md");
    await updateSkill(target);
    expect(await checkSkill(target)).toBe(true);
  });

  it("detects drift after an edit", async () => {
    const target = path.join(dir, "skill.md");
    await updateSkill(target);
    await writeFile(target, (await readFile(target, "utf-8")) + "\nstale\n");
    expect(await checkSkill(target)).toBe(false);
  });
});
