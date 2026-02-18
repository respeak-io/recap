import { Node, mergeAttributes } from "@tiptap/core";

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

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "tab" }),
      ["p", { contenteditable: "false", class: "text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 select-none" }, node.attrs.title],
      ["div", {}, 0],
    ];
  },
});
