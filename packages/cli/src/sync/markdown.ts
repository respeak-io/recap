import { rewriteInternalLinks, type LinkMap } from "./links.js";

/** Strip the leading H1 — the title comes from the manifest, not the file. */
export function stripH1(content: string): string {
  return content.replace(/^#\s+.+\n*/, "");
}

/** Replace `media/<filename>` references with their uploaded URLs. */
export function swapMediaUrls(content: string, imageUrls: Record<string, string>): string {
  let out = content;
  for (const [filename, url] of Object.entries(imageUrls)) {
    out = out.split(`media/${filename}`).join(url);
  }
  return out;
}

/**
 * Prepare a markdown file for sync: strip the H1, rewrite relative `.md`
 * cross-links to public slug URLs, then swap local media paths for uploaded
 * URLs. Order matters (H1 first, then links, then media), mirroring the
 * reference client.
 */
export function processMarkdown(
  content: string,
  relPath: string,
  linkMap: LinkMap,
  projectSlug: string,
  imageUrls: Record<string, string>,
  onWarn?: (message: string) => void,
): string {
  let out = stripH1(content);
  out = rewriteInternalLinks(out, relPath, linkMap, projectSlug, onWarn);
  out = swapMediaUrls(out, imageUrls);
  return out.trim();
}

/**
 * Approximate the server's plain-text rendering (`content_text`) of a markdown
 * file, for the diff word-overlap check. Strips the H1, collapses links and
 * images to their visible text/alt, removes markdown/custom-block/HTML markers,
 * and collapses whitespace. Mirrors the reference `read_local_md` +
 * `extract_plain_text`.
 */
export function toPlainText(content: string): string {
  let text = stripH1(content);
  // Collapse links and images to their visible text/alt.
  text = text.replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Heading markers.
  text = text.replace(/^#{1,6}\s+/gm, "");
  // Bold / italic markers.
  text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  // Inline code.
  text = text.replace(/`([^`]+)`/g, "$1");
  // Custom-block fences (`:::steps`, `::tab{...}`, etc.).
  text = text.replace(/^::.*$/gm, "");
  // HTML tags.
  text = text.replace(/<[^>]+>/g, "");
  // Collapse whitespace.
  text = text.replace(/\s+/g, " ");
  return text.trim();
}

/**
 * Tokenize text into a set of lowercased word tokens. Unicode-aware
 * (`\p{L}\p{N}`) so umlauts and other letters count — JS `\w` does not match
 * them. This is why leftover markup punctuation (table pipes, list dashes,
 * code fences) does not register as a content difference.
 */
export function tokenize(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  return new Set(matches);
}

/** Word-overlap ratio between two texts: |A ∩ B| / max(|A|, |B|). */
export function wordOverlap(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / Math.max(sa.size, sb.size);
}
