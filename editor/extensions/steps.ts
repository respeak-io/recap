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
