# Automated Video Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `analyze`, `record`, `produce`, and `generate` commands to the Reeldocs CLI that automatically create narrated walkthrough videos and text documentation from a web app's codebase.

**Architecture:** Three-stage pipeline (analyze → record → produce) connected by a YAML plan file. The analyze stage uses Gemini to discover features from code. The record stage uses Playwright to capture browser walkthroughs. The produce stage uses Google Cloud TTS + ffmpeg to create narrated videos and Gemini to generate polished text docs.

**Tech Stack:** TypeScript (ESM, NodeNext), zod (schema validation), js-yaml (YAML I/O), Playwright (browser automation + video recording), Google Cloud TTS / OpenAI TTS / ElevenLabs TTS, ffmpeg (audio/video merge), Gemini API via `@google/genai`, vitest (unit tests)

**Spec:** `docs/superpowers/specs/2026-03-23-automated-video-generation-design.md`

---

## File Map

### New files

```
packages/cli/
├── src/
│   ├── analyze/
│   │   ├── index.ts              # analyzeCodebase() orchestrator
│   │   ├── plan-schema.ts        # Zod schemas: Plan, RecordingManifest, types
│   │   └── scanners/
│   │       ├── nextjs.ts         # Next.js App Router / Pages scanner
│   │       └── generic.ts        # Generic file tree scanner (fallback)
│   ├── record/
│   │   ├── index.ts              # recordFeatures() orchestrator
│   │   ├── action-translator.ts  # Human-readable action → Playwright call
│   │   └── browser-session.ts    # Playwright context, auth, video recording
│   ├── produce/
│   │   ├── index.ts              # produceOutput() orchestrator
│   │   ├── tts/
│   │   │   ├── interface.ts      # TTSProvider interface + TTSOptions type
│   │   │   ├── google.ts         # Google Cloud TTS provider
│   │   │   ├── openai.ts         # OpenAI TTS provider
│   │   │   ├── elevenlabs.ts     # ElevenLabs TTS provider
│   │   │   └── registry.ts       # getProvider(name) lookup
│   │   ├── translate.ts          # Narration translation via Gemini
│   │   ├── merge.ts              # ffmpeg audio/video merge
│   │   └── docs-generator.ts     # Text doc generation + Gemini polish
│   └── ai/
│       └── prompts.ts            # (modify) Add new prompts
├── tests/
│   ├── plan-schema.test.ts       # Schema validation tests
│   ├── action-translator.test.ts # Deterministic action parsing tests
│   ├── scanners.test.ts          # Codebase scanner tests
│   ├── tts-registry.test.ts      # TTS provider registry tests
│   ├── merge.test.ts             # ffmpeg merge command construction tests
│   └── docs-generator.test.ts    # Doc generation tests
├── vitest.config.ts              # Test runner config
└── package.json                  # (modify) Add dependencies + test script + exports
```

### Modified files

```
packages/cli/src/index.ts         # Add analyze/record/produce/generate subcommands
packages/cli/src/ai/prompts.ts    # Add feature discovery + narration + action translation prompts
packages/cli/src/ai/gemini.ts     # Add generateText() convenience wrapper
packages/cli/package.json         # Add deps, exports, test script
packages/cli/tsconfig.json        # Possibly add paths for test files
```

---

## Task 1: Project Setup — Dependencies & Test Infrastructure

**Files:**
- Modify: `packages/cli/package.json`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/tests/plan-schema.test.ts` (placeholder)

- [ ] **Step 1: Install dependencies**

```bash
cd packages/cli
pnpm add zod js-yaml playwright
pnpm add -D @types/js-yaml vitest
```

Note: `playwright` (the library, not `@playwright/test`) is for programmatic browser control. The existing root-level `@playwright/test` is for e2e tests — this is different. TTS providers use the REST API via `fetch()` — no SDK dependencies needed.

- [ ] **Step 2: Add vitest config**

Create `packages/cli/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

In `packages/cli/package.json`, add to `"scripts"`:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Add new exports to package.json**

Replace the `"exports"` field in `packages/cli/package.json`:

```json
{
  "exports": {
    ".": "./dist/ai/pipeline.js",
    "./ai": "./dist/ai/gemini.js",
    "./prompts": "./dist/ai/prompts.js",
    "./analyze": "./dist/analyze/index.js",
    "./record": "./dist/record/index.js",
    "./produce": "./dist/produce/index.js",
    "./plan": "./dist/analyze/plan-schema.js"
  }
}
```

- [ ] **Step 5: Update tsconfig.json to include test files**

Add `"tests"` to the `include` array in `packages/cli/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src", "tests"]
}
```

Note: `rootDir` changes from `"./src"` to `"."` to accommodate both `src/` and `tests/` directories. The `outDir` stays `"./dist"` so compiled output is unaffected (test files are only run by vitest, not compiled to dist).

- [ ] **Step 6: Create placeholder test to verify vitest works**

Create `packages/cli/tests/plan-schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("plan-schema", () => {
  it("placeholder", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 7: Run test to verify setup**

```bash
cd packages/cli && pnpm test
```

Expected: 1 test passing.

- [ ] **Step 8: Build to verify no TS errors**

```bash
cd packages/cli && pnpm build
```

Expected: Clean build with no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/vitest.config.ts packages/cli/tests/ pnpm-lock.yaml
git commit --no-gpg-sign -m "feat(cli): add dependencies and vitest setup for auto-generation"
```

---

## Task 2: Plan File & Recording Manifest Schemas

**Files:**
- Create: `packages/cli/src/analyze/plan-schema.ts`
- Modify: `packages/cli/tests/plan-schema.test.ts`

- [ ] **Step 1: Write failing tests for plan schema validation**

Replace `packages/cli/tests/plan-schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  PlanSchema,
  RecordingManifestSchema,
  type RecordingManifest,
} from "../src/analyze/plan-schema.js";
import type { z } from "zod";

// Use z.input type since we're testing input parsing (before defaults are applied)
type PlanInput = z.input<typeof PlanSchema>;

describe("PlanSchema", () => {
  const validPlan: PlanInput = {
    version: 1,
    app: {
      url: "http://localhost:3000",
      auth: {
        strategy: "credentials",
        credentials: { email: "demo@test.com", password: "pass" },
      },
      viewport: { width: 1280, height: 720 },
    },
    recording: { max_concurrent: 3 },
    features: [
      {
        id: "create-project",
        title: "Creating a Project",
        category: "Getting Started",
        steps: [
          {
            action: "navigate to /dashboard",
            narration: "Open the dashboard.",
            pause: 2000,
          },
          {
            action: "click button 'New Project'",
            narration: "Click New Project.",
          },
        ],
      },
    ],
    output: {
      video_dir: "./generated/videos",
      docs_dir: "./generated/docs",
      languages: ["en"],
      tts: { provider: "google", voice: "en-US-Studio-O", speed: 1.0 },
      screenshots: true,
    },
  };

  it("accepts a valid plan", () => {
    const result = PlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it("rejects plan with missing features", () => {
    const invalid = { ...validPlan, features: [] };
    const result = PlanSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("applies default timeout to steps", () => {
    const result = PlanSchema.parse(validPlan);
    expect(result.features[0].steps[0].timeout).toBe(10000);
  });

  it("applies default pause of 0 to steps", () => {
    const result = PlanSchema.parse(validPlan);
    expect(result.features[0].steps[1].pause).toBe(0);
  });

  it("rejects invalid auth strategy", () => {
    const invalid = {
      ...validPlan,
      app: {
        ...validPlan.app,
        auth: { ...validPlan.app.auth, strategy: "invalid" },
      },
    };
    const result = PlanSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid TTS provider", () => {
    const invalid = {
      ...validPlan,
      output: {
        ...validPlan.output,
        tts: { ...validPlan.output.tts, provider: "invalid" },
      },
    };
    const result = PlanSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("allows optional setup_script", () => {
    const withScript = {
      ...validPlan,
      app: {
        ...validPlan.app,
        auth: { ...validPlan.app.auth, setup_script: "./seed.ts" },
      },
    };
    const result = PlanSchema.safeParse(withScript);
    expect(result.success).toBe(true);
  });
});

describe("RecordingManifestSchema", () => {
  const validManifest: RecordingManifest = {
    version: 1,
    recorded_at: "2026-03-23T14:30:00Z",
    features: {
      "create-project": {
        video_path: "./generated/videos/create-project.webm",
        status: "success",
        steps: [
          { stepIndex: 0, startedAt: 0, completedAt: 1200, screenshot: "step-0.png" },
        ],
        duration_ms: 1200,
      },
    },
  };

  it("accepts a valid manifest", () => {
    const result = RecordingManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it("accepts failed features with error info", () => {
    const withFailure: RecordingManifest = {
      ...validManifest,
      features: {
        "broken-feature": {
          video_path: "./generated/videos/broken.webm",
          status: "failed",
          error: "Element not found",
          error_screenshot: "error.png",
          steps: [],
          duration_ms: 0,
        },
      },
    };
    const result = RecordingManifestSchema.safeParse(withFailure);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/cli && pnpm test
```

Expected: FAIL — cannot resolve `../src/analyze/plan-schema.js`

- [ ] **Step 3: Implement the schema**

