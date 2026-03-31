import { Lexer, type Token, type Tokens } from "marked";

type TiptapNode = Record<string, unknown>;

/**
 * Convert markdown sections into Tiptap JSON document structure.
 * Handles: headings, paragraphs, bold, italic, code, links, lists,
 * code blocks, blockquotes, images, horizontal rules, tables,
 * and [video:MM:SS] timestamp references.
 */
export function markdownToTiptap(
  sections: { heading: string; content: string; timestamp_ref?: string }[]
): { type: string; content: TiptapNode[] } {
  const nodes: TiptapNode[] = [];

  for (const section of sections) {
    // Section heading
    const headingInline = parseInlineText(section.heading);

    // If there's a timestamp_ref, prepend a timestamp link
    if (section.timestamp_ref) {
      const seconds = parseTimestamp(section.timestamp_ref);
      if (seconds > 0) {
        headingInline.unshift(
          {
            type: "timestampLink",
            attrs: { seconds },
          },
          { type: "text", text: " " }
        );
      }
    }

    nodes.push({
      type: "heading",
      attrs: { level: 2 },
      content: headingInline,
    });

    // Parse the markdown content
    const tokens = new Lexer().lex(section.content);
    nodes.push(...tokensToTiptap(tokens));
  }

  return { type: "doc", content: nodes };
}

/**
 * Convert a raw markdown string into Tiptap JSON document structure.
 * Unlike markdownToTiptap (which takes pre-split sections), this takes
 * a single markdown string — suitable for API input from agents.
 * Also returns plain text for full-text search indexing.
 */
export function markdownToTiptapRaw(
  markdown: string
): { doc: { type: string; content: TiptapNode[] }; text: string } {
  // Pre-process custom blocks before standard markdown tokenization
  const { cleaned, customBlocks } = extractCustomBlocks(markdown);

  const tokens = new Lexer().lex(cleaned);
  const standardNodes = tokensToTiptap(tokens);

  // Replace placeholder nodes with custom block nodes (recursive)
  const nodes = replacePlaceholders(standardNodes, customBlocks);

  const doc = { type: "doc", content: nodes };
  const text = extractPlainText(nodes);

  return { doc, text };
}

// Placeholder uses <!-- --> HTML comment syntax to avoid being parsed
// as markdown formatting (double underscores __ trigger bold).
const PLACEHOLDER_RE = /^<!--CB:(\d+)-->$/;

function replacePlaceholders(
  nodes: TiptapNode[],
  customBlocks: TiptapNode[]
): TiptapNode[] {
  const result: TiptapNode[] = [];

  for (const node of nodes) {
    // Check if this is a paragraph containing only a placeholder
    if (node.type === "paragraph" && Array.isArray(node.content)) {
      // Collect all text content to check for placeholder
      const texts = (node.content as TiptapNode[])
        .filter((c) => typeof c.text === "string")
        .map((c) => (c.text as string).trim())
        .filter(Boolean);

      if (texts.length === 1) {
        const match = texts[0].match(PLACEHOLDER_RE);
        if (match) {
          const idx = parseInt(match[1], 10);
          if (customBlocks[idx]) {
            result.push(customBlocks[idx]);
            continue;
          }
        }
      }

      // Check if the paragraph has mixed content with placeholders inline
      // e.g. text before <!--CB:0--> text after
      const hasPlaceholder = texts.some((t) => PLACEHOLDER_RE.test(t));
      if (hasPlaceholder) {
        // Split: emit non-placeholder content as paragraph, placeholders as blocks
        for (const child of node.content as TiptapNode[]) {
          const childText = typeof child.text === "string" ? child.text.trim() : "";
          const m = childText.match(PLACEHOLDER_RE);
          if (m) {
            const idx = parseInt(m[1], 10);
            if (customBlocks[idx]) result.push(customBlocks[idx]);
          } else if (childText) {
            result.push({ type: "paragraph", content: [child] });
          }
        }
        continue;
      }
    }

    // Check plain text nodes at any level (shouldn't happen but safety net)
    if (typeof node.text === "string") {
      const match = node.text.trim().match(PLACEHOLDER_RE);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (customBlocks[idx]) {
          result.push(customBlocks[idx]);
          continue;
        }
      }
    }

    // Recurse into children
    if (Array.isArray(node.content)) {
      result.push({
        ...node,
        content: replacePlaceholders(node.content as TiptapNode[], customBlocks),
      });
    } else {
      result.push(node);
    }
  }

  return result;
}

