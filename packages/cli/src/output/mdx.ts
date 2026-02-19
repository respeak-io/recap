import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GeneratedDoc } from "../ai/pipeline.js";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function writeMdx(doc: GeneratedDoc, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];

  for (let i = 0; i < doc.chapters.length; i++) {
    const chapter = doc.chapters[i];
    const slug = slugify(chapter.title);
    const filename = `${slug}.mdx`;
    const filepath = join(outDir, filename);

    const lines: string[] = [];

    // Frontmatter
    lines.push("---");
    lines.push(`title: "${chapter.title.replace(/"/g, '\\"')}"`);
    lines.push(`sidebar_position: ${i + 1}`);
    lines.push("---");
    lines.push("");

    for (const section of chapter.sections) {
      lines.push(`## ${section.heading}\n`);
      lines.push(section.content);
      lines.push("");
    }

    await writeFile(filepath, lines.join("\n"), "utf-8");
    written.push(filepath);
  }

  return written;
}
