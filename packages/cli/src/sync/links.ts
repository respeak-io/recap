import path from "node:path";
import type { SyncManifest } from "./manifest.js";
import { getArticleLang } from "./manifest.js";

export type LinkMap = Map<string, string>;

/**
 * Map each repo-relative `.md` path to the public slug it should link to.
 *
 * Articles and chapter intros are addressed on the docs site by slug
 * (`/<project_slug>/<slug>`), not by file path, so relative cross-links written
 * in the Markdown source must be rewritten to those slugs at sync time. This
 * builds the path -> slug index from the manifest (chapter `_index` files AND
 * every article language file).
 */
export function buildLinkMap(manifest: SyncManifest): LinkMap {
  const map: LinkMap = new Map();
  for (const chapter of manifest.chapters) {
    for (const rel of Object.values(chapter.content ?? {})) {
      map.set(rel, chapter.slug);
    }
    for (const article of chapter.articles) {
      for (const lang of manifest.languages) {
        const got = getArticleLang(article, lang);
        if (got && got.ok) map.set(got.value.file, article.slug);
      }
    }
  }
  return map;
}

// [text](relpath.md#fragment) — fragment optional, path must not contain `)`/`#`.
const LINK_RE = /\[([^\]]+)\]\(([^)#]+?\.md)(#[^)]*)?\)/g;
const EXTERNAL_PREFIXES = ["http://", "https://", "/", "#", "mailto:"];

/**
 * Rewrite relative `.md` cross-links to public slug URLs.
 *
 * Each link is resolved against its source file's directory and replaced with
 * `/<projectSlug>/<slug>`, carrying over any `#fragment`. External links
 * (`http(s)://`, `mailto:`), in-page anchors (`#...`) and already-absolute
 * (`/...`) links are left untouched. Unresolvable `.md` links are left as-is
 * and reported via `onWarn`.
 *
 * This lives in the CLIENT, not the server: only the client knows the source
 * file tree the relative paths are written against.
 */
export function rewriteInternalLinks(
  content: string,
  relPath: string,
  linkMap: LinkMap,
  projectSlug: string,
  onWarn: (message: string) => void = () => {},
): string {
  const srcDir = path.posix.dirname(toPosix(relPath));
  return content.replace(LINK_RE, (match, text: string, target: string, frag?: string) => {
    const fragment = frag ?? "";
    if (EXTERNAL_PREFIXES.some((p) => target.startsWith(p))) return match;
    const resolved = path.posix.normalize(path.posix.join(srcDir, target));
    const slug = linkMap.get(resolved);
    if (!slug) {
      onWarn(`unresolved cross-link in ${relPath}: ${target}`);
      return match;
    }
    return `[${text}](/${projectSlug}/${slug}${fragment})`;
  });
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
