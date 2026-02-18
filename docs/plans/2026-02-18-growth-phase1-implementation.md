# Phase 1 Growth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Get Reeldocs from 0 to 100 GitHub stars by building a zero-setup CLI, example gallery, and polished repo — then launching.

**Architecture:** Extract the Gemini video processing pipeline from the Next.js app into a standalone `packages/cli` package. The CLI accepts a video URL or local file, processes it through Gemini, and outputs Markdown/MDX files. No Supabase dependency. The existing web app continues to work unchanged — it just imports from the same shared core.

**Tech Stack:** TypeScript, `@google/genai`, `commander` (CLI framework), `yt-dlp` (YouTube download), `marked` (Markdown parsing), `open` (preview in browser)

---

### Task 1: Set up monorepo structure with packages/cli

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts` (entry point, placeholder)
- Modify: `package.json` (root — add `workspaces`)
- Modify: `tsconfig.json` (root — add path alias)

**Step 1: Create packages/cli directory and package.json**

```json
{
  "name": "reeldocs",
  "version": "0.1.0",
  "description": "Generate documentation from product videos",
  "bin": {
    "reeldocs": "./dist/index.js"
  },
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "files": ["dist"],
  "keywords": ["documentation", "video", "ai", "docs", "generator", "cli"],
  "license": "AGPL-3.0",
  "dependencies": {
    "@google/genai": "^1.40.0",
    "commander": "^13.0.0",
    "marked": "^17.0.1",
    "ora": "^8.0.0",
    "slugify": "^1.6.6"
  },
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "^5"
  }
}
```

**Step 2: Create tsconfig.json for the CLI package**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

**Step 3: Create placeholder entry point**

`packages/cli/src/index.ts`:

```typescript
#!/usr/bin/env node
console.log("reeldocs CLI — coming soon");
```

**Step 4: Update root package.json to add pnpm workspaces**

Add to root `package.json`:
```json
{
  "workspaces": ["packages/*"]
}
```

Also create `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

**Step 5: Install dependencies and verify**

Run: `cd packages/cli && pnpm install`
Run: `pnpm build`
Run: `node dist/index.js`
Expected: prints "reeldocs CLI — coming soon"

**Step 6: Commit**

```bash
git add packages/cli pnpm-workspace.yaml package.json
git commit --no-gpg-sign -m "feat: scaffold packages/cli for reeldocs CLI"
```

---

### Task 2: Extract core AI pipeline into packages/cli

Port `gemini.ts`, `prompts.ts`, and the processing logic into the CLI package, removing all Supabase dependencies.

**Files:**
- Create: `packages/cli/src/ai/gemini.ts`
- Create: `packages/cli/src/ai/prompts.ts`
- Create: `packages/cli/src/ai/pipeline.ts` (orchestrator)

**Step 1: Create gemini.ts (standalone, no Supabase)**

`packages/cli/src/ai/gemini.ts` — port from `lib/ai/gemini.ts` but accept a local file path or URL directly:

```typescript
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import { readFile } from "node:fs/promises";

let _ai: GoogleGenAI | null = null;

export function initAI(apiKey: string) {
  _ai = new GoogleGenAI({ apiKey });
}

export function getAI(): GoogleGenAI {
  if (!_ai) throw new Error("Call initAI(apiKey) first");
  return _ai;
}

export async function uploadVideo(source: string): Promise<{ uri: string; mimeType: string }> {
  const ai = getAI();

  let blob: Blob;
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
    blob = await res.blob();
  } else {
    const buffer = await readFile(source);
    blob = new Blob([buffer], { type: "video/mp4" });
  }

  const upload = await ai.files.upload({
    file: blob,
    config: { mimeType: "video/mp4" },
  });

  let info = await ai.files.get({ name: upload.name! });
  while (info.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 5000));
    info = await ai.files.get({ name: upload.name! });
  }

  if (info.state === "FAILED") throw new Error("Gemini video processing failed");

  return { uri: info.uri!, mimeType: info.mimeType! };
}

export async function extractVideoContent(fileUri: string, fileMimeType: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(fileUri, fileMimeType),
      `Analyze this video and return a JSON array of segments. Each segment should cover a logical section of the video (30-120 seconds each).