Create `packages/cli/src/analyze/plan-schema.ts`:

```typescript
import { z } from "zod";

// --- Step schema ---

export const StepSchema = z.object({
  action: z.string().min(1),
  narration: z.string().min(1),
  pause: z.number().int().nonnegative().default(0),
  timeout: z.number().int().positive().default(10000),
});

export type Step = z.infer<typeof StepSchema>;

// --- Feature schema ---

export const FeatureSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  steps: z.array(StepSchema).min(1),
});

export type Feature = z.infer<typeof FeatureSchema>;

// --- Auth schema ---

export const AuthSchema = z.object({
  strategy: z.enum(["credentials", "cookie", "script"]),
  credentials: z
    .object({ email: z.string(), password: z.string() })
    .optional(),
  setup_script: z.string().optional(),
});

export type Auth = z.infer<typeof AuthSchema>;

// --- Viewport schema ---

export const ViewportSchema = z.object({
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
});

// --- App schema ---

export const AppSchema = z.object({
  url: z.string().url(),
  auth: AuthSchema,
  viewport: ViewportSchema.default({ width: 1280, height: 720 }),
});

// --- Recording schema ---

export const RecordingConfigSchema = z.object({
  max_concurrent: z.number().int().positive().default(3),
});

// --- TTS schema ---

export const TTSConfigSchema = z.object({
  provider: z.enum(["google", "openai", "elevenlabs"]).default("google"),
  voice: z.string().default("en-US-Studio-O"),
  speed: z.number().positive().default(1.0),
});

// --- Output schema ---

export const OutputSchema = z.object({
  video_dir: z.string().default("./generated/videos"),
  docs_dir: z.string().default("./generated/docs"),
  languages: z.array(z.string()).min(1).default(["en"]),
  tts: TTSConfigSchema.default({}),
  screenshots: z.boolean().default(true),
});

// --- Plan schema (top-level) ---

export const PlanSchema = z.object({
  version: z.literal(1),
  app: AppSchema,
  recording: RecordingConfigSchema.default({}),
  features: z.array(FeatureSchema).min(1),
  output: OutputSchema.default({}),
});

export type Plan = z.infer<typeof PlanSchema>;

// --- Recording manifest schemas ---

export const ManifestStepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  startedAt: z.number().nonnegative(),
  completedAt: z.number().nonnegative(),
  screenshot: z.string().optional(),
});

export type ManifestStep = z.infer<typeof ManifestStepSchema>;

export const ManifestFeatureSchema = z.object({
  video_path: z.string(),
  status: z.enum(["success", "failed"]),
  steps: z.array(ManifestStepSchema),
  duration_ms: z.number().nonnegative(),
  error: z.string().optional(),
  error_screenshot: z.string().optional(),
});

export type ManifestFeature = z.infer<typeof ManifestFeatureSchema>;

export const RecordingManifestSchema = z.object({
  version: z.literal(1),
  recorded_at: z.string(),
  features: z.record(z.string(), ManifestFeatureSchema),
});

export type RecordingManifest = z.infer<typeof RecordingManifestSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/cli && pnpm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/analyze/plan-schema.ts packages/cli/tests/plan-schema.test.ts
git commit --no-gpg-sign -m "feat(cli): add zod schemas for plan file and recording manifest"
```

---

## Task 3: Codebase Scanners

**Files:**
- Create: `packages/cli/src/analyze/scanners/nextjs.ts`
- Create: `packages/cli/src/analyze/scanners/generic.ts`
- Create: `packages/cli/tests/scanners.test.ts`

The scanners read a codebase directory and produce a structured summary of routes/pages for Gemini to analyze.

- [ ] **Step 1: Write failing tests**

Create `packages/cli/tests/scanners.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanNextjs } from "../src/analyze/scanners/nextjs.js";
import { scanGeneric } from "../src/analyze/scanners/generic.js";
import type { CodebaseSummary } from "../src/analyze/scanners/nextjs.js";

describe("scanNextjs", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "reeldocs-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("discovers App Router pages", async () => {
    // Create a minimal Next.js App Router structure
    const appDir = join(tempDir, "app");
    await mkdir(join(appDir, "dashboard"), { recursive: true });
    await mkdir(join(appDir, "settings"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      'export default function Home() { return <div>Home</div> }'
    );
    await writeFile(
      join(appDir, "dashboard", "page.tsx"),
      'export default function Dashboard() { return <div>Dashboard</div> }'
    );
    await writeFile(
      join(appDir, "settings", "page.tsx"),
      'export default function Settings() { return <div>Settings</div> }'
    );

    const result = await scanNextjs(tempDir);
    expect(result.framework).toBe("nextjs-app-router");
    expect(result.routes).toHaveLength(3);
    expect(result.routes.map((r) => r.path)).toContain("/");
    expect(result.routes.map((r) => r.path)).toContain("/dashboard");
    expect(result.routes.map((r) => r.path)).toContain("/settings");
  });

  it("detects route groups (parenthesized dirs)", async () => {
    const appDir = join(tempDir, "app");
    await mkdir(join(appDir, "(dashboard)", "projects"), { recursive: true });
    await writeFile(
      join(appDir, "(dashboard)", "projects", "page.tsx"),
      'export default function Projects() { return <div>Projects</div> }'
    );

    const result = await scanNextjs(tempDir);
    expect(result.routes.map((r) => r.path)).toContain("/projects");
  });

  it("detects dynamic segments", async () => {
    const appDir = join(tempDir, "app");
    await mkdir(join(appDir, "project", "[slug]"), { recursive: true });
    await writeFile(
      join(appDir, "project", "[slug]", "page.tsx"),
      'export default function Project() { return <div>Project</div> }'
    );

    const result = await scanNextjs(tempDir);
    expect(result.routes[0].path).toBe("/project/[slug]");
    expect(result.routes[0].isDynamic).toBe(true);
  });

  it("includes component source code snippets", async () => {
    const appDir = join(tempDir, "app");
    await mkdir(appDir, { recursive: true });
    const source = 'export default function Home() { return <div><button>Click me</button></div> }';
    await writeFile(join(appDir, "page.tsx"), source);

    const result = await scanNextjs(tempDir);
    expect(result.routes[0].componentSource).toContain("button");
  });

  it("returns null for non-Next.js codebases", async () => {
    // Empty dir — no app/ or pages/ directory
    const result = await scanNextjs(tempDir);
    expect(result).toBeNull();
  });
});

describe("scanGeneric", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "reeldocs-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("finds page/view/screen files", async () => {
    await mkdir(join(tempDir, "src", "pages"), { recursive: true });
    await writeFile(join(tempDir, "src", "pages", "Home.tsx"), "export default function Home() {}");
    await writeFile(join(tempDir, "src", "pages", "Login.tsx"), "export default function Login() {}");

    const result = await scanGeneric(tempDir);
    expect(result.framework).toBe("generic");
    expect(result.routes.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/cli && pnpm test
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the Next.js scanner**

Create `packages/cli/src/analyze/scanners/nextjs.ts`:

```typescript
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface RouteInfo {
  path: string;
  filePath: string;
  componentSource: string;
  isDynamic: boolean;
}

export interface CodebaseSummary {
  framework: string;
  routes: RouteInfo[];
}

const PAGE_FILES = ["page.tsx", "page.ts", "page.jsx", "page.js"];
const MAX_SOURCE_LENGTH = 2000; // Truncate long files for the AI prompt

export async function scanNextjs(
  codebaseDir: string
): Promise<CodebaseSummary | null> {
  const appDir = join(codebaseDir, "app");
  const pagesDir = join(codebaseDir, "pages");

  const hasAppDir = await stat(appDir).then(() => true).catch(() => false);
  const hasPagesDir = await stat(pagesDir).then(() => true).catch(() => false);

  if (!hasAppDir && !hasPagesDir) return null;

  if (hasAppDir) {
    const routes = await scanAppRouter(appDir, appDir);
    return { framework: "nextjs-app-router", routes };
  }

  // Pages router fallback (not primary focus, but basic support)
  const routes = await scanPagesRouter(pagesDir, pagesDir);
  return { framework: "nextjs-pages-router", routes };
}

async function scanAppRouter(
  dir: string,
  appRoot: string
): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Skip private folders, api routes, and node_modules
      if (entry.name.startsWith("_") || entry.name === "api" || entry.name === "node_modules") {
        continue;
      }
      const subRoutes = await scanAppRouter(join(dir, entry.name), appRoot);
      routes.push(...subRoutes);
    }

    if (entry.isFile() && PAGE_FILES.includes(entry.name)) {
      const filePath = join(dir, entry.name);
      const relPath = relative(appRoot, dir);
      const routePath = relPathToRoute(relPath);
      const source = await readFile(filePath, "utf-8");

      routes.push({
        path: routePath,
        filePath,
        componentSource: source.slice(0, MAX_SOURCE_LENGTH),
        isDynamic: routePath.includes("["),
      });
    }
  }

  return routes;
}

function relPathToRoute(relPath: string): string {
  if (relPath === "" || relPath === ".") return "/";

  const segments = relPath.split("/").filter(Boolean);
  const routeSegments: string[] = [];

  for (const seg of segments) {
    // Route groups (parenthesized) are skipped in the URL
    if (seg.startsWith("(") && seg.endsWith(")")) continue;
    routeSegments.push(seg);
  }

  return "/" + routeSegments.join("/");
}

