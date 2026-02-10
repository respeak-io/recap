import { Node, mergeAttributes } from "@tiptap/react";

export interface TimestampLinkOptions {
  onTimestampClick?: (seconds: number) => void;
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    timestampLink: {
      insertTimestamp: (seconds: number) => ReturnType;
    };
  }
}

export const TimestampLink = Node.create<TimestampLinkOptions>({
  name: "timestampLink",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {
      onTimestampClick: undefined,
    };
  },

  addAttributes() {
    return {
      seconds: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-seconds")),
        renderHTML: (attributes) => ({
          "data-seconds": attributes.seconds,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="timestamp"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const seconds = HTMLAttributes["data-seconds"] || 0;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const label = `${minutes}:${String(secs).padStart(2, "0")}`;

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "timestamp",
        class:
          "inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary cursor-pointer hover:bg-primary/20 transition-colors",
      }),
      `▶ ${label}`,
    ];
  },

  addCommands() {
    return {
      insertTimestamp:
        (seconds: number) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { seconds },
          });
        },
    };
  },

  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement("span");
      const seconds = node.attrs.seconds || 0;
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);

      dom.className =
        "inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary cursor-pointer hover:bg-primary/20 transition-colors";
      dom.setAttribute("data-type", "timestamp");
      dom.setAttribute("data-seconds", String(seconds));
      dom.textContent = `▶ ${minutes}:${String(secs).padStart(2, "0")}`;

      dom.addEventListener("click", () => {
        this.options.onTimestampClick?.(seconds);
      });

      Object.keys(HTMLAttributes).forEach((key) => {
        dom.setAttribute(key, HTMLAttributes[key]);
      });

      return { dom };
    };
  },
});
