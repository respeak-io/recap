import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GeneratedDoc } from "../ai/pipeline.js";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function writeMarkdown(doc: GeneratedDoc, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];

  for (const chapter of doc.chapters) {
    const slug = slugify(chapter.title);
    const filename = `${slug}.md`;
    const filepath = join(outDir, filename);

    const lines: string[] = [];
    lines.push(`# ${chapter.title}\n`);

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
