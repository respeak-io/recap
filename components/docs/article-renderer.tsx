"use client";

import slugify from "slugify";

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

interface ArticleRendererProps {
  content: { type: string; content?: TiptapNode[] };
  onTimestampClick?: (seconds: number) => void;
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

function renderInline(
  node: TiptapNode,
  onTimestampClick?: (seconds: number) => void
): React.ReactNode {
  if (node.type === "text") {
    let content: React.ReactNode = node.text;
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "bold") content = <strong>{content}</strong>;
        if (mark.type === "italic") content = <em>{content}</em>;
        if (mark.type === "code")
          content = (
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
              {content}
            </code>
          );
        if (mark.type === "link")
          content = (
            <a
              href={mark.attrs?.href as string}
              className="underline text-primary"
            >
              {content}
            </a>
          );
      }
    }
    return content;
  }

  if (node.type === "timestampLink") {
    const seconds = (node.attrs?.seconds as number) ?? 0;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return (
      <button
        type="button"
        onClick={() => onTimestampClick?.(seconds)}
        className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary cursor-pointer hover:bg-primary/20 transition-colors"
      >
        ▶ {minutes}:{String(secs).padStart(2, "0")}
      </button>
    );
  }

  return null;
}

function renderNode(
  node: TiptapNode,
  index: number,
  onTimestampClick?: (seconds: number) => void
): React.ReactNode {
  const children = node.content?.map((child, i) => {
    if (child.type === "text" || child.type === "timestampLink") {
      return (
        <span key={i}>{renderInline(child, onTimestampClick)}</span>
      );
    }
    return renderNode(child, i, onTimestampClick);
  });

  switch (node.type) {
    case "heading": {
      const level = (node.attrs?.level as number) ?? 2;
      const text = node.content?.map((n) => n.text ?? "").join("") ?? "";
      const id = slugify(text, { lower: true, strict: true });
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      return (
        <Tag key={index} id={id}>
          {children}
        </Tag>
      );
    }
    case "paragraph":
      return <p key={index}>{children}</p>;
    case "bulletList":
      return <ul key={index}>{children}</ul>;
    case "orderedList":
      return <ol key={index}>{children}</ol>;
    case "listItem":
      return <li key={index}>{children}</li>;
    case "codeBlock":
      return (
        <pre key={index} className="rounded-lg bg-muted p-4 overflow-x-auto">
          <code>{children}</code>
        </pre>
      );
    case "blockquote":
      return <blockquote key={index}>{children}</blockquote>;
    case "horizontalRule":
      return <hr key={index} />;
    case "image":
      return (
        <img
          key={index}
          src={node.attrs?.src as string}
          alt={(node.attrs?.alt as string) ?? ""}
          className="rounded-lg"
        />
      );
    case "table":
      return (
        <table key={index} className="border-collapse w-full">
          <tbody>{children}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={index}>{children}</tr>;
    case "tableHeader":
      return (
        <th key={index} className="border border-border bg-muted px-3 py-2 text-left font-semibold">
          {children}
        </th>
      );
    case "tableCell":
      return (
        <td key={index} className="border border-border px-3 py-2">
          {children}
        </td>
      );
    case "hardBreak":
      return <br key={index} />;
    case "callout": {
      const type = (node.attrs?.type as string) ?? "info";
      const styles: Record<string, string> = {
        info: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
        warning: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30",
        tip: "border-green-500 bg-green-50 dark:bg-green-950/30",
      };
      const icons: Record<string, string> = {
        info: "ℹ",
        warning: "⚠",
        tip: "💡",
      };
      return (
        <div
          key={index}
          className={`border-l-4 rounded-r-lg p-4 my-4 ${styles[type] || styles.info}`}
        >
          <div className="flex gap-2">
            <span className="flex-shrink-0">{icons[type] || icons.info}</span>
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        </div>
      );
    }
    default:
      return <div key={index}>{children}</div>;
  }
}

export function ArticleRenderer({
  content,
  onTimestampClick,
}: ArticleRendererProps) {
  if (!content.content) return null;

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      {content.content.map((node, i) => renderNode(node, i, onTimestampClick))}
    </div>
  );
}
