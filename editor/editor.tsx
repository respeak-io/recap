"use client";

import { useState, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { FileHandler } from "@tiptap/extension-file-handler";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useVideoUpload } from "@/hooks/use-video-upload";
import { TimestampLink } from "./extensions/timestamp-link";
import { Callout } from "./extensions/callout";
import { ProjectVideo } from "./extensions/project-video";
import { SlashCommand } from "./extensions/slash-command";
import { slashCommandSuggestion } from "./slash-menu";
import { BubbleMenuContent } from "./bubble-menu";
import { VideoPicker } from "./video-picker";
import Link from "@tiptap/extension-link";
import { Details, DetailsSummary, DetailsContent } from "@tiptap/extension-details";
import { mergeAttributes } from "@tiptap/core";
import { TabGroup, Tab } from "./extensions/tabs";
import { Steps, Step } from "./extensions/steps";
import Typography from "@tiptap/extension-typography";
import { Toolbar } from "./toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

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
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const { upload } = useMediaUpload(projectId ?? "");
  const { upload: uploadVideo } = useVideoUpload(projectId ?? "");

  async function handleImageUpload(editor: any, file: File, pos?: number) {
    if (!editor || !projectId) return;
    const url = await upload(file);
    if (url) {
      if (pos !== undefined) {
        editor.chain().focus().insertContentAt(pos, { type: "image", attrs: { src: url } }).run();
      } else {
        editor.chain().focus().setImage({ src: url }).run();
      }
    } else {
      toast.error("Image upload failed. Please try again.");
    }
  }

  async function handleVideoUpload(editor: any, file: File, pos?: number) {
    if (!editor || !projectId) return;
    const result = await uploadVideo(file);
    if (result) {
      const node = { type: "projectVideo", attrs: { videoId: result.videoId, title: result.title } };
      if (pos !== undefined) {
        editor.chain().focus().insertContentAt(pos, node).run();
      } else {
        editor.chain().focus().insertContent(node).run();
      }
    } else {
      toast.error("Video upload failed. Please try again.");
    }
  }

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
      ...(projectId
        ? [
            FileHandler.configure({
              allowedMimeTypes: [
                "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
                "video/mp4", "video/webm", "video/quicktime",
              ],
              onDrop: (editor, files, pos) => {
                for (const file of files) {
                  if (file.type.startsWith("video/")) {
                    handleVideoUpload(editor, file, pos);
                  } else {
                    handleImageUpload(editor, file, pos);
                  }
                }
              },
              onPaste: (editor, files) => {
                for (const file of files) {
                  if (file.type.startsWith("video/")) {
                    handleVideoUpload(editor, file);
                  } else {
                    handleImageUpload(editor, file);
                  }
                }
              },
            }),
          ]
        : []),
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
      ProjectVideo,
      Typography,
      SlashCommand.configure({
        suggestion: slashCommandSuggestion(projectId, () => setVideoPickerOpen(true)),
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getJSON());
    },
  });

  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  if (!editor) return null;

  return (
    <TooltipProvider>
      <div className="border rounded-lg">
        <Toolbar
          editor={editor}
          projectId={projectId}
          onImageUpload={(file) => handleImageUpload(editor, file)}
          onOpenVideoPicker={() => setVideoPickerOpen(true)}
        />
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
      {projectId && (
        <VideoPicker
          projectId={projectId}
          open={videoPickerOpen}
          onOpenChange={setVideoPickerOpen}
          onSelect={(video) => {
            editorRef.current
              ?.chain()
              .focus()
              .setProjectVideo({ videoId: video.id, title: video.title })
              .run();
          }}
        />
      )}
    </TooltipProvider>
  );
}
