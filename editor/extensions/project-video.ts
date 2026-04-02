import { Node, mergeAttributes } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    projectVideo: {
      setProjectVideo: (attrs: { videoId?: string; videoGroupId?: string; title: string }) => ReturnType;
    };
  }
}

export const ProjectVideo = Node.create({
  name: "projectVideo",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      videoId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-video-id"),
        renderHTML: (attributes) => attributes.videoId ? { "data-video-id": attributes.videoId } : {},
      },
      videoGroupId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-video-group-id"),
        renderHTML: (attributes) => attributes.videoGroupId ? { "data-video-group-id": attributes.videoGroupId } : {},
      },
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="projectVideo"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const title = HTMLAttributes["data-title"] || "Video";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "projectVideo",
        class: "flex items-center gap-3 rounded-lg border border-dashed p-4 my-4 bg-muted/30",
      }),
      [
        "div",
        { class: "flex items-center gap-3 text-sm text-muted-foreground" },
        ["span", {}, "🎬"],
        ["span", {}, title],
      ],
    ];
  },

  addCommands() {
    return {
      setProjectVideo:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
