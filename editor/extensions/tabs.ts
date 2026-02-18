import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { TabNodeView } from "./tab-node-view";

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

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "tab" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TabNodeView);
  },
});
