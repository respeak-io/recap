"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from "react";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance } from "tippy.js";
import type { Editor, Range } from "@tiptap/core";
import {
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Quote,
  Minus,
  Info,
  AlertTriangle,
  Lightbulb,
  Image,
  Table,
  ChevronRight,
  Columns,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: LucideIcon;
  command: (props: { editor: Editor; range: Range }) => void;
}

function getDefaultItems(): SlashCommandItem[] {
  return [
    {
      title: "Heading 2",
      description: "Medium section heading",
      icon: Heading2,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setHeading({ level: 2 })
          .run();
      },
    },
    {
      title: "Heading 3",
      description: "Small section heading",
      icon: Heading3,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setHeading({ level: 3 })
          .run();
      },
    },
    {
      title: "Bullet List",
      description: "Create a bulleted list",
      icon: List,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleBulletList()
          .run();
      },
    },
    {
      title: "Numbered List",
      description: "Create a numbered list",
      icon: ListOrdered,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleOrderedList()
          .run();
      },
    },
    {
      title: "Code Block",
      description: "Syntax-highlighted code",
      icon: Code,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setCodeBlock()
          .run();
      },
    },
    {
      title: "Blockquote",
      description: "Add a quote block",
      icon: Quote,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setBlockquote()
          .run();
      },
    },
    {
      title: "Info Callout",
      description: "Highlight important information",
      icon: Info,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setCallout("info")
          .run();
      },
    },
    {
      title: "Warning Callout",
      description: "Warn the reader about something",
      icon: AlertTriangle,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setCallout("warning")
          .run();
      },
    },
    {
      title: "Tip Callout",
      description: "Share a helpful tip",
      icon: Lightbulb,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setCallout("tip")
          .run();
      },
    },
    {
      title: "Accordion",
      description: "Collapsible content section",
      icon: ChevronRight,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setDetails()
          .run();
      },
    },
    {
      title: "Tabs",
      description: "Tabbed content sections",
      icon: Columns,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTabs(["Tab 1", "Tab 2"])
          .run();
      },
    },
    {
      title: "Image",
      description: "Insert an image from URL",
      icon: Image,
      command: ({ editor, range }) => {
        const url = window.prompt("Image URL:");
        if (url) {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setImage({ src: url })
            .run();
        }
      },
    },
    {
      title: "Table",
      description: "Insert a 3x3 table",
      icon: Table,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
    },
    {
      title: "Divider",
      description: "Horizontal separator line",
      icon: Minus,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setHorizontalRule()
          .run();
      },
    },
  ];
}

const SlashCommandList = forwardRef(
  (
    props: {
      items: SlashCommandItem[];
      command: (item: SlashCommandItem) => void;
    },
    ref
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [props.items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = props.items[index];
        if (item) props.command(item);
      },
      [props]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex(
            (prev) =>
              (prev + props.items.length - 1) % props.items.length
          );
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex(
            (prev) => (prev + 1) % props.items.length
          );
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (props.items.length === 0) {
      return (
        <div className="rounded-lg border bg-popover p-2 shadow-md text-sm text-muted-foreground">
          No results
        </div>
      );
    }

    return (
      <div className="z-50 rounded-lg border bg-popover p-1 shadow-md max-h-80 overflow-y-auto w-72">
        {props.items.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
              onClick={() => selectItem(index)}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }
);
SlashCommandList.displayName = "SlashCommandList";

export function slashCommandSuggestion() {
  return {
    items: ({ query }: { query: string }) => {
      return getDefaultItems().filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase())
      );
    },
    render: () => {
      let component: ReactRenderer;
      let popup: Instance[];

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(SlashCommandList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },
        onUpdate(props: any) {
          component.updateProps(props);
          if (!props.clientRect) return;
          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          });
        },
        onKeyDown(props: any) {
          if (props.event.key === "Escape") {
            popup[0].hide();
            return true;
          }
          return (component.ref as any)?.onKeyDown(props);
        },
        onExit() {
          popup[0].destroy();
          component.destroy();
        },
      };
    },
  };
}
