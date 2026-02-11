import slugify from "slugify";

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
}

export function extractHeadings(content: { content?: TiptapNode[] }) {
  const headings: { id: string; text: string; level: number }[] = [];
  if (!content.content) return headings;

  for (const node of content.content) {
    if (node.type === "heading" && node.content) {
      const text = node.content.map((n) => n.text ?? "").join("");
      const level = (node.attrs?.level as number) ?? 2;
      const id = slugify(text, { lower: true, strict: true });
      headings.push({ id, text, level });
    }
  }
  return headings;
}