For each segment provide:
- "start_time": start in seconds (number)
- "end_time": end in seconds (number)
- "spoken_content": what is being said (transcription)
- "visual_context": what is visually happening on screen (UI elements, code, clicks, navigation)
- "topic": a short title for this segment

Return ONLY valid JSON, no markdown fences.`,
    ]),
    config: { responseMimeType: "application/json" },
  });

  return JSON.parse(response.text!);
}
```

**Step 2: Create prompts.ts**

`packages/cli/src/ai/prompts.ts` — copy from `lib/ai/prompts.ts` as-is (it has no dependencies):

```typescript
export function getDocGenerationPrompt(segments: Record<string, unknown>[]) {
  // ... exact copy from lib/ai/prompts.ts
}
```

**Step 3: Create pipeline.ts (the orchestrator)**

`packages/cli/src/ai/pipeline.ts`:

```typescript
import { initAI, uploadVideo, extractVideoContent, getAI } from "./gemini.js";
import { getDocGenerationPrompt } from "./prompts.js";

export interface Segment {
  start_time: number;
  end_time: number;
  spoken_content: string;
  visual_context: string;
  topic: string;
}

export interface Section {
  heading: string;
  content: string;
  timestamp_ref?: string;
}

export interface Chapter {
  title: string;
  sections: Section[];
}

export interface GeneratedDoc {
  title: string;
  chapters: Chapter[];
  segments: Segment[];
}

export interface PipelineCallbacks {
  onProgress?: (step: string, message: string) => void;
}

export async function processVideo(
  source: string,
  apiKey: string,
  callbacks?: PipelineCallbacks
): Promise<GeneratedDoc> {
  const log = callbacks?.onProgress ?? (() => {});

  initAI(apiKey);

  log("upload", "Uploading video to Gemini...");
  const { uri, mimeType } = await uploadVideo(source);

  log("extract", "Extracting content from video...");
  const segments: Segment[] = await extractVideoContent(uri, mimeType);

  log("generate", "Generating documentation...");
  const prompt = getDocGenerationPrompt(segments);
  const response = await getAI().models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });

  const doc = JSON.parse(response.text!);

  return { title: doc.title, chapters: doc.chapters, segments };
}
```

**Step 4: Verify it compiles**

Run: `cd packages/cli && pnpm build`
Expected: compiles with no errors

**Step 5: Commit**

```bash
git add packages/cli/src/ai
git commit --no-gpg-sign -m "feat(cli): extract standalone AI pipeline from web app"
```

---

### Task 3: Build the CLI command interface

Wire up `commander` to create the main `reeldocs` command with options for output format and directory.

**Files:**
- Modify: `packages/cli/src/index.ts` (replace placeholder)
- Create: `packages/cli/src/output/markdown.ts` (Markdown file writer)

**Step 1: Create the Markdown output writer**

`packages/cli/src/output/markdown.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import slugify from "slugify";
import type { GeneratedDoc } from "../ai/pipeline.js";

export async function writeMarkdown(doc: GeneratedDoc, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];

  for (const chapter of doc.chapters) {
    const slug = slugify(chapter.title, { lower: true, strict: true });
    const filename = `${slug}.md`;
    const filepath = join(outDir, filename);

    const lines: string[] = [];
    lines.push(`# ${chapter.title}\n`);

    for (const section of chapter.sections) {
      lines.push(`## ${section.heading}\n`);
      lines.push(section.content);
      lines.push("");
    }

    await writeFile(filepath, lines.join("\n"), "utf-8");
    written.push(filepath);
  }

  return written;
}
```

**Step 2: Build the CLI entry point**

`packages/cli/src/index.ts`:

```typescript
#!/usr/bin/env node

import { Command } from "commander";
import ora from "ora";
import { processVideo } from "./ai/pipeline.js";
import { writeMarkdown } from "./output/markdown.js";