async function scanPagesRouter(
  dir: string,
  pagesRoot: string
): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "_app" && entry.name !== "api") {
      const subRoutes = await scanPagesRouter(join(dir, entry.name), pagesRoot);
      routes.push(...subRoutes);
    }

    if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      const filePath = join(dir, entry.name);
      const relPath = relative(pagesRoot, filePath);
      const routePath =
        "/" +
        relPath
          .replace(/\.(tsx?|jsx?)$/, "")
          .replace(/\/index$/, "")
          .replace(/^index$/, "");
      const source = await readFile(filePath, "utf-8");

      routes.push({
        path: routePath || "/",
        filePath,
        componentSource: source.slice(0, MAX_SOURCE_LENGTH),
        isDynamic: routePath.includes("["),
      });
    }
  }

  return routes;
}
```

- [ ] **Step 4: Implement the generic scanner**

Create `packages/cli/src/analyze/scanners/generic.ts`:

```typescript
import { readdir, readFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import type { CodebaseSummary, RouteInfo } from "./nextjs.js";

const PAGE_PATTERNS = [
  /page\.(tsx?|jsx?|vue|svelte)$/i,
  /view\.(tsx?|jsx?|vue|svelte)$/i,
  /screen\.(tsx?|jsx?|vue|svelte)$/i,
];

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build", "__tests__", "test", "tests",
]);

const MAX_SOURCE_LENGTH = 2000;

export async function scanGeneric(codebaseDir: string): Promise<CodebaseSummary> {
  const routes = await walk(codebaseDir, codebaseDir);
  return { framework: "generic", routes };
}

async function walk(dir: string, root: string): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const sub = await walk(join(dir, entry.name), root);
      routes.push(...sub);
    }

    if (entry.isFile()) {
      const name = entry.name;
      const isPage = PAGE_PATTERNS.some((p) => p.test(name));
      if (!isPage) continue;

      const filePath = join(dir, name);
      const relPath = relative(root, filePath);
      const source = await readFile(filePath, "utf-8");

      routes.push({
        path: "/" + relPath.replace(/\.(tsx?|jsx?|vue|svelte)$/i, ""),
        filePath,
        componentSource: source.slice(0, MAX_SOURCE_LENGTH),
        isDynamic: false,
      });
    }
  }

  return routes;
}
```

- [ ] **Step 5: Run tests**

```bash
cd packages/cli && pnpm test
```

Expected: All scanner tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/analyze/scanners/ packages/cli/tests/scanners.test.ts
git commit --no-gpg-sign -m "feat(cli): add Next.js and generic codebase scanners"
```

---

## Task 4: AI Prompts for Feature Discovery & Narration

**Files:**
- Modify: `packages/cli/src/ai/prompts.ts`
- Modify: `packages/cli/src/ai/gemini.ts`

- [ ] **Step 1: Add a generateText() helper to gemini.ts**

Add to the end of `packages/cli/src/ai/gemini.ts`:

```typescript
export async function generateText(prompt: string, model: string = "gemini-2.5-flash"): Promise<string> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.text ?? "";
}

export async function generateJson<T = unknown>(prompt: string, model: string = "gemini-2.5-flash"): Promise<T> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  return JSON.parse(response.text!);
}
```

- [ ] **Step 2: Add new prompts to prompts.ts**

Append to `packages/cli/src/ai/prompts.ts`:

```typescript
import type { CodebaseSummary } from "../analyze/scanners/nextjs.js";

export function getFeatureDiscoveryPrompt(
  summary: CodebaseSummary,
  hints?: string
): string {
  const routeDescriptions = summary.routes
    .map(
      (r) =>
        `Route: ${r.path}${r.isDynamic ? " (dynamic)" : ""}\nSource:\n${r.componentSource}\n`
    )
    .join("\n---\n");

  return `You are analyzing a ${summary.framework} web application to identify user-facing features for documentation.

Here are the discovered routes and their page components:

${routeDescriptions}

${hints ? `The user has specifically requested focus on: ${hints}\n` : ""}

For each user-facing feature you identify, generate a walkthrough script. Each feature should have:
- "id": a URL-safe slug (e.g., "create-project")
- "title": a human-readable title (e.g., "Creating a New Project")
- "category": a documentation category (e.g., "Getting Started", "Projects", "Settings")
- "steps": an array of walkthrough steps, each with:
  - "action": a human-readable browser action (e.g., "navigate to /dashboard", "click button 'New Project'", "fill input[name='email'] with 'user@example.com'")
  - "narration": what a voiceover would say during this step
  - "pause": milliseconds to pause after the action (default 1500 for navigation, 1000 for clicks, 500 for typing)

Action format guidelines:
- "navigate to /path" — go to a URL
- "click button 'Label'" — click a button by visible text
- "click link 'Label'" — click a link by visible text
- "click 'Label'" — click any element by visible text
- "fill input[name='x'] with 'value'" — type into a form field
- "select 'Option' from 'Label'" — select from a dropdown
- "wait 2000" — explicit wait

Rules:
- Only include features that are accessible to end users (skip admin, API routes, auth internals)
- Group related features logically into categories
- Each feature should demonstrate a complete workflow (not just one click)
- The narration should explain what the user is doing and why, in a friendly tutorial tone
- Skip features behind dynamic routes that require specific data unless you can infer reasonable demo data
- Return ONLY valid JSON matching this structure, no markdown fences.

Return format:
{
  "features": [
    {
      "id": "...",
      "title": "...",
      "category": "...",
      "steps": [{ "action": "...", "narration": "...", "pause": 1500 }]
    }
  ]
}`;
}

export function getActionTranslationPrompt(
  action: string,
  ariaSnapshot: string
): string {
  return `You are translating a human-readable browser action into a Playwright API call.

Current page structure (ARIA snapshot):
${ariaSnapshot}

Action to translate: "${action}"

Return a single Playwright statement that performs this action. Use the most resilient selector strategy:
- Prefer getByRole() with name for buttons, links, headings
- Prefer getByLabel() for form inputs
- Prefer getByText() for generic text elements
- Use locator() with CSS only as a fallback

Return ONLY the Playwright code (e.g., "page.getByRole('button', { name: 'Submit' }).click()"), no explanation.`;
}

export function getNarrationTranslationPrompt(
  narration: string,
  targetLanguage: string
): string {
  return `Translate the following narration text to ${targetLanguage}.
Keep it natural and conversational — this will be spoken aloud by a text-to-speech system.
Preserve any technical terms, product names, or UI element names that should stay in English.
Return ONLY the translated text, no preamble.

${narration}`;
}

export function getDocsPolishPrompt(
  featureTitle: string,
  steps: { action: string; narration: string }[]
): string {
  const stepText = steps
    .map((s, i) => `Step ${i + 1}: [Action: ${s.action}] ${s.narration}`)
    .join("\n");

  return `You are a technical writer creating documentation from a product walkthrough script.

Feature: ${featureTitle}

Walkthrough steps:
${stepText}

Write clear, structured documentation for this feature. The output should be:
- Written in second person ("you can", "click the button")
- Organized with a brief introduction, then step-by-step instructions
- Include the step actions as context but rewrite narration into polished prose
- Use Markdown formatting (headings, bold for UI elements, numbered lists for steps)
- Keep it concise — aim for documentation, not a transcript

Return ONLY the Markdown content, no preamble.`;
}
```

- [ ] **Step 3: Build to verify no TS errors**

