import { createClient } from "@/lib/supabase/server";

export async function generateLlmsTxt(projectSlug: string) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "*, chapters(*, articles(id, title, slug, audience, language, status, content_text))"
    )
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) return null;

  const chapters = project.chapters
    .map((ch: { title: string; articles: { audience: string; language: string; status: string; title: string; slug: string; content_text: string }[] }) => ({
      ...ch,
      articles: ch.articles.filter(
        (a) => a.audience === "ai-agents" && a.language === "en" && a.status === "published"
      ),
    }))
    .filter((ch: { articles: unknown[] }) => ch.articles.length > 0);

  if (chapters.length === 0) return null;

  const lines = [`# ${project.name}\n`];
  lines.push(
    `> Documentation for ${project.name}, optimized for LLM consumption.\n`
  );

  for (const chapter of chapters) {
    lines.push(`## ${chapter.title}`);
    for (const article of chapter.articles) {
      const url = `/${projectSlug}/${article.slug}?audience=ai-agents`;
      lines.push(
        `- [${article.title}](${url}): ${article.content_text.slice(0, 120)}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function generateLlmsFullTxt(projectSlug: string) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "*, chapters(*, articles(id, title, slug, audience, language, status, content_text))"
    )
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) return null;

  const chapters = project.chapters
    .map((ch: { title: string; articles: { audience: string; language: string; status: string; title: string; content_text: string }[] }) => ({
      ...ch,
      articles: ch.articles.filter(
        (a) => a.audience === "ai-agents" && a.language === "en" && a.status === "published"
      ),
    }))
    .filter((ch: { articles: unknown[] }) => ch.articles.length > 0);

  if (chapters.length === 0) return null;

  const lines = [`# ${project.name}\n`];
  lines.push(
    `> Complete documentation for ${project.name}.\n`
  );

  for (const chapter of chapters) {
    lines.push(`## ${chapter.title}\n`);
    for (const article of chapter.articles) {
      lines.push(`### ${article.title}\n`);
      lines.push(article.content_text);
      lines.push("");
    }
  }

  return lines.join("\n");
}
