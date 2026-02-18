"use client";

import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";

export function TabNodeView({ node, updateAttributes }: {
  node: any;
  updateAttributes: (attrs: Record<string, unknown>) => void;
}) {
  return (
    <NodeViewWrapper data-type="tab">
      <input
        className="w-full bg-transparent text-xs font-bold uppercase tracking-wider text-muted-foreground outline-none border-none p-0 mb-1"
        value={node.attrs.title}
        onChange={(e) => updateAttributes({ title: e.target.value })}
        placeholder="Tab title..."
      />
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