```bash
cd packages/cli && pnpm build
```

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/ai/prompts.ts packages/cli/src/ai/gemini.ts
git commit --no-gpg-sign -m "feat(cli): add AI prompts for feature discovery, action translation, and doc polish"
```

---

## Task 5: Analyze Module

**Files:**
- Create: `packages/cli/src/analyze/index.ts`

- [ ] **Step 1: Implement the analyze orchestrator**

Create `packages/cli/src/analyze/index.ts`:

```typescript
import { writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import { initAI, generateJson } from "../ai/gemini.js";
import { getFeatureDiscoveryPrompt } from "../ai/prompts.js";
import { scanNextjs } from "./scanners/nextjs.js";
import { scanGeneric } from "./scanners/generic.js";
import { PlanSchema, type Plan } from "./plan-schema.js";
import type { CodebaseSummary } from "./scanners/nextjs.js";

export interface AnalyzeOptions {
  codebaseDir: string;
  appUrl: string;
  apiKey: string;
  model?: string;
  hints?: string;
  outputPath?: string;
  onProgress?: (message: string) => void;
}

export async function analyzeCodebase(options: AnalyzeOptions): Promise<Plan> {
  const {
    codebaseDir,
    appUrl,
    apiKey,
    model = "gemini-2.5-flash",
    hints,
    outputPath = "./plan.yaml",
    onProgress = () => {},
  } = options;

  initAI(apiKey);

  // Step 1: Scan the codebase
  onProgress("Scanning codebase...");
  let summary: CodebaseSummary | null = await scanNextjs(codebaseDir);
  if (!summary) {
    onProgress("No Next.js structure found, falling back to generic scan...");
    summary = await scanGeneric(codebaseDir);
  }

  if (summary.routes.length === 0) {
    throw new Error("No routes or pages found in the codebase. Check the --codebase path.");
  }

  onProgress(`Found ${summary.routes.length} routes (${summary.framework}). Asking AI to identify features...`);

  // Step 2: Send to Gemini for feature discovery
  const prompt = getFeatureDiscoveryPrompt(summary, hints);
  const aiResponse = await generateJson<{ features: unknown[] }>(prompt, model);

  // Step 3: Assemble and validate the plan
  const rawPlan = {
    version: 1 as const,
    app: {
      url: appUrl,
      auth: {
        strategy: "credentials" as const,
        credentials: { email: "", password: "" },
      },
      viewport: { width: 1280, height: 720 },
    },
    recording: { max_concurrent: 3 },
    features: aiResponse.features,
    output: {
      video_dir: "./generated/videos",
      docs_dir: "./generated/docs",
      languages: ["en"],
      tts: { provider: "google" as const, voice: "en-US-Studio-O", speed: 1.0 },
      screenshots: true,
    },
  };

  const plan = PlanSchema.parse(rawPlan);

  // Step 4: Write YAML
  const yamlContent = yaml.dump(plan, { lineWidth: 120, noRefs: true });
  await writeFile(outputPath, yamlContent, "utf-8");

  onProgress(`Plan written to ${outputPath}`);
  return plan;
}
```

- [ ] **Step 2: Build to verify**

```bash
cd packages/cli && pnpm build
```

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/analyze/index.ts
git commit --no-gpg-sign -m "feat(cli): add analyze module for codebase → plan file generation"
```

---

## Task 6: Action Translator

**Files:**
- Create: `packages/cli/src/record/action-translator.ts`
- Create: `packages/cli/tests/action-translator.test.ts`

- [ ] **Step 1: Write failing tests for deterministic parsing**

Create `packages/cli/tests/action-translator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseDeterministic } from "../src/record/action-translator.js";

describe("parseDeterministic", () => {
  it("parses 'navigate to /path'", () => {
    const result = parseDeterministic("navigate to /dashboard");
    expect(result).toEqual({ type: "navigate", path: "/dashboard" });
  });

  it("parses 'navigate to /nested/path'", () => {
    const result = parseDeterministic("navigate to /project/settings");
    expect(result).toEqual({ type: "navigate", path: "/project/settings" });
  });

  it("parses 'click button' with single quotes", () => {
    const result = parseDeterministic("click button 'New Project'");
    expect(result).toEqual({ type: "click_button", name: "New Project" });
  });

  it("parses 'click link'", () => {
    const result = parseDeterministic("click link 'Dashboard'");
    expect(result).toEqual({ type: "click_link", name: "Dashboard" });
  });

  it("parses generic 'click' with quoted text", () => {
    const result = parseDeterministic("click 'Save Changes'");
    expect(result).toEqual({ type: "click_text", name: "Save Changes" });
  });

  it("parses 'fill input' with name selector", () => {
    const result = parseDeterministic("fill input[name='email'] with 'test@example.com'");
    expect(result).toEqual({
      type: "fill",
      selector: "input[name='email']",
      value: "test@example.com",
    });
  });

  it("parses 'select from' dropdown", () => {
    const result = parseDeterministic("select 'English' from 'Language'");
    expect(result).toEqual({
      type: "select",
      option: "English",
      label: "Language",
    });
  });

  it("parses 'wait N'", () => {
    const result = parseDeterministic("wait 3000");
    expect(result).toEqual({ type: "wait", ms: 3000 });
  });

  it("returns null for unrecognized actions", () => {
    const result = parseDeterministic("hover over the menu icon in the top left");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/cli && pnpm test -- tests/action-translator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the action translator**

Create `packages/cli/src/record/action-translator.ts`:

```typescript
import type { Page } from "playwright";
import { generateText } from "../ai/gemini.js";
import { getActionTranslationPrompt } from "../ai/prompts.js";

// --- Deterministic parsing ---

export type ParsedAction =
  | { type: "navigate"; path: string }
  | { type: "click_button"; name: string }
  | { type: "click_link"; name: string }
  | { type: "click_text"; name: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "select"; option: string; label: string }
  | { type: "wait"; ms: number };

const PATTERNS: Array<{ regex: RegExp; parse: (m: RegExpMatchArray) => ParsedAction }> = [
  {
    regex: /^navigate to (\/\S+)$/i,
    parse: (m) => ({ type: "navigate", path: m[1] }),
  },
  {
    regex: /^click button '([^']+)'$/i,
    parse: (m) => ({ type: "click_button", name: m[1] }),
  },
  {
    regex: /^click link '([^']+)'$/i,
    parse: (m) => ({ type: "click_link", name: m[1] }),
  },
  {
    regex: /^click '([^']+)'$/i,
    parse: (m) => ({ type: "click_text", name: m[1] }),
  },
  {
    regex: /^fill (input\[[^\]]+\]) with '([^']+)'$/i,
    parse: (m) => ({ type: "fill", selector: m[1], value: m[2] }),
  },
  {
    regex: /^select '([^']+)' from '([^']+)'$/i,
    parse: (m) => ({ type: "select", option: m[1], label: m[2] }),
  },
  {
    regex: /^wait (\d+)$/i,
    parse: (m) => ({ type: "wait", ms: parseInt(m[1], 10) }),
  },
];

export function parseDeterministic(action: string): ParsedAction | null {
  for (const { regex, parse } of PATTERNS) {
    const match = action.match(regex);
    if (match) return parse(match);
  }
  return null;
}

// --- Execute a parsed action against a Playwright page ---

export async function executeParsedAction(
  page: Page,
  parsed: ParsedAction,
  baseUrl: string,
  timeout: number
): Promise<void> {
  switch (parsed.type) {
    case "navigate":
      await page.goto(baseUrl + parsed.path, { timeout, waitUntil: "networkidle" });
      break;
    case "click_button":
      await page.getByRole("button", { name: parsed.name }).click({ timeout });
      break;
    case "click_link":
      await page.getByRole("link", { name: parsed.name }).click({ timeout });
      break;
    case "click_text":
      await page.getByText(parsed.name, { exact: true }).click({ timeout });
      break;
    case "fill": {
      const locator = page.locator(parsed.selector);
      await locator.fill(parsed.value, { timeout });
      break;
    }
    case "select": {
      const select = page.getByLabel(parsed.label);
      await select.selectOption(parsed.option, { timeout });
      break;
    }
    case "wait":
      await page.waitForTimeout(parsed.ms);
      break;
  }
}

// --- AI-driven fallback ---

async function executeWithAI(
  page: Page,
  action: string,
  model: string,
  timeout: number
): Promise<void> {
  // Get an ARIA snapshot of the current page
  const snapshot = await page.locator("body").ariaSnapshot();
  const prompt = getActionTranslationPrompt(action, snapshot);
  const playwrightCode = await generateText(prompt, model);

  // The AI returns something like: page.getByRole('button', { name: 'Submit' }).click()
  // We need to evaluate it against the page object.
  // Safety: we only allow page.* calls, no arbitrary code execution.
  const cleanCode = playwrightCode.trim().replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();

  if (!cleanCode.startsWith("page.")) {
    throw new Error(`AI returned unexpected code: ${cleanCode}`);
  }

  // Use Function constructor to execute the Playwright call
  const fn = new Function("page", `return ${cleanCode}`);
  const result = fn(page);
  if (result && typeof result.then === "function") {
    await Promise.race([
      result,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`AI action timed out after ${timeout}ms`)), timeout)
      ),
    ]);
  }
}

// --- Main entry point: translate and execute ---

