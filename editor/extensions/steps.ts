import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { StepNodeView, StepsNodeView } from "./step-node-view";

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
      mergeAttributes(HTMLAttributes, { "data-type": "steps" }),
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

  addNodeView() {
    return ReactNodeViewRenderer(StepsNodeView);
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

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "step" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(StepNodeView);
  },
});
