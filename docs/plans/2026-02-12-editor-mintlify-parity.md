# Editor UX: Mintlify-Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the Tiptap editor to offer the block insertion, inline formatting, and content structure features that Mintlify users expect — slash commands, bubble menu, accordions, tabs, steps, and drag handles — so users can transition from Mintlify without losing muscle memory.

**Architecture:** All new features use free/MIT Tiptap extensions and custom nodes. Each block type is self-contained: Tiptap extension + slash menu entry + ArticleRenderer support. The slash command menu uses `@tiptap/suggestion` + `tippy.js` for positioning. Bubble menu uses the built-in `BubbleMenu` from `@tiptap/react`. New block types (accordion, tabs, steps) are added as custom or official extensions with React NodeViews for in-editor rendering and matching cases in the existing `ArticleRenderer` for public display.

**Tech Stack:** Tiptap v3 (MIT), `@tiptap/suggestion`, `tippy.js`, `@tiptap/extension-details` (MIT, free), React NodeViews, shadcn/ui components, existing ArticleRenderer pattern.

---

## Batch 1: Core Editor UX

### Task 1: Slash Command Menu

The single biggest UX improvement. Type `/` on an empty line or after a space to open a filterable dropdown of block types. Arrow keys navigate, Enter inserts, Escape dismisses. This is how Mintlify (and Notion) users discover and insert blocks.

**Files:**
- Create: `editor/extensions/slash-command.ts`
- Create: `editor/slash-menu.tsx`
- Modify: `editor/editor.tsx` (add extension + import)
- Modify: `package.json` (add deps)

**Step 1: Install dependencies**

```bash
pnpm add @tiptap/suggestion tippy.js
```

**Step 2: Create the slash command extension**

Create `editor/extensions/slash-command.ts`:

```typescript
import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: any;
          range: any;
          props: any;
        }) => {
          props.command({ editor, range });
        },
      } as Partial<SuggestionOptions>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
```

**Step 3: Create the slash menu React component**

Create `editor/slash-menu.tsx`:

```tsx
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
          return component.ref?.onKeyDown(props);
        },
        onExit() {
          popup[0].destroy();
          component.destroy();
        },
      };
    },
  };
}
```

**Step 4: Wire into editor.tsx**

Add import:
```typescript
import { SlashCommand } from "./extensions/slash-command";
import { slashCommandSuggestion } from "./slash-menu";
```

Add to extensions array (after Placeholder):
```typescript
SlashCommand.configure({
  suggestion: slashCommandSuggestion(),
}),
```

**Step 5: Verify build**

```bash
pnpm run build
```

**Step 6: Manual verification**

1. Open any article in the editor
2. Type `/` — dropdown should appear with all block types
3. Type `/head` — should filter to headings
4. Arrow down + Enter — should insert the block
5. Escape — should dismiss the menu

**Step 7: Commit**

```bash
git add editor/extensions/slash-command.ts editor/slash-menu.tsx editor/editor.tsx package.json pnpm-lock.yaml
git commit -m "feat: add slash command menu for block insertion"
```

---

### Task 2: Bubble Menu for Text Selection

Floating formatting toolbar that appears when the user selects text. Shows inline formatting options (bold, italic, code, link). This is the modern editing interaction users expect from Mintlify, Notion, etc.

**Files:**
- Create: `editor/bubble-menu.tsx`
- Modify: `editor/editor.tsx` (add BubbleMenu)

**Step 1: Create the bubble menu component**

Create `editor/bubble-menu.tsx`:

```tsx
"use client";

import type { Editor } from "@tiptap/react";
import { Bold, Italic, Code, Link } from "lucide-react";
import { cn } from "@/lib/utils";

function BubbleButton({
  onClick,
  isActive,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function BubbleMenuContent({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
      <BubbleButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
      >
        <Bold className="size-4" />
      </BubbleButton>
      <BubbleButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
      >
        <Italic className="size-4" />
      </BubbleButton>
      <BubbleButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
      >
        <Code className="size-4" />
      </BubbleButton>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <BubbleButton
        onClick={() => {
          const url = window.prompt(
            "URL:",
            editor.getAttributes("link").href ?? ""
          );
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().unsetLink().run();
          } else {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }}
        isActive={editor.isActive("link")}
      >
        <Link className="size-4" />
      </BubbleButton>
    </div>
  );
}
```

