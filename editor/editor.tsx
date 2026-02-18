"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { TimestampLink } from "./extensions/timestamp-link";
import { Callout } from "./extensions/callout";
import { SlashCommand } from "./extensions/slash-command";
import { slashCommandSuggestion } from "./slash-menu";
import { BubbleMenuContent } from "./bubble-menu";
import Link from "@tiptap/extension-link";
import { Toolbar } from "./toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";

const lowlight = createLowlight(common);

interface EditorProps {
  content: Record<string, unknown>;
  onUpdate: (json: Record<string, unknown>) => void;
  onTimestampClick?: (seconds: number) => void;
}

export function Editor({ content, onUpdate, onTimestampClick }: EditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder: "Start writing..." }),
      TimestampLink.configure({ onTimestampClick }),
      Callout,
      Link.configure({ openOnClick: false }),
      SlashCommand.configure({
        suggestion: slashCommandSuggestion(),
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getJSON());
    },
  });

  if (!editor) return null;

  return (
    <TooltipProvider>
      <div className="border rounded-lg">
        <Toolbar editor={editor} />
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none p-4 min-h-[400px] focus-within:outline-none [&_.ProseMirror]:outline-none"
        />
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor, state }) => {
            const { from, to } = state.selection;
            if (from === to) return false;
            if (editor.isActive("codeBlock")) return false;
            return true;
          }}
        >
          <BubbleMenuContent editor={editor} />
        </BubbleMenu>
      </div>
    </TooltipProvider>
  );
}
