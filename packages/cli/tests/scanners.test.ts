import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanNextjs } from "../src/analyze/scanners/nextjs.js";
import { scanGeneric } from "../src/analyze/scanners/generic.js";

describe("scanNextjs", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "reeldocs-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("discovers App Router pages", async () => {
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
    expect(result).not.toBeNull();
    expect(result!.framework).toBe("nextjs-app-router");
    expect(result!.routes).toHaveLength(3);
    expect(result!.routes.map((r) => r.path)).toContain("/");
    expect(result!.routes.map((r) => r.path)).toContain("/dashboard");
    expect(result!.routes.map((r) => r.path)).toContain("/settings");
  });

  it("detects route groups (parenthesized dirs)", async () => {
    const appDir = join(tempDir, "app");
    await mkdir(join(appDir, "(dashboard)", "projects"), { recursive: true });
    await writeFile(
      join(appDir, "(dashboard)", "projects", "page.tsx"),
      'export default function Projects() { return <div>Projects</div> }'
    );

    const result = await scanNextjs(tempDir);
    expect(result).not.toBeNull();
    expect(result!.routes.map((r) => r.path)).toContain("/projects");
  });

  it("detects dynamic segments", async () => {
    const appDir = join(tempDir, "app");
    await mkdir(join(appDir, "project", "[slug]"), { recursive: true });
    await writeFile(
      join(appDir, "project", "[slug]", "page.tsx"),
      'export default function Project() { return <div>Project</div> }'
    );

    const result = await scanNextjs(tempDir);
    expect(result).not.toBeNull();
    expect(result!.routes[0].path).toBe("/project/[slug]");
    expect(result!.routes[0].isDynamic).toBe(true);
  });

  it("includes component source code snippets", async () => {
    const appDir = join(tempDir, "app");
    await mkdir(appDir, { recursive: true });
    const source = 'export default function Home() { return <div><button>Click me</button></div> }';
    await writeFile(join(appDir, "page.tsx"), source);

    const result = await scanNextjs(tempDir);
    expect(result).not.toBeNull();
    expect(result!.routes[0].componentSource).toContain("button");
  });

  it("returns null for non-Next.js codebases", async () => {
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
    await writeFile(join(tempDir, "src", "pages", "Home.page.tsx"), "export default function Home() {}");
    await writeFile(join(tempDir, "src", "pages", "Login.page.tsx"), "export default function Login() {}");

    const result = await scanGeneric(tempDir);
    expect(result.framework).toBe("generic");
    expect(result.routes.length).toBeGreaterThanOrEqual(2);
  });
});
