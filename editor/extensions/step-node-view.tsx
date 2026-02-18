"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Plus, X } from "lucide-react";

export function StepNodeView({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper data-type="step" className="relative">
      <div className="flex items-center gap-1">
        <input
          className="flex-1 bg-transparent text-sm font-semibold outline-none border-none p-0 mb-1"
          value={node.attrs.title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Step title..."
        />
        <button
          type="button"
          contentEditable={false}
          className="text-muted-foreground/50 hover:text-destructive transition-colors mb-1"
          onClick={deleteNode}
          title="Remove step"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export function StepsNodeView({ node, editor, getPos }: ReactNodeViewProps) {
  const addStep = () => {
    const p = getPos();
    if (p === undefined) return;
    const pos = p + node.nodeSize - 1;
    const stepCount = node.content?.childCount ?? 0;
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "step",
        attrs: { title: `Step ${stepCount + 1}` },
        content: [{ type: "paragraph" }],
      })
      .run();
  };

  return (
    <NodeViewWrapper data-type="steps">
      <NodeViewContent />
      <div contentEditable={false} className="mt-2 flex">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
          onClick={addStep}
        >
          <Plus className="size-3" />
          Add step
        </button>
      </div>
    </NodeViewWrapper>
  );
}
