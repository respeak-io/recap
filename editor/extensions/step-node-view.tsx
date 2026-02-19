"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Plus, X } from "lucide-react";

export function StepNodeView({ editor, getPos, deleteNode }: ReactNodeViewProps) {
  const handleDelete = () => {
    const pos = getPos();
    if (pos === undefined) return;
    const resolved = editor.state.doc.resolve(pos);
    const parent = resolved.parent;
    if (parent.childCount <= 1) {
      const parentPos = resolved.before(resolved.depth);
      editor.chain().focus().deleteRange({ from: parentPos, to: parentPos + parent.nodeSize }).run();
    } else {
      deleteNode();
    }
  };

  return (
    <NodeViewWrapper data-type="step" className="relative">
      <div className="flex items-center justify-end">
        <button
          type="button"
          contentEditable={false}
          className="text-muted-foreground/50 hover:text-destructive transition-colors"
          onClick={handleDelete}
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
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "step",
        attrs: { title: "Step" },
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