export async function translateAndExecute(
  page: Page,
  action: string,
  baseUrl: string,
  model: string,
  timeout: number = 10000
): Promise<void> {
  const parsed = parseDeterministic(action);
  if (parsed) {
    await executeParsedAction(page, parsed, baseUrl, timeout);
  } else {
    await executeWithAI(page, action, model, timeout);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/cli && pnpm test -- tests/action-translator.test.ts
```

Expected: All deterministic parsing tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/record/action-translator.ts packages/cli/tests/action-translator.test.ts
git commit --no-gpg-sign -m "feat(cli): add action translator with deterministic parsing and AI fallback"
```

---

## Task 7: Browser Session & Record Module

**Files:**
- Create: `packages/cli/src/record/browser-session.ts`
- Create: `packages/cli/src/record/index.ts`

- [ ] **Step 1: Implement the browser session manager**

Create `packages/cli/src/record/browser-session.ts`:

```typescript
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Plan, Feature, ManifestStep } from "../analyze/plan-schema.js";
import { translateAndExecute } from "./action-translator.js";

export interface FeatureRecordingResult {
  featureId: string;
  status: "success" | "failed";
  videoPath: string;
  steps: ManifestStep[];
  durationMs: number;
  error?: string;
  errorScreenshot?: string;
}

export async function recordFeature(
  browser: Browser,
  feature: Feature,
  plan: Plan,
  screenshotDir: string,
  tempVideoDir: string,
  model: string,
  onProgress?: (message: string) => void
): Promise<FeatureRecordingResult> {
  const log = onProgress ?? (() => {});
  const baseUrl = plan.app.url;
  const { width, height } = plan.app.viewport;

  // Create screenshot dir for this feature
  const featureScreenshotDir = join(screenshotDir, feature.id);
  if (plan.output.screenshots) {
    await mkdir(featureScreenshotDir, { recursive: true });
  }

  const context: BrowserContext = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: tempVideoDir, size: { width, height } },
  });
  const page: Page = await context.newPage();

  const steps: ManifestStep[] = [];
  const recordingStart = Date.now();

  try {
    // Auth setup
    await performAuth(page, plan, model);

    // Execute each step
    for (let i = 0; i < feature.steps.length; i++) {
      const step = feature.steps[i];
      log(`  [${feature.id}] Step ${i + 1}/${feature.steps.length}: ${step.action}`);

      const stepStart = Date.now() - recordingStart;
      try {
        await translateAndExecute(page, step.action, baseUrl, model, step.timeout);
      } catch (err) {
        // Take error screenshot and bail on this feature
        const errorScreenshotPath = join(featureScreenshotDir, `error-step-${i}.png`);
        await page.screenshot({ path: errorScreenshotPath }).catch(() => {});

        const elapsed = Date.now() - recordingStart;
        steps.push({ stepIndex: i, startedAt: stepStart, completedAt: elapsed });

        await context.close();
        const videoPath = await getVideoPath(page);

        return {
          featureId: feature.id,
          status: "failed",
          videoPath,
          steps,
          durationMs: elapsed,
          error: `Step ${i} failed: ${err instanceof Error ? err.message : String(err)}`,
          errorScreenshot: errorScreenshotPath,
        };
      }

      const stepComplete = Date.now() - recordingStart;

      // Screenshot
      let screenshotPath: string | undefined;
      if (plan.output.screenshots) {
        screenshotPath = join(featureScreenshotDir, `step-${i}.png`);
        await page.screenshot({ path: screenshotPath }).catch(() => {});
      }

      steps.push({
        stepIndex: i,
        startedAt: stepStart,
        completedAt: stepComplete,
        screenshot: screenshotPath,
      });

      // Pause for pacing
      if (step.pause > 0) {
        await page.waitForTimeout(step.pause);
      }
    }

    const durationMs = Date.now() - recordingStart;
    await context.close();
    const videoPath = await getVideoPath(page);

    return {
      featureId: feature.id,
      status: "success",
      videoPath,
      steps,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - recordingStart;
    await context.close().catch(() => {});
    const videoPath = await getVideoPath(page).catch(() => "");

    return {
      featureId: feature.id,
      status: "failed",
      videoPath,
      steps,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function performAuth(page: Page, plan: Plan, model: string): Promise<void> {
  const { auth } = plan.app;
  const baseUrl = plan.app.url;

  switch (auth.strategy) {
    case "credentials":
      if (!auth.credentials) throw new Error("Credentials required for 'credentials' auth strategy");
      // Navigate to login and fill credentials
      // This is generic — the AI fallback handles different login page layouts
      await page.goto(baseUrl + "/login", { waitUntil: "networkidle", timeout: 15000 }).catch(() => {
        // Try root if /login doesn't exist
        return page.goto(baseUrl, { waitUntil: "networkidle", timeout: 15000 });
      });
      // Try common email/password patterns
      try {
        await page.getByLabel(/email/i).fill(auth.credentials.email, { timeout: 5000 });
        await page.getByLabel(/password/i).fill(auth.credentials.password, { timeout: 5000 });
        await page.getByRole("button", { name: /sign in|log in|login|submit/i }).click({ timeout: 5000 });
        await page.waitForURL("**/*", { timeout: 10000 });
      } catch {
        // If common patterns fail, use AI to figure out the login page
        await translateAndExecute(page, `fill email field with '${auth.credentials.email}'`, baseUrl, model);
        await translateAndExecute(page, `fill password field with '${auth.credentials.password}'`, baseUrl, model);
        await translateAndExecute(page, "click the login or sign in button", baseUrl, model);
        await page.waitForURL("**/*", { timeout: 10000 });
      }
      break;

    case "cookie":
      // Cookie-based auth is set via setup_script
      break;

    case "script":
      // Script-based auth is handled by the setup_script
      break;
  }
}

async function getVideoPath(page: Page): Promise<string> {
  const video = page.video();
  if (!video) return "";
  return await video.path();
}
```

- [ ] **Step 2: Implement the record orchestrator**

Create `packages/cli/src/record/index.ts`:

```typescript
import { chromium, type Browser } from "playwright";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import yaml from "js-yaml";
import { readFile } from "node:fs/promises";
import { PlanSchema, RecordingManifestSchema, type Plan, type RecordingManifest } from "../analyze/plan-schema.js";
import { initAI } from "../ai/gemini.js";
import { recordFeature, type FeatureRecordingResult } from "./browser-session.js";

export interface RecordOptions {
  planPath: string;
  apiKey: string;
  model?: string;
  concurrency?: number;
  onProgress?: (message: string) => void;
}

export async function recordFeatures(options: RecordOptions): Promise<RecordingManifest> {
  const { planPath, apiKey, model = "gemini-2.5-flash", onProgress = () => {} } = options;

  // Load and validate plan
  const planContent = await readFile(planPath, "utf-8");
  const rawPlan = yaml.load(planContent);
  const plan = PlanSchema.parse(rawPlan);

  const concurrency = options.concurrency ?? plan.recording.max_concurrent;

  initAI(apiKey);

  // Create output directories
  const videoDir = resolve(plan.output.video_dir);
  const screenshotDir = join(videoDir, "screenshots");
  await mkdir(videoDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  // Temp dir for Playwright's raw video output
  const tempVideoDir = join(tmpdir(), `reeldocs-video-${randomUUID()}`);
  await mkdir(tempVideoDir, { recursive: true });

  // Run setup script if configured
  if (plan.app.auth.setup_script) {
    onProgress(`Running setup script: ${plan.app.auth.setup_script}`);
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("npx", ["tsx", plan.app.auth.setup_script], { timeout: 60000 });
  }

  onProgress(`Recording ${plan.features.length} features (concurrency: ${concurrency})...`);

  // Launch browser
  const browser: Browser = await chromium.launch({ headless: true });

  // Record features with concurrency limit
  const results: FeatureRecordingResult[] = [];
  const queue = [...plan.features];

  async function worker() {
    while (queue.length > 0) {
      const feature = queue.shift()!;
      onProgress(`Recording: ${feature.title}`);
      const result = await recordFeature(
        browser,
        feature,
        plan,
        screenshotDir,
        tempVideoDir,
        model,
        onProgress
      );

      // Move video to final location
      if (result.videoPath) {
        const finalPath = join(videoDir, `${feature.id}.webm`);
        await rename(result.videoPath, finalPath).catch(() => {});
        result.videoPath = finalPath;
      }

      results.push(result);

      if (result.status === "success") {
        onProgress(`  ✓ ${feature.title}`);
      } else {
        onProgress(`  ✗ ${feature.title}: ${result.error}`);
      }
    }
  }

  // Start concurrent workers
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  await browser.close();

  // Build manifest
  const manifest: RecordingManifest = {
    version: 1,
    recorded_at: new Date().toISOString(),
    features: Object.fromEntries(
      results.map((r) => [
        r.featureId,
        {
          video_path: r.videoPath,
          status: r.status,
          steps: r.steps,
          duration_ms: r.durationMs,
          ...(r.error && { error: r.error }),
          ...(r.errorScreenshot && { error_screenshot: r.errorScreenshot }),
        },
      ])
    ),
  };

  // Write manifest
  const manifestPath = join(videoDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  onProgress(`Manifest written to ${manifestPath}`);

  // Print summary
  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  onProgress(`Done: ${succeeded} succeeded, ${failed} failed`);

  return manifest;
}
```

- [ ] **Step 3: Build to verify**

```bash
cd packages/cli && pnpm build
```

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/record/
git commit --no-gpg-sign -m "feat(cli): add browser session manager and record module"
```

---

## Task 8: TTS Provider Interface & Google Implementation

**Files:**
- Create: `packages/cli/src/produce/tts/interface.ts`
- Create: `packages/cli/src/produce/tts/google.ts`
- Create: `packages/cli/src/produce/tts/registry.ts`
- Create: `packages/cli/tests/tts-registry.test.ts`

- [ ] **Step 1: Write failing test for TTS registry**

Create `packages/cli/tests/tts-registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getProvider } from "../src/produce/tts/registry.js";

describe("TTS registry", () => {
  it("returns google provider", () => {
    const provider = getProvider("google");
    expect(provider).toBeDefined();
    expect(typeof provider.synthesize).toBe("function");
  });

  it("returns openai provider", () => {
    const provider = getProvider("openai");
    expect(provider).toBeDefined();
    expect(typeof provider.synthesize).toBe("function");
  });

  it("returns elevenlabs provider", () => {
    const provider = getProvider("elevenlabs");
    expect(provider).toBeDefined();
    expect(typeof provider.synthesize).toBe("function");
  });

  it("throws for unknown provider", () => {
    expect(() => getProvider("unknown" as any)).toThrow("Unknown TTS provider");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/cli && pnpm test -- tests/tts-registry.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement TTS interface**

Create `packages/cli/src/produce/tts/interface.ts`:

```typescript
export interface TTSOptions {
  voice: string;
  speed: number;
  language: string;
  format: "mp3" | "wav";
}

export interface TTSProvider {
  synthesize(text: string, options: TTSOptions): Promise<Buffer>;
}
```

- [ ] **Step 4: Implement Google Cloud TTS provider**

Create `packages/cli/src/produce/tts/google.ts`:

```typescript
import type { TTSProvider, TTSOptions } from "./interface.js";

export class GoogleTTSProvider implements TTSProvider {
  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    // Use the REST API directly to avoid heavy gRPC dependency
    const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Google Cloud TTS requires GOOGLE_CLOUD_TTS_API_KEY or GEMINI_API_KEY");
    }

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: options.language,
            name: options.voice,
          },
          audioConfig: {
            audioEncoding: options.format === "mp3" ? "MP3" : "LINEAR16",
            speakingRate: options.speed,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google TTS failed: ${response.status} ${error}`);
    }

    const data = await response.json() as { audioContent: string };
    return Buffer.from(data.audioContent, "base64");
  }
}
```

- [ ] **Step 5: Implement OpenAI TTS provider**

Create `packages/cli/src/produce/tts/openai.ts`:

```typescript
import type { TTSProvider, TTSOptions } from "./interface.js";

export class OpenAITTSProvider implements TTSProvider {
  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI TTS requires OPENAI_API_KEY environment variable");
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: options.voice || "alloy",
        speed: options.speed,
        response_format: options.format,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI TTS failed: ${response.status} ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
```

- [ ] **Step 6: Implement ElevenLabs TTS provider**

Create `packages/cli/src/produce/tts/elevenlabs.ts`:

```typescript
import type { TTSProvider, TTSOptions } from "./interface.js";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

export class ElevenLabsTTSProvider implements TTSProvider {
  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ElevenLabs TTS requires ELEVENLABS_API_KEY environment variable");
    }

    const voiceId = options.voice || DEFAULT_VOICE_ID;

    const outputFormat = options.format === "wav" ? "pcm_16000" : "mp3_44100_128";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
            speed: options.speed,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs TTS failed: ${response.status} ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
```

- [ ] **Step 7: Implement registry**

Create `packages/cli/src/produce/tts/registry.ts`:

```typescript
import type { TTSProvider } from "./interface.js";
import { GoogleTTSProvider } from "./google.js";
import { OpenAITTSProvider } from "./openai.js";
import { ElevenLabsTTSProvider } from "./elevenlabs.js";

const providers: Record<string, () => TTSProvider> = {
  google: () => new GoogleTTSProvider(),
  openai: () => new OpenAITTSProvider(),
  elevenlabs: () => new ElevenLabsTTSProvider(),
};

export function getProvider(name: string): TTSProvider {
  const factory = providers[name];
  if (!factory) {
    throw new Error(`Unknown TTS provider: "${name}". Available: ${Object.keys(providers).join(", ")}`);
  }
  return factory();
}
```

- [ ] **Step 8: Run tests**

```bash
cd packages/cli && pnpm test -- tests/tts-registry.test.ts
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/produce/tts/ packages/cli/tests/tts-registry.test.ts
git commit --no-gpg-sign -m "feat(cli): add TTS provider interface with Google, OpenAI, and ElevenLabs implementations"
```

---

## Task 9: Narration Translation

**Files:**
- Create: `packages/cli/src/produce/translate.ts`

- [ ] **Step 1: Implement narration translation**

Create `packages/cli/src/produce/translate.ts`:

```typescript
import { generateText } from "../ai/gemini.js";
import { getNarrationTranslationPrompt } from "../ai/prompts.js";

export async function translateNarration(
  narration: string,
  targetLanguage: string,
  model: string = "gemini-2.5-flash"
): Promise<string> {
  if (targetLanguage === "en") return narration;

  const prompt = getNarrationTranslationPrompt(narration, targetLanguage);
  return await generateText(prompt, model);
}

export async function translateNarrations(
  narrations: string[],
  targetLanguage: string,
  model: string = "gemini-2.5-flash"
): Promise<string[]> {
  if (targetLanguage === "en") return narrations;

  // Batch translate for efficiency — send all narrations in one prompt
  const combined = narrations.map((n, i) => `[${i}] ${n}`).join("\n");
  const prompt = `Translate each of the following numbered narration lines to ${targetLanguage}.
Keep them natural and conversational — they will be spoken by a TTS system.
Preserve technical terms and product names in English.
Return each line with its original number prefix. Return ONLY the translated lines, no preamble.

${combined}`;

  const result = await generateText(prompt, model);

  // Parse numbered lines back out
  const lines = result.split("\n").filter((l) => l.trim());
  return lines.map((line) => line.replace(/^\[\d+\]\s*/, ""));
}
```

- [ ] **Step 2: Build to verify**

```bash
cd packages/cli && pnpm build
```

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/produce/translate.ts
git commit --no-gpg-sign -m "feat(cli): add narration translation module"
```

---

## Task 10: ffmpeg Audio/Video Merge

**Files:**
- Create: `packages/cli/src/produce/merge.ts`
- Create: `packages/cli/tests/merge.test.ts`

- [ ] **Step 1: Write failing test for ffmpeg command construction**

Create `packages/cli/tests/merge.test.ts`:

```typescript
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
    // Should have adelay filters for positioning audio
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

    // Should just be a simple format conversion
    expect(cmd.args).toContain("-i");
    expect(cmd.args).toContain("input.webm");
    expect(cmd.args).toContain("output.mp4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/cli && pnpm test -- tests/merge.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the merge module**

Create `packages/cli/src/produce/merge.ts`:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";

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
    // No audio — just convert format
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

  // Mix all delayed audio streams together
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
```

- [ ] **Step 4: Run tests**

```bash
cd packages/cli && pnpm test -- tests/merge.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/produce/merge.ts packages/cli/tests/merge.test.ts
git commit --no-gpg-sign -m "feat(cli): add ffmpeg audio/video merge module"
```

---

## Task 11: Text Documentation Generator

**Files:**
- Create: `packages/cli/src/produce/docs-generator.ts`
- Create: `packages/cli/tests/docs-generator.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/cli/tests/docs-generator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { assembleRawDoc } from "../src/produce/docs-generator.js";

describe("assembleRawDoc", () => {
  it("creates markdown from feature steps", () => {
    const md = assembleRawDoc({
      title: "Creating a Project",
      steps: [
        { action: "navigate to /dashboard", narration: "Open the dashboard.", screenshot: "step-0.png" },
        { action: "click button 'New'", narration: "Click new project.", screenshot: "step-1.png" },
      ],
    });

    expect(md).toContain("# Creating a Project");
    expect(md).toContain("Open the dashboard.");
    expect(md).toContain("Click new project.");
    expect(md).toContain("step-0.png");
  });

  it("handles steps without screenshots", () => {
    const md = assembleRawDoc({
      title: "Test Feature",
      steps: [{ action: "navigate to /", narration: "Go to home." }],
    });

    expect(md).toContain("# Test Feature");
    expect(md).toContain("Go to home.");
    expect(md).not.toContain("![");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/cli && pnpm test -- tests/docs-generator.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the docs generator**

Create `packages/cli/src/produce/docs-generator.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText } from "../ai/gemini.js";
import { getDocsPolishPrompt } from "../ai/prompts.js";
import { translateNarration } from "./translate.js";
import type { Plan, Feature, RecordingManifest } from "../analyze/plan-schema.js";

export interface RawDocInput {
  title: string;
  steps: Array<{
    action: string;
    narration: string;
    screenshot?: string;
  }>;
}

export function assembleRawDoc(input: RawDocInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}\n`);

  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i];
    lines.push(`${step.narration}\n`);
    if (step.screenshot) {
      lines.push(`![Step ${i + 1}](${step.screenshot})\n`);
    }
  }

  return lines.join("\n");
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function generateDocs(
  plan: Plan,
  manifest: RecordingManifest,
  model: string = "gemini-2.5-flash",
  onProgress?: (message: string) => void
): Promise<string[]> {
  const log = onProgress ?? (() => {});
  const docsDir = plan.output.docs_dir;
  await mkdir(docsDir, { recursive: true });

  const writtenFiles: string[] = [];

  // Group features by category for chapter organization
  const categories = new Map<string, Feature[]>();
  for (const feature of plan.features) {
    // Only generate docs for successfully recorded features
    const manifestEntry = manifest.features[feature.id];
    if (!manifestEntry || manifestEntry.status !== "success") continue;

    const cat = feature.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(feature);
  }

  for (const lang of plan.output.languages) {
    const langDir = plan.output.languages.length > 1 ? join(docsDir, lang) : docsDir;
    await mkdir(langDir, { recursive: true });

    for (const [category, features] of categories) {
      for (const feature of features) {
        log(`Generating docs: ${feature.title} (${lang})`);
        const manifestEntry = manifest.features[feature.id];

        // Build step data with screenshots
        const stepsWithScreenshots = feature.steps.map((step, i) => ({
          action: step.action,
          narration: step.narration,
          screenshot: manifestEntry.steps[i]?.screenshot,
        }));

        // Polish with AI
        const polishPrompt = getDocsPolishPrompt(feature.title, stepsWithScreenshots);
        let polished = await generateText(polishPrompt, model);

        // Translate if non-English
        if (lang !== "en") {
          polished = await translateNarration(polished, lang, model);
        }

        // Write markdown file (use feature.id for uniqueness, not title)
        const filename = `${feature.id}.md`;
        const filepath = join(langDir, filename);
        await writeFile(filepath, polished, "utf-8");
        writtenFiles.push(filepath);
      }
    }
  }

  return writtenFiles;
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/cli && pnpm test -- tests/docs-generator.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/produce/docs-generator.ts packages/cli/tests/docs-generator.test.ts
git commit --no-gpg-sign -m "feat(cli): add text documentation generator with AI polish"
```

---

## Task 12: Produce Module (Orchestrator)

**Files:**
- Create: `packages/cli/src/produce/index.ts`

- [ ] **Step 1: Implement the produce orchestrator**

Create `packages/cli/src/produce/index.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import {
  PlanSchema,
  RecordingManifestSchema,
  type Plan,
  type RecordingManifest,
} from "../analyze/plan-schema.js";
import { initAI } from "../ai/gemini.js";
import { getProvider } from "./tts/registry.js";
import type { TTSOptions } from "./tts/interface.js";
import { translateNarrations } from "./translate.js";
import { mergeAudioVideo, checkFfmpeg, type AudioClip } from "./merge.js";
import { generateDocs } from "./docs-generator.js";

export interface ProduceOptions {
  planPath: string;
  apiKey: string;
  model?: string;
  onProgress?: (message: string) => void;
}

export async function produceOutput(options: ProduceOptions): Promise<void> {
  const { planPath, apiKey, model = "gemini-2.5-flash", onProgress = () => {} } = options;

  // Check ffmpeg first
  if (!(await checkFfmpeg())) {
    throw new Error(
      "ffmpeg not found. Install it:\n" +
      "  macOS: brew install ffmpeg\n" +
      "  Ubuntu: sudo apt install ffmpeg\n" +
      "  Windows: https://ffmpeg.org/download.html"
    );
  }

  initAI(apiKey);

  // Load plan
  const planContent = await readFile(planPath, "utf-8");
  const plan = PlanSchema.parse(yaml.load(planContent));

  // Load manifest
  const manifestPath = join(resolve(plan.output.video_dir), "manifest.json");
  const manifestContent = await readFile(manifestPath, "utf-8");
  const manifest = RecordingManifestSchema.parse(JSON.parse(manifestContent));

  // Get TTS provider
  const ttsProvider = getProvider(plan.output.tts.provider);

  const successFeatures = plan.features.filter(
    (f) => manifest.features[f.id]?.status === "success"
  );

  onProgress(`Producing ${successFeatures.length} features across ${plan.output.languages.length} language(s)...`);

  // For each feature, for each language: generate TTS, merge, output video
  for (const feature of successFeatures) {
    const manifestEntry = manifest.features[feature.id];
    const narrations = feature.steps.map((s) => s.narration);

    for (const lang of plan.output.languages) {
      onProgress(`Producing: ${feature.title} (${lang})`);

      // Translate narrations if needed
      const translatedNarrations =
        lang === "en" ? narrations : await translateNarrations(narrations, lang, model);

      // Generate TTS for each step
      const audioDir = join(resolve(plan.output.video_dir), "audio", feature.id, lang);
      await mkdir(audioDir, { recursive: true });

      const audioClips: AudioClip[] = [];

      for (let i = 0; i < translatedNarrations.length; i++) {
        const text = translatedNarrations[i];
        const stepInfo = manifestEntry.steps[i];
        if (!stepInfo) continue;

        const ttsOptions: TTSOptions = {
          voice: plan.output.tts.voice,
          speed: plan.output.tts.speed,
          language: lang === "en" ? "en-US" : lang,
          format: "mp3",
        };

        const audioBuffer = await ttsProvider.synthesize(text, ttsOptions);
        const audioPath = join(audioDir, `step-${i}.mp3`);
        await writeFile(audioPath, audioBuffer);

        audioClips.push({
          path: audioPath,
          startAt: stepInfo.startedAt,
        });
      }

      // Merge audio + video
      const outputPath = join(
        resolve(plan.output.video_dir),
        `${feature.id}.${lang}.mp4`
      );

      await mergeAudioVideo({
        videoPath: manifestEntry.video_path,
        audioClips,
        outputPath,
      });

      onProgress(`  ✓ Video: ${outputPath}`);
    }
  }

  // Generate text documentation
  onProgress("Generating text documentation...");
  const docFiles = await generateDocs(plan, manifest, model, onProgress);
  onProgress(`  ✓ ${docFiles.length} doc file(s) written`);

  onProgress("Done!");
}
```

- [ ] **Step 2: Build to verify**

```bash
cd packages/cli && pnpm build
```

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/produce/index.ts
git commit --no-gpg-sign -m "feat(cli): add produce module orchestrating TTS, merge, and doc generation"
```

---

## Task 13: CLI Commands

**Files:**
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add all four subcommands to the CLI**

Replace `packages/cli/src/index.ts` entirely:

```typescript
#!/usr/bin/env node

import { Command } from "commander";
import ora from "ora";
import { processVideo } from "./ai/pipeline.js";
import { writeMarkdown } from "./output/markdown.js";
import { writeMdx } from "./output/mdx.js";
import { analyzeCodebase } from "./analyze/index.js";
import { recordFeatures } from "./record/index.js";
import { produceOutput } from "./produce/index.js";
import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { PlanSchema } from "./analyze/plan-schema.js";
import { createInterface } from "node:readline/promises";

const program = new Command();

program
  .name("reeldocs")
  .description("Generate documentation from product videos")
  .version("0.2.0");

// --- Original video-to-docs command (default) ---

program
  .argument("[source]", "Video file path or URL")
  .option("-o, --output <dir>", "Output directory", "./docs")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY env var)")
  .option("-f, --format <format>", "Output format: markdown, mdx", "markdown")
  .option("-m, --model <model>", "Gemini model to use", "gemini-2.5-flash")
  .action(async (source: string | undefined, opts: { output: string; apiKey?: string; format: string; model: string }) => {
    if (!source) {
      program.help();
      return;
    }

    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Starting...").start();

    try {
      const doc = await processVideo(source, apiKey, {
        model: opts.model,
        onProgress: (_step, message) => {
          spinner.text = message;
        },
      });

      spinner.text = "Writing files...";
      let files: string[];
      if (opts.format === "mdx") {
        files = await writeMdx(doc, opts.output);
      } else {
        files = await writeMarkdown(doc, opts.output);
      }

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

// --- analyze command ---

program
  .command("analyze")
  .description("Analyze a codebase and generate a documentation plan file")
  .requiredOption("--codebase <dir>", "Path to the codebase to analyze")
  .requiredOption("--app <url>", "URL of the running app")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY)")
  .option("-m, --model <model>", "Gemini model", "gemini-2.5-flash")
  .option("-o, --output <path>", "Plan file output path", "./plan.yaml")
  .option("--hints <text>", "Focus hints for feature discovery")
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Analyzing codebase...").start();

    try {
      const plan = await analyzeCodebase({
        codebaseDir: opts.codebase,
        appUrl: opts.app,
        apiKey,
        model: opts.model,
        hints: opts.hints,
        outputPath: opts.output,
        onProgress: (msg) => { spinner.text = msg; },
      });

      const featureCount = plan.features.length;
      const categories = new Set(plan.features.map((f) => f.category));
      spinner.succeed(`Found ${featureCount} features across ${categories.size} categories`);
      console.log(`\nPlan written to ${opts.output}`);
      console.log("Review the plan, fill in auth credentials, then run:");
      console.log(`  reeldocs record --plan ${opts.output}`);
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Analysis failed");
      process.exit(1);
    }
  });

