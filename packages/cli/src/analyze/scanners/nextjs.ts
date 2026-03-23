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
const MAX_SOURCE_LENGTH = 2000;

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
