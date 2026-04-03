"use client";

import { useState, useRef } from "react";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { TimestampLink } from "./extensions/timestamp-link";
import { Callout } from "./extensions/callout";
import { ProjectVideo } from "./extensions/project-video";
import { SlashCommand } from "./extensions/slash-command";
import { slashCommandSuggestion } from "./slash-menu";
import { BubbleMenuContent } from "./bubble-menu";
import Link from "@tiptap/extension-link";
import { Details, DetailsSummary, DetailsContent } from "@tiptap/extension-details";
import { mergeAttributes } from "@tiptap/core";
import { TabGroup, Tab } from "./extensions/tabs";
import { Steps, Step } from "./extensions/steps";
import Typography from "@tiptap/extension-typography";
import { Toolbar } from "./toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MediaPicker, type MediaPickerTab } from "./media-picker";

const lowlight = createLowlight(common);

// Override DetailsSummary to render as div[data-type="detailsSummary"] instead of
// native <summary>. The tiptap extension's own CSS targets this data-type selector,
// but renders <summary> by default — causing a mismatch with Tailwind v4's compilation.
const CustomDetailsSummary = DetailsSummary.extend({
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { "data-type": "detailsSummary" }), 0];
  },
  parseHTML() {
    return [
      { tag: 'div[data-type="detailsSummary"]' },
      { tag: "summary" },
    ];
  },
});

interface EditorProps {
  content: Record<string, unknown>;
  onUpdate: (json: Record<string, unknown>) => void;
  onTimestampClick?: (seconds: number) => void;
  projectId?: string;
}

export function Editor({ content, onUpdate, onTimestampClick, projectId }: EditorProps) {
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState<MediaPickerTab>("images");
  const editorRef = useRef<TiptapEditor | null>(null);

  function openMediaPicker(tab: MediaPickerTab) {
    setMediaPickerTab(tab);
    setMediaPickerOpen(true);
  }

  // Ref-based callback so slash-menu always gets the latest version
  const openMediaPickerRef = useRef(openMediaPicker);
  openMediaPickerRef.current = openMediaPicker;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Image.configure({
        resize: {
          enabled: true,
          alwaysPreserveAspectRatio: true,
          minWidth: 50,
          minHeight: 50,
        },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder: "Start writing..." }),
      TimestampLink.configure({ onTimestampClick }),
      Callout,
      Link.configure({ openOnClick: false }),
      Details,
      CustomDetailsSummary,
      DetailsContent,
      TabGroup,
      Tab,
      Steps,
      Step,
      Typography,
      ProjectVideo,
      SlashCommand.configure({
        suggestion: slashCommandSuggestion(projectId, (tab: MediaPickerTab) => openMediaPickerRef.current(tab)),
      }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onUpdate(e.getJSON());
    },
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
    },
  });

  if (!editor) return null;

  return (
    <TooltipProvider>
      <div className="border rounded-lg">
        <Toolbar editor={editor} projectId={projectId} onOpenMediaPicker={openMediaPicker} />
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none p-4 min-h-[400px] focus-within:outline-none [&_.ProseMirror]:outline-none"
        />
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: e, state }) => {
            const { from, to } = state.selection;
            if (from === to) return false;
            if (e.isActive("codeBlock")) return false;
            return true;
          }}
        >
          <BubbleMenuContent editor={editor} />
        </BubbleMenu>
      </div>
      {projectId && (
        <MediaPicker
          projectId={projectId}
          open={mediaPickerOpen}
          defaultTab={mediaPickerTab}
          onOpenChange={setMediaPickerOpen}
          onSelectImage={(url) => {
            editorRef.current?.chain().focus().setImage({ src: url }).run();
          }}
          onSelectVideoGroup={(videoGroupId, title) => {
            editorRef.current?.chain().focus().setProjectVideo({ videoGroupId, title }).run();
          }}
        />
      )}
    </TooltipProvider>
  );
}