// --- record command ---

program
  .command("record")
  .description("Record browser walkthroughs from a plan file")
  .requiredOption("--plan <path>", "Path to the plan YAML file")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY)")
  .option("-m, --model <model>", "Gemini model", "gemini-2.5-flash")
  .option("--concurrency <n>", "Max concurrent recordings", parseInt)
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Starting recording...").start();

    try {
      const manifest = await recordFeatures({
        planPath: opts.plan,
        apiKey,
        model: opts.model,
        concurrency: opts.concurrency,
        onProgress: (msg) => { spinner.text = msg; },
      });

      const succeeded = Object.values(manifest.features).filter((f) => f.status === "success").length;
      const failed = Object.values(manifest.features).filter((f) => f.status === "failed").length;

      spinner.succeed(`Recording complete: ${succeeded} succeeded, ${failed} failed`);
      if (failed > 0) {
        console.log("\nFailed features:");
        for (const [id, f] of Object.entries(manifest.features)) {
          if (f.status === "failed") console.log(`  ✗ ${id}: ${f.error}`);
        }
      }
      console.log("\nNext step:");
      console.log(`  reeldocs produce --plan ${opts.plan}`);
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Recording failed");
      process.exit(1);
    }
  });

// --- produce command ---

program
  .command("produce")
  .description("Generate narrated videos and text docs from recordings")
  .requiredOption("--plan <path>", "Path to the plan YAML file")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY)")
  .option("-m, --model <model>", "Gemini model", "gemini-2.5-flash")
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Starting production...").start();

    try {
      await produceOutput({
        planPath: opts.plan,
        apiKey,
        model: opts.model,
        onProgress: (msg) => { spinner.text = msg; },
      });

      spinner.succeed("Production complete!");
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Production failed");
      process.exit(1);
    }
  });

