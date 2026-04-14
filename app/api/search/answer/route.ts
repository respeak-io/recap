import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getAI } from "@/lib/ai/gemini";

const MAX_ARTICLES = 3;
const MAX_CONTENT_CHARS = 100_000;
const MODEL_ID = "gemini-3-flash-preview";

export async function POST(request: Request) {
  const { query, projectId, articleIds, lang } = (await request.json()) as {
    query?: string;
    projectId?: string;
    articleIds?: string[];
    lang?: string;
  };

  if (!query || !projectId || !articleIds?.length) {
    return NextResponse.json({ answer: null });
  }

  const ids = articleIds.slice(0, MAX_ARTICLES);
  const supabase = await createClient();

  let q = supabase
    .from("articles")
    .select("id, title, content_text, keywords, chapters(title, keywords)")
    .eq("project_id", projectId)
    .eq("status", "published")
    .in("id", ids);

  if (lang) q = q.eq("language", lang);

  const { data: articles, error } = await q;
  if (error || !articles?.length) {
    return NextResponse.json({ answer: null });
  }

  // Preserve client-requested order
  const ordered = ids
    .map((id) => articles.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const context = ordered
    .map((a) => {
      const chapter = Array.isArray(a.chapters) ? a.chapters[0] : a.chapters;
      const chapterTitle = chapter?.title ?? "";
      const articleKeywords = (a.keywords ?? []).join(", ");
      const chapterKeywords = (chapter?.keywords ?? []).join(", ");
      const header = [
        `### ${a.title}`,
        chapterTitle ? `Chapter: ${chapterTitle}` : "",
        articleKeywords ? `Article keywords: ${articleKeywords}` : "",
        chapterKeywords ? `Chapter keywords: ${chapterKeywords}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const body =
        a.content_text.length > MAX_CONTENT_CHARS
          ? a.content_text.slice(0, MAX_CONTENT_CHARS) + "\n\n[article truncated at 100k chars]"
          : a.content_text;

      return `${header}\n\n${body}`;
    })
    .join("\n\n---\n\n");

  const prompt = `Answer this question based on the following documentation: "${query}"

The following articles are provided in full. Quote specifically and cite article titles. If you reference a video timestamp, include it as [video:MM:SS]. Keep your answer to 2–4 sentences unless the question clearly needs more.

${context}`;

  const response = await getAI().models.generateContent({
    model: MODEL_ID,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  return NextResponse.json({ answer: response.text });
}
