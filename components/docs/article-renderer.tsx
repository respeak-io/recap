"use client";

import slugify from "slugify";
import { TabsRenderer } from "./tabs-renderer";
import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";

const lowlight = createLowlight(common);

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

export { extractHeadings } from "@/lib/extract-headings";

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
    case "codeBlock": {
      const lang = (node.attrs?.language as string) || "";
      const codeText =
        node.content?.map((n) => n.text ?? "").join("") ?? "";
      let highlighted: string | null = null;
      try {
        if (lang && lowlight.registered(lang)) {
          highlighted = toHtml(lowlight.highlight(lang, codeText));
        }
      } catch {
        // fallback to plain text
      }
      return (
        <pre
          key={index}
          className="rounded-lg bg-muted p-4 overflow-x-auto text-sm leading-relaxed"
        >
          {highlighted ? (
            <code
              className={`language-${lang}`}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <code>{codeText}</code>
          )}
        </pre>
      );
    }
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
    case "details":
      return (
        <details key={index} className="my-4 rounded-lg border p-4 group">
          {(node.content ?? []).map((child: TiptapNode, i: number) =>
            renderNode(child, i, onTimestampClick)
          )}
        </details>
      );
    case "detailsSummary":
      return (
        <summary
          key={index}
          className="cursor-pointer font-medium list-none flex items-center gap-2"
        >
          <svg
            className="size-4 shrink-0 transition-transform group-open:rotate-90"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          {children}
        </summary>
      );
    case "detailsContent":
      return (
        <div key={index} className="mt-2 pl-6">
          {(node.content ?? []).map((child: TiptapNode, i: number) =>
            renderNode(child, i, onTimestampClick)
          )}
        </div>
      );
    case "tabGroup": {
      const tabs = (node.content ?? []).map((tab: TiptapNode) => ({
        title: (tab.attrs?.title as string) ?? "Tab",
        content: tab.content ?? [],
      }));
      return (
        <TabsRenderer
          key={index}
          tabs={tabs}
          renderContent={(nodes, prefix) =>
            nodes.map((n: TiptapNode, i: number) =>
              renderNode(n, `${prefix}-${i}` as unknown as number, onTimestampClick)
            )
          }
        />
      );
    }
    case "tab":
      return null;
    case "steps":
      return (
        <div
          key={index}
          className="my-6 ml-4 border-l-2 border-muted-foreground/20 pl-6 space-y-6"
        >
          {(node.content ?? []).map((step: TiptapNode, i: number) => (
            <div key={i} className="relative">
              <div className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full border-2 border-muted-foreground/20 bg-background text-xs font-bold text-muted-foreground">
                {i + 1}
              </div>
              <p className="font-semibold text-sm mb-1">
                {(step.attrs?.title as string) ?? `Step ${i + 1}`}
              </p>
              <div>
                {(step.content ?? []).map((child: TiptapNode, j: number) =>
                  renderNode(child, j, onTimestampClick)
                )}
              </div>
            </div>
          ))}
        </div>
      );
    case "step":
      return null;
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
