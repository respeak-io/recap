import { createClient } from "@/lib/supabase/server";

interface LlmsChapter {
  title: string;
  articles: { title: string; slug: string; content_text: string }[];
}

async function fetchLlmsData(
  projectSlug: string
): Promise<{ name: string; chapters: LlmsChapter[] } | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "*, chapters(*, articles(id, title, slug, language, status, content_text, \"order\"))"
    )
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) return null;

  const chapters = project.chapters
    .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
    .map((ch: { title: string; order: number; articles: { language: string; status: string; title: string; slug: string; content_text: string; order: number }[] }) => ({
      title: ch.title,
      articles: ch.articles
        .filter((a) => a.language === "en" && a.status === "published")
        .sort((a, b) => a.order - b.order),
    }))
    .filter((ch: { articles: unknown[] }) => ch.articles.length > 0);

  if (chapters.length === 0) return null;

  return { name: project.name, chapters };
}

export async function generateLlmsTxt(projectSlug: string) {
  const data = await fetchLlmsData(projectSlug);
  if (!data) return null;

  const lines = [`# ${data.name}\n`];
  lines.push(
    `> Documentation for ${data.name}, optimized for LLM consumption.\n`
  );

  for (const chapter of data.chapters) {
    lines.push(`## ${chapter.title}`);
    for (const article of chapter.articles) {
      const url = `/${projectSlug}/${article.slug}`;
      lines.push(
        `- [${article.title}](${url}): ${article.content_text.slice(0, 120)}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function generateLlmsFullTxt(projectSlug: string) {
  const data = await fetchLlmsData(projectSlug);
  if (!data) return null;

  const lines = [`# ${data.name}\n`];
  lines.push(
    `> Complete documentation for ${data.name}.\n`
  );

  for (const chapter of data.chapters) {
    lines.push(`## ${chapter.title}\n`);
    for (const article of chapter.articles) {
      lines.push(`### ${article.title}\n`);
      lines.push(article.content_text);
      lines.push("");
    }
  }

  return lines.join("\n");
}
