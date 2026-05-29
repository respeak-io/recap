import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseManifest, validateManifest } from "../src/sync/manifest.js";

// --- temp docs folder fixture ---
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "recap-manifest-"));
  mkdirSync(path.join(dir, "en/01_getting-started"), { recursive: true });
  writeFileSync(path.join(dir, "en/01_getting-started/_index.md"), "# Intro\n");
  writeFileSync(path.join(dir, "en/01_getting-started/01_sign-in.md"), "# Sign In\n");
  writeFileSync(path.join(dir, "en/01_getting-started/99_orphan.md"), "# Orphan\n");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function manifest(chapters: unknown[], extra: Record<string, unknown> = {}) {
  return parseManifest(
    JSON.stringify({ project_slug: "respeak", languages: ["en"], chapters, ...extra }),
  );
}

describe("parseManifest", () => {
  it("rejects invalid JSON", () => {
    expect(() => parseManifest("{not json")).toThrow(/not valid JSON/);
  });

  it("rejects a manifest missing required fields", () => {
    expect(() => parseManifest(JSON.stringify({ chapters: [] }))).toThrow(/failed validation/);
  });

  it("applies the default languages when omitted", () => {
    const m = parseManifest(JSON.stringify({ project_slug: "x", chapters: [] }));
    expect(m.languages).toEqual(["en", "de"]);
  });
});

describe("validateManifest", () => {
  it("passes (no errors) when every referenced file exists, warning on orphans", () => {
    const m = manifest([
      {
        slug: "getting-started",
        title: "Getting Started",
        content: { en: "en/01_getting-started/_index.md" },
        articles: [
          {
            slug: "sign-in",
            en: { title: "Sign In", file: "en/01_getting-started/01_sign-in.md" },
          },
        ],
      },
    ]);
    const report = validateManifest(m, dir);
    expect(report.errors).toEqual([]);
    // 99_orphan.md is on disk but not referenced -> one warning.
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain("99_orphan.md");
  });

  it("reports an error for a referenced file that is missing on disk", () => {
    const m = manifest([
      {
        slug: "getting-started",
        title: "Getting Started",
        content: { en: "en/01_getting-started/_index.md" },
        articles: [
          {
            slug: "missing",
            en: { title: "Missing", file: "en/01_getting-started/does-not-exist.md" },
          },
        ],
      },
    ]);
    const report = validateManifest(m, dir);
    expect(report.errors.some((e) => e.includes("does-not-exist.md"))).toBe(true);
  });

  it("reports an error for a missing chapter content file", () => {
    const m = manifest([
      {
        slug: "ghost",
        title: "Ghost",
        content: { en: "en/ghost/_index.md" },
        articles: [],
      },
    ]);
    const report = validateManifest(m, dir);
    expect(report.errors.some((e) => e.includes("en/ghost/_index.md"))).toBe(true);
  });

  it("reports an error for a malformed per-language article entry", () => {
    const m = manifest([
      {
        slug: "getting-started",
        title: "Getting Started",
        content: { en: "en/01_getting-started/_index.md" },
        // `en` article entry is missing the required `file` field.
        articles: [{ slug: "broken", en: { title: "No File" } }],
      },
    ]);
    const report = validateManifest(m, dir);
    expect(report.errors.some((e) => e.includes("Invalid article 'broken'"))).toBe(true);
  });
});