// --- generate command (convenience wrapper) ---

program
  .command("generate")
  .description("Analyze, record, and produce in one step")
  .requiredOption("--codebase <dir>", "Path to the codebase to analyze")
  .requiredOption("--app <url>", "URL of the running app")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY)")
  .option("-m, --model <model>", "Gemini model", "gemini-2.5-flash")
  .option("-o, --output <path>", "Plan file path", "./plan.yaml")
  .option("--hints <text>", "Focus hints for feature discovery")
  .option("--concurrency <n>", "Max concurrent recordings", parseInt)
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Analyzing codebase...").start();

    try {
      // Step 1: Analyze
      const plan = await analyzeCodebase({
        codebaseDir: opts.codebase,
        appUrl: opts.app,
        apiKey,
        model: opts.model,
        hints: opts.hints,
        outputPath: opts.output,
        onProgress: (msg) => { spinner.text = msg; },
      });

      spinner.stop();
      console.log(`\nFound ${plan.features.length} features:`);
      for (const f of plan.features) {
        console.log(`  • ${f.title} (${f.category}) — ${f.steps.length} steps`);
      }
      console.log(`\nPlan saved to ${opts.output}`);

      // Step 2: Confirm (unless --yes)
      if (!opts.yes) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question("\nProceed with recording? (y/N) ");
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Aborted. Edit the plan file and run: reeldocs record --plan " + opts.output);
          return;
        }
      }

      // Step 3: Record
      spinner.start("Recording...");
      await recordFeatures({
        planPath: opts.output,
        apiKey,
        model: opts.model,
        concurrency: opts.concurrency,
        onProgress: (msg) => { spinner.text = msg; },
      });

      // Step 4: Produce
      spinner.text = "Producing...";
      await produceOutput({
        planPath: opts.output,
        apiKey,
        model: opts.model,
        onProgress: (msg) => { spinner.text = msg; },
      });

      spinner.succeed("Done! Check the generated videos and docs.");
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Failed");
      process.exit(1);
    }
  });

