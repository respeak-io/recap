"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Plus, X } from "lucide-react";

export function TabNodeView({ node, editor, getPos, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const handleDelete = () => {
    // If this is the last tab, delete the entire tab group
    const pos = getPos();
    if (pos === undefined) return;
    const resolved = editor.state.doc.resolve(pos);
    const parent = resolved.parent;
    if (parent.childCount <= 1) {
      // Delete the parent tabGroup
      const parentPos = resolved.before(resolved.depth);
      editor.chain().focus().deleteRange({ from: parentPos, to: parentPos + parent.nodeSize }).run();
    } else {
      deleteNode();
    }
  };

  return (
    <NodeViewWrapper data-type="tab">
      <div className="flex items-center gap-1">
        <input
          className="flex-1 bg-transparent text-xs font-bold uppercase tracking-wider text-muted-foreground outline-none border-none p-0 mb-1"
          value={node.attrs.title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Tab title..."
        />
        <button
          type="button"
          contentEditable={false}
          className="text-muted-foreground/50 hover:text-destructive transition-colors mb-1"
          onClick={handleDelete}
          title="Remove tab"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export function TabGroupNodeView({ node, editor, getPos }: ReactNodeViewProps) {
  const addTab = () => {
    const p = getPos();
    if (p === undefined) return;
    const pos = p + node.nodeSize - 1;
    const tabCount = node.content?.childCount ?? 0;
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "tab",
        attrs: { title: `Tab ${tabCount + 1}` },
        content: [{ type: "paragraph" }],
      })
      .run();
  };

  return (
    <NodeViewWrapper data-type="tab-group">
      <NodeViewContent />
      <div contentEditable={false} className="border-t border-border p-1.5 flex justify-center">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
          onClick={addTab}
        >
          <Plus className="size-3" />
          Add tab
        </button>
      </div>
    </NodeViewWrapper>
  );
}