const program = new Command();

program
  .name("reeldocs")
  .description("Generate documentation from product videos")
  .version("0.1.0")
  .argument("<source>", "Video file path or URL")
  .option("-o, --output <dir>", "Output directory", "./docs")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY env var)")
  .option("-f, --format <format>", "Output format: markdown, mdx", "markdown")
  .action(async (source: string, opts: { output: string; apiKey?: string; format: string }) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Starting...").start();

    try {
      const doc = await processVideo(source, apiKey, {
        onProgress: (_step, message) => {
          spinner.text = message;
        },
      });

      spinner.text = "Writing files...";
      const files = await writeMarkdown(doc, opts.output);

      spinner.succeed(`Generated ${files.length} doc(s) in ${opts.output}/`);
      console.log();
      for (const f of files) {
        console.log(`  ${f}`);
      }
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Failed");
      process.exit(1);
    }
  });

program.parse();
```

**Step 3: Build and test the CLI smoke-runs**

Run: `cd packages/cli && pnpm build`
Run: `node dist/index.js --help`
Expected: shows help text with `reeldocs <source>` usage

**Step 4: Commit**

```bash
git add packages/cli/src
git commit --no-gpg-sign -m "feat(cli): wire up commander with markdown output"
```

---

### Task 4: Add YouTube URL support via yt-dlp

Allow `npx reeldocs https://youtube.com/watch?v=xyz` to work by detecting YouTube URLs and downloading the video first.

**Files:**
- Create: `packages/cli/src/download.ts`
- Modify: `packages/cli/src/ai/pipeline.ts` (add download step)
- Modify: `packages/cli/package.json` (no new deps — yt-dlp is a system binary)

**Step 1: Create the YouTube downloader**

`packages/cli/src/download.ts`:

```typescript
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
```

**Step 2: Integrate download into the pipeline**

Modify `packages/cli/src/ai/pipeline.ts` — add a resolve step at the top of `processVideo`:

```typescript
import { isYouTubeUrl, downloadYouTube } from "../download.js";
import { unlink } from "node:fs/promises";

// Inside processVideo, before upload:
let videoPath = source;
let tempFile: string | null = null;

if (isYouTubeUrl(source)) {
  log("download", "Downloading video from YouTube...");
  videoPath = await downloadYouTube(source);
  tempFile = videoPath;
}

// ... rest of pipeline uses videoPath instead of source ...

// At the end, clean up temp file:
if (tempFile) {
  await unlink(tempFile).catch(() => {});
}
```

**Step 3: Build and verify**

Run: `cd packages/cli && pnpm build`
Expected: compiles cleanly

**Step 4: Commit**

```bash
git add packages/cli/src/download.ts packages/cli/src/ai/pipeline.ts
git commit --no-gpg-sign -m "feat(cli): add YouTube URL support via yt-dlp"
```

---

### Task 5: Add MDX output format

Support `--format mdx` for Docusaurus/Mintlify users. Adds frontmatter and uses `.mdx` extension.

**Files:**
- Create: `packages/cli/src/output/mdx.ts`
- Modify: `packages/cli/src/index.ts` (wire up format switch)

**Step 1: Create MDX writer**

`packages/cli/src/output/mdx.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import slugify from "slugify";
import type { GeneratedDoc } from "../ai/pipeline.js";

export async function writeMdx(doc: GeneratedDoc, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];

  for (let i = 0; i < doc.chapters.length; i++) {
    const chapter = doc.chapters[i];
    const slug = slugify(chapter.title, { lower: true, strict: true });
    const filename = `${slug}.mdx`;
    const filepath = join(outDir, filename);

    const lines: string[] = [];

    // Frontmatter
    lines.push("---");
    lines.push(`title: "${chapter.title.replace(/"/g, '\\"')}"`);
    lines.push(`sidebar_position: ${i + 1}`);
    lines.push("---");
    lines.push("");

    for (const section of chapter.sections) {
      lines.push(`## ${section.heading}\n`);
      lines.push(section.content);
      lines.push("");
    }

    await writeFile(filepath, lines.join("\n"), "utf-8");
    written.push(filepath);
  }

  return written;
}
```

**Step 2: Wire format switch in index.ts**

Modify the `action` handler in `packages/cli/src/index.ts`:

```typescript
import { writeMdx } from "./output/mdx.js";