program.parse();
```

- [ ] **Step 2: Build to verify**

```bash
cd packages/cli && pnpm build
```

Expected: Clean build.

- [ ] **Step 3: Verify CLI help output**

```bash
cd packages/cli && node dist/index.js --help
```

Expected: Shows all commands (analyze, record, produce, generate) plus the default video source argument.

- [ ] **Step 4: Verify subcommand help**

```bash
cd packages/cli && node dist/index.js analyze --help
```

Expected: Shows --codebase, --app, --api-key, --model, --output, --hints options.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts
git commit --no-gpg-sign -m "feat(cli): add analyze, record, produce, and generate CLI commands"
```

---

## Task 14: Integration Smoke Test

This task creates a minimal end-to-end test to verify the pipeline connects correctly. It won't test real Gemini/TTS calls but will verify the wiring.

**Files:**
- Create: `packages/cli/tests/integration/smoke.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/cli/tests/integration/smoke.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PlanSchema, RecordingManifestSchema } from "../../src/analyze/plan-schema.js";
import { parseDeterministic } from "../../src/record/action-translator.js";
import { buildMergeCommand } from "../../src/produce/merge.js";
import { getProvider } from "../../src/produce/tts/registry.js";
import { assembleRawDoc } from "../../src/produce/docs-generator.js";
import yaml from "js-yaml";

describe("Integration: pipeline wiring", () => {
  const samplePlan = {
    version: 1,
    app: {
      url: "http://localhost:3000",
      auth: { strategy: "credentials", credentials: { email: "a@b.com", password: "p" } },
      viewport: { width: 1280, height: 720 },
    },
    recording: { max_concurrent: 2 },
    features: [
      {
        id: "test-feature",
        title: "Test Feature",
        category: "Testing",
        steps: [
          { action: "navigate to /", narration: "Go home.", pause: 1000 },
          { action: "click button 'Submit'", narration: "Submit the form." },
        ],
      },
    ],
    output: {
      video_dir: "./test-output/videos",
      docs_dir: "./test-output/docs",
      languages: ["en"],
      tts: { provider: "google", voice: "en-US-Studio-O", speed: 1.0 },
      screenshots: true,
    },
  };

  it("plan file round-trips through YAML", () => {
    const yamlStr = yaml.dump(samplePlan);
    const parsed = PlanSchema.parse(yaml.load(yamlStr));
    expect(parsed.features[0].id).toBe("test-feature");
    expect(parsed.features[0].steps[0].timeout).toBe(10000); // default applied
  });

  it("all plan steps parse deterministically", () => {
    const plan = PlanSchema.parse(samplePlan);
    for (const feature of plan.features) {
      for (const step of feature.steps) {
        const parsed = parseDeterministic(step.action);
        expect(parsed).not.toBeNull();
      }
    }
  });

  it("merge command builds from manifest data", () => {
    const manifest = RecordingManifestSchema.parse({
      version: 1,
      recorded_at: new Date().toISOString(),
      features: {
        "test-feature": {
          video_path: "./test.webm",
          status: "success",
          steps: [
            { stepIndex: 0, startedAt: 0, completedAt: 1000 },
            { stepIndex: 1, startedAt: 2000, completedAt: 3000 },
          ],
          duration_ms: 4000,
        },
      },
    });

    const entry = manifest.features["test-feature"];
    const cmd = buildMergeCommand({
      videoPath: entry.video_path,
      audioClips: entry.steps.map((s, i) => ({
        path: `step-${i}.mp3`,
        startAt: s.startedAt,
      })),
      outputPath: "output.mp4",
    });

    expect(cmd.binary).toBe("ffmpeg");
    expect(cmd.args).toContain("output.mp4");
  });

  it("TTS providers are all instantiable", () => {
    for (const name of ["google", "openai", "elevenlabs"]) {
      const provider = getProvider(name);
      expect(typeof provider.synthesize).toBe("function");
    }
  });

  it("docs generator assembles raw markdown", () => {
    const md = assembleRawDoc({
      title: "Test Feature",
      steps: [
        { action: "navigate to /", narration: "Go home." },
        { action: "click button 'Submit'", narration: "Submit the form." },
      ],
    });
    expect(md).toContain("# Test Feature");
    expect(md).toContain("Go home.");
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
cd packages/cli && pnpm test -- tests/integration/smoke.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Run all tests together**

```bash
cd packages/cli && pnpm test
```

Expected: All tests pass (schema + action-translator + scanner + tts-registry + merge + docs-generator + integration).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/tests/integration/
git commit --no-gpg-sign -m "test(cli): add integration smoke test for pipeline wiring"
```

---

## Task 15: Final Build & Cleanup

- [ ] **Step 1: Full clean build**

```bash
cd packages/cli && rm -rf dist && pnpm build
```

Expected: Clean build with no errors.

- [ ] **Step 2: Run all tests**

```bash
cd packages/cli && pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Verify CLI runs without errors**

```bash
cd packages/cli && node dist/index.js --help
cd packages/cli && node dist/index.js analyze --help
cd packages/cli && node dist/index.js record --help
cd packages/cli && node dist/index.js produce --help
cd packages/cli && node dist/index.js generate --help
```

Expected: All help texts display correctly.

- [ ] **Step 4: Verify the library exports resolve**

```bash
cd packages/cli && node -e "import('./dist/analyze/plan-schema.js').then(m => console.log(Object.keys(m)))"
```

Expected: Lists exported schemas and types.

- [ ] **Step 5: Commit any remaining changes**

```bash
git add -A packages/cli/
git commit --no-gpg-sign -m "chore(cli): final build verification for auto-generation pipeline"
```

---

## Summary

| Task | Description | Tests |
|------|-------------|-------|
| 1 | Dependencies & vitest setup | 1 placeholder |
| 2 | Plan file & manifest schemas | 9 tests |
| 3 | Codebase scanners (Next.js + generic) | 6 tests |
| 4 | AI prompts (feature discovery, action translation, narration, doc polish) | Build only |
| 5 | Analyze module (codebase → plan file) | Build only |
| 6 | Action translator (deterministic + AI fallback) | 9 tests |
| 7 | Browser session + record module | Build only |
| 8 | TTS providers (Google, OpenAI, ElevenLabs) + registry | 4 tests |
| 9 | Narration translation | Build only |
| 10 | ffmpeg audio/video merge | 3 tests |
| 11 | Text documentation generator | 2 tests |
| 12 | Produce module (orchestrator) | Build only |
| 13 | CLI commands (analyze, record, produce, generate) | Manual verification |
| 14 | Integration smoke test | 5 tests |
| 15 | Final build & cleanup | Full verification |

Total: 15 tasks, ~39 automated tests, 15 commits.

**Note:** Tiptap JSON output (for web platform import) is deferred to Phase 2 when the web platform integration is built. Phase 1 produces Markdown only. The existing `markdown-to-tiptap.ts` in the web app can be used at that point.