/**
 * Extract custom block syntax (callouts, steps, tabs, details) from markdown,
 * replace with placeholders, and return the Tiptap nodes for each.
 *
 * Supported syntax:
 *
 * Callouts:     :::note|:::warning|:::tip ... :::
 * Steps:        :::steps ... ::: (split by ### headings)
 * Tabs:         :::tabs ... ::: (split by ::tab{title="..."})
 * Details:      <details><summary>Title</summary>Content</details>
 */
function extractCustomBlocks(markdown: string): { cleaned: string; customBlocks: TiptapNode[] } {
  const customBlocks: TiptapNode[] = [];
  let cleaned = markdown;

  // Helper: strip common leading whitespace from block content
  function dedent(text: string): string {
    const lines = text.split("\n");
    const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^(\s*)/)?.[1].length ?? 0);
    const min = indents.length > 0 ? Math.min(...indents) : 0;
    if (min === 0) return text;
    return lines.map((l) => l.slice(min)).join("\n");
  }

  // Callouts: :::note, :::warning, :::tip (with optional leading whitespace)
  cleaned = cleaned.replace(
    /^[ \t]*:::(note|warning|tip|info)\s*\n([\s\S]*?)^[ \t]*:::\s*$/gm,
    (_, type: string, content: string) => {
      const calloutType = type === "note" || type === "info" ? "info" : type;
      const innerNodes = tokensToTiptap(new Lexer().lex(dedent(content).trim()));
      const idx = customBlocks.length;
      customBlocks.push({
        type: "callout",
        attrs: { type: calloutType },
        content: innerNodes,
      });
      return `\n\n<!--CB:${idx}-->\n\n`;
    }
  );

  // Steps: :::steps ... ::: split by ### headings (with optional leading whitespace)
  cleaned = cleaned.replace(
    /^[ \t]*:::steps\s*\n([\s\S]*?)^[ \t]*:::\s*$/gm,
    (_, content: string) => {
      const dedented = dedent(content);
      const stepRegex = /^###\s+(.+)$/gm;
      const parts: { title: string; body: string }[] = [];
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      let lastTitle = "";

      while ((match = stepRegex.exec(dedented)) !== null) {
        if (lastTitle) {
          parts.push({ title: lastTitle, body: dedented.slice(lastIndex, match.index).trim() });
        }
        lastTitle = match[1];
        lastIndex = match.index + match[0].length;
      }
      if (lastTitle) {
        parts.push({ title: lastTitle, body: dedented.slice(lastIndex).trim() });
      }

      const stepNodes = parts.map((p) => ({
        type: "step",
        attrs: { title: p.title },
        content: tokensToTiptap(new Lexer().lex(p.body)),
      }));

      const idx = customBlocks.length;
      customBlocks.push({
        type: "steps",
        content: stepNodes,
      });
      return `\n\n<!--CB:${idx}-->\n\n`;
    }
  );

  // Tabs: :::tabs ... ::: split by ::tab{title="..."} (with optional leading whitespace)
  cleaned = cleaned.replace(
    /^[ \t]*:::tabs\s*\n([\s\S]*?)^[ \t]*:::\s*$/gm,
    (_, content: string) => {
      const dedented = dedent(content);
      const tabRegex = /^[ \t]*::tab\{title="([^"]+)"\}\s*$/gm;
      const tabs: { title: string; body: string }[] = [];
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      let lastTitle = "";

      while ((match = tabRegex.exec(dedented)) !== null) {
        if (lastTitle) {
          tabs.push({ title: lastTitle, body: dedented.slice(lastIndex, match.index).trim() });
        }
        lastTitle = match[1];
        lastIndex = match.index + match[0].length;
      }
      if (lastTitle) {
        tabs.push({ title: lastTitle, body: dedented.slice(lastIndex).trim() });
      }

      const tabNodes = tabs.map((t) => ({
        type: "tab",
        attrs: { title: t.title },
        content: tokensToTiptap(new Lexer().lex(t.body)),
      }));

      const idx = customBlocks.length;
      customBlocks.push({
        type: "tabGroup",
        content: tabNodes,
      });
      return `\n\n<!--CB:${idx}-->\n\n`;
    }
  );

  // Details/accordion: <details><summary>Title</summary>Content</details> (with optional indentation)
  cleaned = cleaned.replace(
    /[ \t]*<details>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)[ \t]*<\/details>/gm,
    (_, summary: string, content: string) => {
      const innerNodes = tokensToTiptap(new Lexer().lex(dedent(content).trim()));
      const idx = customBlocks.length;
      customBlocks.push({
        type: "details",
        content: [
          {
            type: "detailsSummary",
            content: [{ type: "text", text: summary.trim() }],
          },
          {
            type: "detailsContent",
            content: innerNodes,
          },
        ],
      });
      return `\n\n<!--CB:${idx}-->\n\n`;
    }
  );

  return { cleaned, customBlocks };
}

