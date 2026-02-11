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
