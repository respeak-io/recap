/**
 * Structural comparison of two editor documents (Tiptap JSON). Plain text alone
 * misses everything that only lives in the structure: a code block's language,
 * link targets, bold/italic, heading levels, callout types, image sources.
 */

interface RawNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  marks?: { type: string; attrs?: Record<string, unknown> | null }[] | null;
  content?: RawNode[] | null;
}

interface Node {
  type: string;
  text: string;
  attrs: Record<string, unknown>;
  /** One JSON string per mark, sorted, so they compare by value. */
  marks: string[];
  content: Node[];
}

export interface StructureOptions {
  /** Set when the remote image URLs are unknown and `src` can't be compared. */
  ignoreImageSrc?: boolean;
}

/**
 * Describe the first difference between two documents, or null when they are
 * equivalent. Representation noise is ignored: key order, null attributes,
 * empty content/marks, mark order and how a run of text is split into nodes.
 */
export function firstStructureDiff(
  local: unknown,
  remote: unknown,
  options: StructureOptions = {},
): string | null {
  return compare(normalize(local as RawNode, options), normalize(remote as RawNode, options));
}

/** Visible text of a document, for showing where two versions diverge. */
export function docText(doc: unknown): string {
  const out: string[] = [];
  const walk = (node: RawNode | null | undefined) => {
    if (node?.text) out.push(node.text);
    for (const child of node?.content ?? []) walk(child);
  };
  walk(doc as RawNode);
  return out.join(" ");
}

function cleanAttrs(attrs: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attrs ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

function normalize(node: RawNode | null | undefined, options: StructureOptions): Node {
  const attrs = cleanAttrs(node?.attrs);
  if (options.ignoreImageSrc && node?.type === "image") delete attrs.src;

  const content: Node[] = [];
  for (const raw of node?.content ?? []) {
    const child = normalize(raw, options);
    const prev = content[content.length - 1];
    if (child.type === "text" && prev?.type === "text" && same(child.marks, prev.marks)) {
      prev.text += child.text;
    } else {
      content.push(child);
    }
  }
  return {
    type: node?.type ?? "",
    text: node?.text ?? "",
    attrs,
    marks: (node?.marks ?? []).map((m) => JSON.stringify([m.type, cleanAttrs(m.attrs)])).sort(),
    content,
  };
}

function compare(local: Node, remote: Node): string | null {
  if (local.type !== remote.type) return `block type: remote=${remote.type}, local=${local.type}`;
  for (const key of [...new Set([...Object.keys(local.attrs), ...Object.keys(remote.attrs)])].sort()) {
    if (!same(local.attrs[key], remote.attrs[key])) {
      return `${local.type} ${key}: remote=${show(remote.attrs[key])}, local=${show(local.attrs[key])}`;
    }
  }
  if (local.text !== remote.text) {
    return `text: remote=${show(clip(remote.text))}, local=${show(clip(local.text))}`;
  }
  if (!same(local.marks, remote.marks)) {
    return `formatting of ${show(clip(local.text))}: remote=${marks(remote)}, local=${marks(local)}`;
  }
  for (let i = 0; i < Math.min(local.content.length, remote.content.length); i++) {
    const found = compare(local.content[i], remote.content[i]);
    if (found) return found;
  }
  if (local.content.length !== remote.content.length) {
    return `${local.type} children: remote=${remote.content.length}, local=${local.content.length}`;
  }
  return null;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function show(v: unknown): string {
  return v === undefined ? "none" : JSON.stringify(v);
}

function clip(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function marks(node: Node): string {
  if (node.marks.length === 0) return "none";
  return node.marks
    .map((m) => {
      const [type, attrs] = JSON.parse(m) as [string, Record<string, unknown>];
      return Object.keys(attrs).length > 0 ? `${type}${JSON.stringify(attrs)}` : type;
    })
    .join("+");
}
