import { Node, mergeAttributes } from "@tiptap/react";

export type CalloutType = "info" | "warning" | "tip";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (type: CalloutType) => ReturnType;
      toggleCallout: (type: CalloutType) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",

  addAttributes() {
    return {
      type: {
        default: "info" as CalloutType,
        parseHTML: (element) => element.getAttribute("data-callout-type") || "info",
        renderHTML: (attributes) => ({
          "data-callout-type": attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const type = HTMLAttributes["data-callout-type"] || "info";
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

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        class: `border-l-4 rounded-r-lg p-4 my-4 ${styles[type] || styles.info}`,
      }),
      [
        "div",
        { class: "flex gap-2" },
        ["span", { class: "flex-shrink-0" }, icons[type] || icons.info],
        ["div", { class: "flex-1 min-w-0" }, 0],
      ],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (type: CalloutType) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, { type });
        },
      toggleCallout:
        (type: CalloutType) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, { type });
        },
    };
  },
});