function extractPlainText(nodes: TiptapNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.text && typeof node.text === "string") {
      parts.push(node.text);
    }
    if (node.content && Array.isArray(node.content)) {
      parts.push(extractPlainText(node.content as TiptapNode[]));
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function tokensToTiptap(tokens: Token[]): TiptapNode[] {
  const nodes: TiptapNode[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const t = token as Tokens.Heading;
        nodes.push({
          type: "heading",
          attrs: { level: Math.min(t.depth + 1, 6) }, // offset by 1 since section heading is h2
          content: parseInlineTokens(t.tokens ?? []),
        });
        break;
      }
      case "paragraph": {
        const t = token as Tokens.Paragraph;
        const inline = parseInlineTokens(t.tokens ?? []);
        if (inline.length > 0) {
          nodes.push({ type: "paragraph", content: inline });
        }
        break;
      }
      case "list": {
        const t = token as Tokens.List;
        const listType = t.ordered ? "orderedList" : "bulletList";
        const items = t.items.map((item: Tokens.ListItem) => {
          const itemContent: TiptapNode[] = [];
          // List items can have nested tokens
          for (const itemToken of item.tokens) {
            if (itemToken.type === "text") {
              const textToken = itemToken as Tokens.Text;
              const inline = parseInlineTokens(textToken.tokens ?? []);
              if (inline.length > 0) {
                itemContent.push({ type: "paragraph", content: inline });
              }
            } else if (itemToken.type === "list") {
              itemContent.push(
                ...tokensToTiptap([itemToken])
              );
            } else {
              itemContent.push(...tokensToTiptap([itemToken]));
            }
          }
          return { type: "listItem", content: itemContent };
        });
        nodes.push({ type: listType, content: items });
        break;
      }
      case "code": {
        const t = token as Tokens.Code;
        nodes.push({
          type: "codeBlock",
          attrs: { language: t.lang || null },
          content: [{ type: "text", text: t.text }],
        });
        break;
      }
      case "blockquote": {
        const t = token as Tokens.Blockquote;
        const inner = tokensToTiptap(t.tokens);
        nodes.push({ type: "blockquote", content: inner });
        break;
      }
      case "hr": {
        nodes.push({ type: "horizontalRule" });
        break;
      }
      case "table": {
        const t = token as Tokens.Table;
        const rows: TiptapNode[] = [];

        // Header row
        const headerCells = t.header.map((cell: Tokens.TableCell) => ({
          type: "tableHeader",
          content: [
            {
              type: "paragraph",
              content: parseInlineTokens(cell.tokens),
            },
          ],
        }));
        rows.push({ type: "tableRow", content: headerCells });

        // Body rows
        for (const row of t.rows) {
          const cells = row.map((cell: Tokens.TableCell) => ({
            type: "tableCell",
            content: [
              {
                type: "paragraph",
                content: parseInlineTokens(cell.tokens),
              },
            ],
          }));
          rows.push({ type: "tableRow", content: cells });
        }
        nodes.push({ type: "table", content: rows });
        break;
      }
      case "space": {
        break;
      }
      default: {
        // Fallback: try to extract text
        if ("text" in token && typeof token.text === "string" && token.text.trim()) {
          nodes.push({
            type: "paragraph",
            content: [{ type: "text", text: token.text }],
          });
        }
        break;
      }
    }
  }

  return nodes;
}