// In the action, replace the writeMarkdown call:
let files: string[];
if (opts.format === "mdx") {
  files = await writeMdx(doc, opts.output);
} else {
  files = await writeMarkdown(doc, opts.output);
}
```

**Step 3: Build and verify**

Run: `cd packages/cli && pnpm build`
Run: `node dist/index.js --help`
Expected: shows `-f, --format <format>` option with `markdown, mdx`

**Step 4: Commit**

```bash
git add packages/cli/src/output/mdx.ts packages/cli/src/index.ts
git commit --no-gpg-sign -m "feat(cli): add MDX output format with frontmatter"
```

---

### Task 6: End-to-end test with a real video

Manually verify the full pipeline works before polishing.

**Step 1: Find a short public product video**

Pick a short (<3 min) product video on YouTube. Example: a Vercel deployment walkthrough or Supabase quickstart.

**Step 2: Run the CLI**

```bash
cd packages/cli
GEMINI_API_KEY=<your-key> node dist/index.js "https://www.youtube.com/watch?v=<id>" -o ./test-output
```

**Step 3: Verify output**

- Check `test-output/` has one `.md` file per chapter
- Open the files and verify content makes sense
- Check for `[video:MM:SS]` timestamp references
- Verify section headings and code blocks rendered correctly

**Step 4: Run with MDX format**

```bash
GEMINI_API_KEY=<your-key> node dist/index.js "https://www.youtube.com/watch?v=<id>" -o ./test-output-mdx -f mdx
```

Verify `.mdx` files have frontmatter.

**Step 5: Fix any issues found, then commit**

```bash
git commit --no-gpg-sign -m "fix(cli): adjustments from e2e testing"
```

---

### Task 7: Repo rename and README rewrite

Rename from Recap to Reeldocs across the codebase and write a new README optimized for the "30-second scan."

**Files:**
- Modify: `package.json` (name: "reeldocs")
- Modify: `README.md` (full rewrite)

**Step 1: Update root package.json name**

Change `"name": "recap"` → `"name": "reeldocs"`

**Step 2: Search-and-replace "Recap" → "Reeldocs" across codebase**

Check all files for "Recap" references:
- `README.md`
- `CLAUDE.md`
- `docs/plans/*.md`
- `app/` (any branded UI text)
- `package.json`

Replace user-facing strings. Internal code references (variable names, etc.) can stay.

**Step 3: Rewrite README.md**

The new README should follow this structure (top to bottom):

```markdown
# Reeldocs

Record a product video, get documentation instantly.

> npx reeldocs https://youtube.com/watch?v=xyz

[Hero GIF placeholder — will be recorded in Task 8]

## What It Does

[3 bullet points max]

## Try It Now

[npx command + GEMINI_API_KEY setup — 3 lines]

## Example Output

[Links to gallery — added in Task 9]

## Comparison

| | Reeldocs | Scribe | Tango | Manual |
|---|---|---|---|---|
| Open source | ✅ | ❌ | ❌ | N/A |
| From video | ✅ | ❌ (screenshots) | ❌ (screenshots) | ❌ |
| Self-hosted | ✅ | ❌ | ❌ | N/A |
| Markdown/MDX output | ✅ | ❌ | ❌ | ✅ |
| Free | ✅ | Freemium | Freemium | ✅ |

## Full Platform

[Brief description of the web app with Supabase setup instructions — collapsed in a <details> tag]

## License

AGPL-3.0
```

**Step 4: Add badges to README**

```markdown
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/reeldocs)](https://www.npmjs.com/package/reeldocs)
```

**Step 5: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "feat: rename Recap to Reeldocs, rewrite README"
```

---

### Task 8: Record hero GIF

Create a short GIF/video showing the CLI in action for the README.

**Step 1: Record terminal session**

Use a tool like [VHS](https://github.com/charmbracelet/vhs) or [asciinema](https://asciinema.org/) to record:

```
$ npx reeldocs https://youtube.com/watch?v=xyz
✔ Downloading video from YouTube...
✔ Uploading video to Gemini...
✔ Extracting content from video...
✔ Generating documentation...
✔ Generated 4 doc(s) in ./docs/

  docs/getting-started.md
  docs/configuration.md
  docs/deployment.md
  docs/advanced-usage.md
```

**Step 2: Convert to GIF**

If using VHS, it outputs GIF directly. If using screen recording, convert with `ffmpeg`:

```bash
ffmpeg -i recording.mov -vf "fps=10,scale=800:-1" -loop 0 hero.gif
```

**Step 3: Add to repo and README**

Place at `public/hero.gif` (or host externally for smaller repo size). Update README:

```markdown
![Reeldocs CLI demo](public/hero.gif)
```

**Step 4: Commit**

```bash
git add public/hero.gif README.md
git commit --no-gpg-sign -m "docs: add hero GIF to README"
```

---

### Task 9: Generate example gallery

Run the CLI against 3-5 well-known product videos and publish the output as a gallery.

**Step 1: Pick 3-5 short product videos**

Choose videos that produce impressive output:
- A Vercel deployment walkthrough
- A Supabase quickstart
- A Notion feature demo
- A Linear workflow tour
- A Tailwind CSS tutorial

**Step 2: Generate docs for each**

```bash
for video in <url1> <url2> <url3>; do
  GEMINI_API_KEY=<key> npx reeldocs "$video" -o gallery/<name> -f mdx
done
```

**Step 3: Host the gallery**

Option A: Add a `/gallery` page to the existing docs site that renders the generated MDX.
Option B: Create a simple static site in `packages/gallery/` using VitePress or Starlight.
Option C: Just commit the generated Markdown and link to it from README (simplest).

Start with Option C — link to the raw files in the repo from README. Upgrade later.

**Step 4: Update README "Example Output" section**

```markdown
## Example Output

See what Reeldocs generates:

- [Vercel Deployment Guide](gallery/vercel/) — from a 3-min walkthrough
- [Supabase Quickstart](gallery/supabase/) — from the official tutorial
- [Notion Features](gallery/notion/) — from a product demo
```

**Step 5: Commit**

```bash
git add gallery/ README.md
git commit --no-gpg-sign -m "docs: add example gallery from real product videos"
```

---

### Task 10: Publish to npm

Make `npx reeldocs` work for anyone.

**Step 1: Verify package.json is ready**

Check `packages/cli/package.json`:
- `"name": "reeldocs"` (verify the npm name is available first: `npm view reeldocs`)
- `"bin": { "reeldocs": "./dist/index.js" }`
- `"files": ["dist"]`
- `"repository"`, `"homepage"`, `"bugs"` fields filled in

**Step 2: Build and publish**

```bash
cd packages/cli
pnpm build
npm publish --access public
```

**Step 3: Verify npx works**

```bash
npx reeldocs --help
```

Expected: shows help text

**Step 4: Commit any final adjustments**

```bash
git commit --no-gpg-sign -m "chore: prepare CLI for npm publish"
```

---

### Task 11: Prepare launch assets

Draft all launch materials so launch day is just clicking "post."

**Step 1: Draft Show HN post**

Title: `Show HN: Reeldocs – open-source tool to generate docs from product videos`

Body:
```
Hey HN, I built Reeldocs — an open-source CLI that turns product videos
into documentation using AI (Gemini).

Try it: npx reeldocs https://youtube.com/watch?v=<demo-video>

It downloads the video, extracts segments with timestamps, and generates
structured Markdown or MDX docs. Outputs are ready to drop into
Docusaurus, MkDocs, VitePress, or any Markdown-based docs site.

Examples of generated output: <gallery-link>

The full platform also includes a web app with a rich text editor,
Mintlify-style docs site, multi-language support, and analytics —
but the CLI works standalone with just a Gemini API key.

GitHub: <repo-link>
npm: https://www.npmjs.com/package/reeldocs

Feedback welcome. This is AGPL-3.0 licensed.
```

**Step 2: Draft Twitter/X thread**

```
1/ I built an open-source tool that turns product videos into documentation.

Record a 5-min product walkthrough → get a full docs site.

npx reeldocs https://youtube.com/watch?v=xyz

🧵 Here's what it generates...

2/ [Screenshot of generated docs from a Notion walkthrough]

From this 3-min Notion video, Reeldocs generated 4 chapters of structured documentation — with section headings, code blocks, and timestamp references back to the video.

3/ How it works:
- Downloads the video (YouTube URLs or local files)
- Sends to Gemini for content extraction
- AI identifies segments, transcribes, notes visual context
- Generates structured Markdown/MDX docs

One command. No account needed.

4/ Output formats:
- Markdown (default)
- MDX with frontmatter (for Docusaurus, Mintlify)
- More coming (MkDocs, VitePress)

5/ It's fully open source (AGPL-3.0).

There's also a full web platform with a rich text editor, published docs site, multi-language support, and analytics.

GitHub: <link>
npm: <link>
```

**Step 3: Identify awesome-lists to submit to**

- https://github.com/sindresorhus/awesome — the meta-list
- https://github.com/awesome-selfhosted/awesome-selfhosted
- https://github.com/mahmudalhakim/awesome-ai-tools
- https://github.com/trimstray/the-book-of-secret-knowledge
- Search GitHub for "awesome documentation tools" and "awesome developer tools"

**Step 4: Save drafts to docs/launch/**

Save all drafts so they're ready on launch day.

**Step 5: Commit**

```bash
git add docs/launch/
git commit --no-gpg-sign -m "docs: draft launch materials for Show HN, Twitter, awesome-lists"
```

---

### Task 12: Launch

Execute the coordinated launch.

**Step 1: Rename GitHub repo**

Go to GitHub repo settings → rename from `recap` to `reeldocs`. GitHub auto-redirects the old URL.

**Step 2: Post Show HN**

Submit to https://news.ycombinator.com/submit — post at ~9am ET on a weekday (Tuesday-Thursday optimal).

**Step 3: Post to Reddit**

- r/programming
- r/webdev
- r/SideProject
- r/selfhosted

**Step 4: Post Twitter/X thread**

**Step 5: Submit awesome-list PRs**

Open PRs to 3-5 awesome-lists identified in Task 11.

**Step 6: Monitor and respond**

Stay active on HN and Reddit threads for the first 24 hours. Answer every question. Fix bugs reported in real-time.

---

## Phase 2 Milestones (100 → 1,000 stars)

These are high-level — each becomes its own implementation plan when Phase 1 is complete.

- **M1: Docusaurus adapter** — `--format docusaurus` generates a full Docusaurus project with sidebar config
- **M2: MkDocs adapter** — `--format mkdocs` generates `mkdocs.yml` + docs structure
- **M3: VitePress adapter** — `--format vitepress` with VitePress frontmatter
- **M4: GitHub Action** — `reeldocs/generate@v1` action on GitHub Marketplace
- **M5: Watch mode** — `reeldocs watch <dir>` auto-processes new recordings
- **M6: Community seeding** — generate docs for OSS projects with YouTube tutorials, open PRs

## Phase 3 Milestones (1,000 → 10k+ stars)

- **M7: Playlist mode** — `reeldocs playlist <url>` processes entire YouTube playlists
- **M8: Loom support** — accept Loom URLs directly
- **M9: Conference talk processing** — optimized for longer talk formats
- **M10: Templates** — `reeldocs init changelog|onboarding|api-docs`
- **M11: Awesome video-to-docs hub** — curated list of all tools in the space
- **M12: Docs bot** — GitHub App / Discord bot for zero-friction doc generation
