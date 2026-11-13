import type { ReactNode } from "react";

/**
 * Renders the small Markdown subset Gemini uses in search answers (paragraphs,
 * bullet and numbered lists, headings, **bold**, *italic*, `code`) as React
 * elements. Deliberately no HTML passthrough and no links: the text is model
 * output shaped by an anonymous visitor's question, so it must never become
 * markup. `[video:MM:SS]` references render as plain timestamps.
 */

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*|\[video:\d{1,2}:\d{2}\])/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={key} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    const video = part.match(/^\[video:(\d{1,2}:\d{2})\]$/);
    if (video) {
      return <span key={key} className="text-muted-foreground">({video[1]})</span>;
    }
    return part;
  });
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;

export function parseAnswerBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] }); // paragraph break
    } else if (HEADING.test(line)) {
      blocks.push({ kind: "h", text: line.replace(HEADING, "") });
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const kind = BULLET.test(line) ? "ul" : "ol";
      const item = line.replace(kind === "ul" ? BULLET : NUMBERED, "");
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (last && last.kind === "p") {
      last.lines.push(line.trim());
    } else if (last && (last.kind === "ul" || last.kind === "ol") && /^\s+/.test(raw)) {
      // Indented continuation of a list item.
      last.items[last.items.length - 1] += ` ${line.trim()}`;
    } else {
      blocks.push({ kind: "p", lines: [line.trim()] });
    }
  }
  return blocks.filter((b) => b.kind !== "p" || b.lines.length > 0);
}

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.kind) {
    case "h":
      return <p key={i} className="font-semibold text-foreground">{renderInline(block.text, `h${i}`)}</p>;
    case "ul":
    case "ol": {
      const List = block.kind;
      return (
        <List key={i} className={`space-y-1 pl-5 ${block.kind === "ul" ? "list-disc" : "list-decimal"}`}>
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item, `l${i}-${j}`)}</li>
          ))}
        </List>
      );
    }
    case "p":
      return <p key={i}>{renderInline(block.lines.join(" "), `p${i}`)}</p>;
  }
}

export function AnswerMarkdown({ text }: { text: string }) {
  return <div className="space-y-2">{parseAnswerBlocks(text).map(renderBlock)}</div>;
}