/** Parse inline markdown tokens into Tiptap inline nodes */
function parseInlineTokens(tokens: Token[]): TiptapNode[] {
  const nodes: TiptapNode[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "text": {
        const t = token as Tokens.Text;
        // Process [video:MM:SS] timestamp references
        const parts = splitTimestamps(t.text);
        nodes.push(...parts);
        break;
      }
      case "strong": {
        const t = token as Tokens.Strong;
        const inner = parseInlineTokens(t.tokens ?? []);
        for (const node of inner) {
          if (node.type === "text") {
            const marks = ((node.marks as TiptapNode[]) ?? []).slice();
            marks.push({ type: "bold" });
            nodes.push({ ...node, marks });
          } else {
            nodes.push(node);
          }
        }
        break;
      }
      case "em": {
        const t = token as Tokens.Em;
        const inner = parseInlineTokens(t.tokens ?? []);
        for (const node of inner) {
          if (node.type === "text") {
            const marks = ((node.marks as TiptapNode[]) ?? []).slice();
            marks.push({ type: "italic" });
            nodes.push({ ...node, marks });
          } else {
            nodes.push(node);
          }
        }
        break;
      }
      case "codespan": {
        const t = token as Tokens.Codespan;
        nodes.push({
          type: "text",
          text: t.text,
          marks: [{ type: "code" }],
        });
        break;
      }
      case "link": {
        const t = token as Tokens.Link;
        const linkText =
          t.tokens && t.tokens.length > 0
            ? t.tokens.map((tk) => ("text" in tk ? tk.text : "")).join("")
            : t.text;
        nodes.push({
          type: "text",
          text: linkText,
          marks: [{ type: "link", attrs: { href: t.href } }],
        });
        break;
      }
      case "image": {
        const t = token as Tokens.Image;
        nodes.push({
          type: "image",
          attrs: { src: t.href, alt: t.text || "" },
        });
        break;
      }
      case "br": {
        nodes.push({ type: "hardBreak" });
        break;
      }
      case "escape": {
        const t = token as Tokens.Escape;
        nodes.push({ type: "text", text: t.text });
        break;
      }
      default: {
        if ("text" in token && typeof token.text === "string") {
          nodes.push(...splitTimestamps(token.text));
        }
        break;
      }
    }
  }

  return nodes;
}

/** Parse plain text and extract [video:MM:SS] into timestampLink nodes */
function splitTimestamps(text: string): TiptapNode[] {
  const nodes: TiptapNode[] = [];
  const regex = /\[video:(\d{1,2}):(\d{2})\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before the timestamp
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    // Timestamp link
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    nodes.push({
      type: "timestampLink",
      attrs: { seconds: minutes * 60 + seconds },
    });
    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }

  return nodes;
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return 0;
}

/** Parse a plain text string for inline formatting (bold, etc.) */
function parseInlineText(text: string): TiptapNode[] {
  return splitTimestamps(text);
}
