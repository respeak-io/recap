import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
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