**Step 2: Add to editor.tsx**

Add import:
```typescript
import { BubbleMenu } from "@tiptap/react";
import { BubbleMenuContent } from "./bubble-menu";
```

Add the Link extension import and configuration (StarterKit doesn't include Link):
```typescript
import Link from "@tiptap/extension-link";
```

Add `Link.configure({ openOnClick: false })` to extensions array.

Add BubbleMenu after EditorContent:
```tsx
{editor && (
  <BubbleMenu
    editor={editor}
    tippyOptions={{ duration: 100 }}
    shouldShow={({ editor, state }) => {
      // Don't show in code blocks or for empty selections
      const { from, to } = state.selection;
      if (from === to) return false;
      if (editor.isActive("codeBlock")) return false;
      return true;
    }}
  >
    <BubbleMenuContent editor={editor} />
  </BubbleMenu>
)}
```

**Step 3: Install Link extension**

```bash
pnpm add @tiptap/extension-link
```

**Step 4: Verify build**

```bash
pnpm run build
```

**Step 5: Manual verification**

1. Open editor, write some text
2. Select a word — bubble menu should appear with B/I/Code/Link buttons
3. Click Bold — text should become bold, button highlights
4. Click Link — prompt for URL, link applied to selection
5. Place cursor in code block — bubble menu should NOT appear

**Step 6: Commit**

```bash
git add editor/bubble-menu.tsx editor/editor.tsx package.json pnpm-lock.yaml
git commit -m "feat: add bubble menu for inline formatting on text selection"
```

---

### Task 3: Block Drag Handle

A grip handle that appears on hover to the left of each block, allowing users to drag blocks to reorder them. Uses the free `@tiptap/extension-drag-handle` extension.

**Files:**
- Modify: `editor/editor.tsx` (add extension + CSS)

**Step 1: Install the extension**

```bash
pnpm add @tiptap/extension-drag-handle
```

**Step 2: Add to editor.tsx**

Add import:
```typescript
import DragHandle from "@tiptap/extension-drag-handle";
```

Add to extensions array:
```typescript
DragHandle.configure({
  render() {
    const el = document.createElement("div");
    el.classList.add("custom-drag-handle");
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
    return el;
  },
}),
```

**Step 3: Add drag handle CSS**

Add to the editor's className or a global CSS file (`app/globals.css`):

```css
.custom-drag-handle {
  cursor: grab;
  color: hsl(var(--muted-foreground));
  opacity: 0;
  transition: opacity 0.15s;
  padding: 2px;
  border-radius: 4px;
}
.custom-drag-handle:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
.ProseMirror [data-node-view-wrapper]:hover .custom-drag-handle,
.ProseMirror .has-focus .custom-drag-handle {
  opacity: 1;
}
```

**Step 4: Verify build**

```bash
pnpm run build
```

**Step 5: Manual verification**

1. Hover over a paragraph in the editor — grip dots appear to the left
2. Drag the handle — block should move to new position
3. Handle disappears when not hovering

**Step 6: Commit**

```bash
git add editor/editor.tsx app/globals.css package.json pnpm-lock.yaml
git commit -m "feat: add block drag handle for reordering"
```

---

## Batch 2: New Block Types

Each task includes the Tiptap extension, slash menu integration, and ArticleRenderer support.

### Task 4: Accordion / Details Block

Collapsible content sections. Uses the free (now MIT-licensed) `@tiptap/extension-details` family. Common in docs for optional/advanced content, FAQ sections, and progressive disclosure.

**Files:**
- Modify: `editor/editor.tsx` (add extensions)
- Modify: `editor/slash-menu.tsx` (add slash command item)
- Modify: `components/docs/article-renderer.tsx` (add render cases)
- Modify: `package.json` (add deps)

**Step 1: Install the details extensions**

```bash
pnpm add @tiptap/extension-details @tiptap/extension-details-summary @tiptap/extension-details-content
```

Note: Package names may be `@tiptap/extension-detail-summary` / `@tiptap/extension-detail-content` (singular). Check npm if the above fail.

**Step 2: Add to editor.tsx**

Add imports:
```typescript
import Details from "@tiptap/extension-details";
import DetailsSummary from "@tiptap/extension-details-summary";
import DetailsContent from "@tiptap/extension-details-content";
```

Add to extensions array:
```typescript
Details,
DetailsSummary,
DetailsContent,
```

**Step 3: Add slash command item**

In `editor/slash-menu.tsx`, import `ChevronRight` from lucide-react.

Add to the `getDefaultItems()` array (after the callout items):

```typescript
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
```

**Step 4: Add to ArticleRenderer**

In `components/docs/article-renderer.tsx`, add these cases to the `renderNode` function:

```tsx
case "details":
  return (
    <details key={index} className="my-4 rounded-lg border p-4 group">
      {(node.content ?? []).map((child: any, i: number) =>
        renderNode(child, i)
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
      {(node.content ?? []).flatMap((child: any) =>
        (child.content ?? []).map(renderInline)
      )}
    </summary>
  );
case "detailsContent":
  return (
    <div key={index} className="mt-2 pl-6">
      {(node.content ?? []).map((child: any, i: number) =>
        renderNode(child, i)
      )}
    </div>
  );
```

**Step 5: Verify build**

```bash
pnpm run build
```

**Step 6: Manual verification**

1. In editor, type `/acc` and select "Accordion"
2. A collapsible section should appear with a summary field and content area
3. Click the summary to toggle open/closed
4. View the published article — accordion should render as native `<details>` element

**Step 7: Commit**

```bash
git add editor/editor.tsx editor/slash-menu.tsx components/docs/article-renderer.tsx package.json pnpm-lock.yaml
git commit -m "feat: add accordion/details block with slash menu and public rendering"
```

---

### Task 5: Tabs Block

Tabbed content sections for showing multiple variants (language, OS, framework). This is a custom extension — Tiptap doesn't have a built-in tabs node. Uses React NodeViews for in-editor rendering and a client component for public rendering.

**Files:**
- Create: `editor/extensions/tabs.ts`
- Create: `editor/extensions/tabs-node-view.tsx`
- Create: `components/docs/tabs-renderer.tsx`
- Modify: `editor/editor.tsx` (add extension)
- Modify: `editor/slash-menu.tsx` (add item)
- Modify: `components/docs/article-renderer.tsx` (add render case)

**Step 1: Create the tabs extension**

Create `editor/extensions/tabs.ts`:

```typescript
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { TabsNodeView } from "./tabs-node-view";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tabGroup: {
      insertTabs: (tabTitles?: string[]) => ReturnType;
    };
  }
}

export const TabGroup = Node.create({
  name: "tabGroup",
  group: "block",
  content: "tab+",
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="tab-group"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "tab-group" }),
      0,
    ];
  },

  addCommands() {
    return {
      insertTabs:
        (tabTitles = ["Tab 1", "Tab 2"]) =>
        ({ commands }) => {
          const tabs = tabTitles.map((title) => ({
            type: "tab",
            attrs: { title },
            content: [{ type: "paragraph" }],
          }));
          return commands.insertContent({
            type: "tabGroup",
            content: tabs,
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TabsNodeView);
  },
});

export const Tab = Node.create({
  name: "tab",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      title: { default: "Tab" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tab"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "tab" }),
      0,
    ];
  },
});
```

**Step 2: Create the NodeView for in-editor rendering**

Create `editor/extensions/tabs-node-view.tsx`:

```tsx
import { useState } from "react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { cn } from "@/lib/utils";

export function TabsNodeView({ node }: { node: any }) {
  const [activeTab, setActiveTab] = useState(0);
  const tabs: { attrs: { title: string } }[] = node.content?.content ?? [];

  return (
    <NodeViewWrapper className="my-4 rounded-lg border" data-type="tab-group">
      <div className="flex border-b bg-muted/30">
        {tabs.map((tab, i) => (
          <button
            key={i}
            contentEditable={false}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              i === activeTab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab(i)}
          >
            {tab.attrs.title}
          </button>
        ))}
      </div>
      <div className="p-4">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}
```

Note: `NodeViewContent` renders all child tabs. To show only the active tab, CSS is used:

Add to `app/globals.css`:
```css
/* Tab group: show only the active tab in the editor */
.ProseMirror div[data-type="tab-group"] div[data-type="tab"] {
  display: none;
}
.ProseMirror div[data-type="tab-group"] div[data-type="tab"].active {
  display: block;
}
```

The NodeView will need to toggle the `.active` class. An alternative (simpler) approach: show all tabs stacked in the editor with visual separation and only render the tab-switching UI in the public renderer. This avoids complex NodeView state management. **Choose the simpler stacked approach for the initial implementation** — the important thing is that the public rendering has proper tab switching.

**Step 3: Create the public tabs renderer**

Create `components/docs/tabs-renderer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function TabsRenderer({
  tabs,
  renderContent,
}: {
  tabs: { title: string; content: any[] }[];
  renderContent: (nodes: any[], keyPrefix: string) => React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="my-4 rounded-lg border">
      <div className="flex border-b bg-muted/30">
        {tabs.map((tab, i) => (
          <button
            key={i}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              i === activeTab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab(i)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div className="p-4">
        {renderContent(tabs[activeTab].content, `tab-${activeTab}`)}
      </div>
    </div>
  );
}
```

**Step 4: Add to slash menu**

In `editor/slash-menu.tsx`, import `Columns` from lucide-react (or `PanelTop`).

Add to `getDefaultItems()`:
```typescript
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
```

**Step 5: Add to editor.tsx**

Import and add `TabGroup` and `Tab` to extensions array.

**Step 6: Add to ArticleRenderer**

In `renderNode`:
```tsx
case "tabGroup": {
  const tabs = (node.content ?? []).map((tab: any) => ({
    title: tab.attrs?.title ?? "Tab",
    content: tab.content ?? [],
  }));
  return (
    <TabsRenderer
      key={index}
      tabs={tabs}
      renderContent={(nodes, prefix) =>
        nodes.map((n: any, i: number) => renderNode(n, `${prefix}-${i}`))
      }
    />
  );
}
case "tab":
  // Handled by tabGroup — shouldn't render standalone
  return null;
```

Import `TabsRenderer` at the top of the file.

**Step 7: Verify build**

```bash
pnpm run build
```

**Step 8: Manual verification**

1. Type `/tabs` in editor — tabs block inserted with 2 tabs
2. Edit content in each tab panel
3. View published article — tabs render with interactive switching

**Step 9: Commit**

```bash
git add editor/extensions/tabs.ts editor/extensions/tabs-node-view.tsx components/docs/tabs-renderer.tsx editor/editor.tsx editor/slash-menu.tsx components/docs/article-renderer.tsx app/globals.css
git commit -m "feat: add tabs block type with slash menu and public rendering"
```

---

### Task 6: Steps Block

Numbered step-by-step instructions with a visual timeline. Very common in tutorial docs (e.g., "Getting Started" guides). Custom extension with React NodeView.

**Files:**
- Create: `editor/extensions/steps.ts`
- Modify: `editor/editor.tsx` (add extension)
- Modify: `editor/slash-menu.tsx` (add item)
- Modify: `components/docs/article-renderer.tsx` (add render case)

**Step 1: Create the steps extension**

Create `editor/extensions/steps.ts`:

```typescript
import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    steps: {
      insertSteps: (count?: number) => ReturnType;
    };
  }
}

export const Steps = Node.create({
  name: "steps",
  group: "block",
  content: "step+",
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="steps"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "steps",
        class:
          "my-4 ml-4 border-l-2 border-muted-foreground/20 pl-6 space-y-6",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertSteps:
        (count = 3) =>
        ({ commands }) => {
          const steps = Array.from({ length: count }, (_, i) => ({
            type: "step",
            attrs: { title: `Step ${i + 1}` },
            content: [{ type: "paragraph" }],
          }));
          return commands.insertContent({
            type: "steps",
            content: steps,
          });
        },
    };
  },
});

export const Step = Node.create({
  name: "step",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      title: { default: "Step" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="step"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "step",
        class: "relative",
      }),
      [
        "p",
        {
          contenteditable: "false",
          class: "font-semibold text-sm text-foreground mb-1",
        },
        node.attrs.title,
      ],
      ["div", { class: "step-content" }, 0],
    ];
  },
});
```

**Step 2: Add to editor.tsx**

Import `Steps` and `Step` from `./extensions/steps`.

Add to extensions array:
```typescript
Steps,
Step,
```

**Step 3: Add slash command**

Import `ListChecks` (or `Footprints`) from lucide-react.

Add to `getDefaultItems()`:
```typescript
{
  title: "Steps",
  description: "Numbered step-by-step guide",
  icon: ListChecks,
  command: ({ editor, range }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertSteps(3)
      .run();
  },
},
```

**Step 4: Add to ArticleRenderer**

```tsx
case "steps":
  return (
    <div
      key={index}
      className="my-6 ml-4 border-l-2 border-muted-foreground/20 pl-6 space-y-6"
    >
      {(node.content ?? []).map((step: any, i: number) => (
        <div key={i} className="relative">
          <div className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full border-2 border-muted-foreground/20 bg-background text-xs font-bold text-muted-foreground">
            {i + 1}
          </div>
          <p className="font-semibold text-sm mb-1">
            {step.attrs?.title ?? `Step ${i + 1}`}
          </p>
          <div>
            {(step.content ?? []).map((child: any, j: number) =>
              renderNode(child, `step-${i}-${j}`)
            )}
          </div>
        </div>
      ))}
    </div>
  );
case "step":
  // Handled by steps — shouldn't render standalone
  return null;
```

**Step 5: Verify build**

```bash
pnpm run build
```

**Step 6: Manual verification**

1. Type `/steps` — 3-step block inserted
2. Edit step titles and content
3. View published article — steps render with numbered circles and connecting line

**Step 7: Commit**

```bash
git add editor/extensions/steps.ts editor/editor.tsx editor/slash-menu.tsx components/docs/article-renderer.tsx
git commit -m "feat: add steps block for step-by-step guides"
```

---

## Batch 3: Polish & Testing

### Task 7: Typography Extension + Keyboard Shortcuts

Smart typography: automatic curly quotes, em dashes (`--` → `—`), ellipsis (`...` → `…`). Small polish that makes the editor feel professional.

**Files:**
- Modify: `editor/editor.tsx`
- Modify: `package.json`

**Step 1: Install the extension**

```bash
pnpm add @tiptap/extension-typography
```

**Step 2: Add to editor.tsx**

Import:
```typescript
import Typography from "@tiptap/extension-typography";
```

Add to extensions array:
```typescript
Typography,
```

**Step 3: Verify build**

```bash
pnpm run build
```

**Step 4: Manual verification**

1. Type `"hello"` — quotes should become curly ("hello")
2. Type `--` — becomes em dash (—)
3. Type `...` — becomes ellipsis (…)

**Step 5: Commit**

```bash
git add editor/editor.tsx package.json pnpm-lock.yaml
git commit -m "feat: add smart typography (curly quotes, em dashes, ellipsis)"
```

---

### Task 8: E2E Tests for New Editor Features

Add Playwright tests to verify the slash menu appears, bubble menu works on selection, and new block types can be inserted. Extend the existing `e2e/editor.spec.ts`.

**Files:**
- Modify: `e2e/editor.spec.ts`

**Step 1: Add slash command test**

```typescript
test("slash command menu appears on / keystroke", async ({ page }) => {
  await page.goto(editorUrl);

  // Click into the editor area
  const editor = page.locator(".ProseMirror");
  await editor.click();

  // Type "/" to trigger slash menu
  await page.keyboard.type("/");

  // Slash menu should appear with block options
  await expect(page.getByText("Heading 2")).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Bullet List")).toBeVisible();
  await expect(page.getByText("Code Block")).toBeVisible();

  // Escape dismisses it
  await page.keyboard.press("Escape");
  await expect(page.getByText("Heading 2")).not.toBeVisible();
});

test("slash command filters items by query", async ({ page }) => {
  await page.goto(editorUrl);

  const editor = page.locator(".ProseMirror");
  await editor.click();

  await page.keyboard.type("/call");

  // Should show callout items, not headings
  await expect(page.getByText("Info Callout")).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Heading 2")).not.toBeVisible();
});
```

**Step 2: Add bubble menu test**

```typescript
test("bubble menu appears on text selection", async ({ page }) => {
  await page.goto(editorUrl);

  // Select some text in the editor
  const editor = page.locator(".ProseMirror");
  const firstParagraph = editor.locator("p").first();
  await firstParagraph.click({ clickCount: 3 }); // Triple-click to select line

  // Bubble menu should appear with formatting buttons
  await expect(
    page.locator("[class*='bubble']").or(page.locator("[class*='popover']")).first()
  ).toBeVisible({ timeout: 3000 });
});
```

**Step 3: Run tests**

```bash
npx playwright test e2e/editor.spec.ts
```

**Step 4: Commit**

```bash
git add e2e/editor.spec.ts
git commit -m "test: add e2e tests for slash commands and bubble menu"
```

---

## Summary

| Task | Description | New Deps | Files |
|------|-------------|----------|-------|
| 1 | Slash command menu (`/`) | `@tiptap/suggestion`, `tippy.js` | `slash-command.ts`, `slash-menu.tsx`, `editor.tsx` |
| 2 | Bubble menu (selection formatting) | `@tiptap/extension-link` | `bubble-menu.tsx`, `editor.tsx` |
| 3 | Block drag handle | `@tiptap/extension-drag-handle` | `editor.tsx`, `globals.css` |
| 4 | Accordion / Details block | `@tiptap/extension-details*` | `editor.tsx`, `slash-menu.tsx`, `article-renderer.tsx` |
| 5 | Tabs block | — (custom) | `tabs.ts`, `tabs-node-view.tsx`, `tabs-renderer.tsx`, `article-renderer.tsx` |
| 6 | Steps block | — (custom) | `steps.ts`, `article-renderer.tsx` |
| 7 | Smart typography | `@tiptap/extension-typography` | `editor.tsx` |
| 8 | E2E tests | — | `editor.spec.ts` |

## Batching for Execution

- **Batch 1** (Tasks 1-3): Core UX — slash commands, bubble menu, drag handle. Run in parallel if using subagents.
- **Batch 2** (Tasks 4-6): New blocks — accordion, tabs, steps. Each self-contained. Run in parallel.
- **Batch 3** (Tasks 7-8): Polish and testing. Sequential.

## Verification

After all tasks:
1. Type `/` — slash menu appears with 12+ block types including new ones
2. Select text — bubble menu appears with Bold/Italic/Code/Link
3. Hover block — drag handle appears, blocks can be reordered
4. `/acc` → collapsible accordion section
5. `/tabs` → tabbed content with interactive switching
6. `/steps` → numbered step-by-step guide with timeline
7. `--` becomes em dash, `"` becomes curly quotes
8. All e2e tests pass
9. Public article rendering handles all new block types
