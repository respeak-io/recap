// Re-export shim. The canonical markdown -> Tiptap converter now lives in the
// `@respeak/recap` package (packages/cli/src/markdown/markdown-to-tiptap.ts) so
// the standalone `recap` CLI (which runs the same conversion when diffing local
// docs against the server) and the server (which writes content_json /
// content_text on sync) share ONE implementation and can never drift.
//
// App code keeps importing `@/lib/ai/markdown-to-tiptap`; this file just points
// that path at the package source of truth.
export { markdownToTiptap, markdownToTiptapRaw } from "@respeak/recap/markdown";
