import { NextResponse } from "next/server";
import { getAI } from "@/lib/ai/gemini";

const MAX_ARTICLES = 3;
const MAX_CONTENT_CHARS = 100_000;
const MODEL_ID = "gemini-3-flash-preview";

type ArticleContext = {
  title: string;
  content_text: string;
  keywords?: string[];
  chapters?: { title?: string | null; keywords?: string[] | null } | null;
};

export async function POST(request: Request) {
  const { query, articles } = (await request.json()) as {
    query?: string;
    articles?: ArticleContext[];
  };

  if (!query || !articles?.length) {
    return NextResponse.json({ answer: null });
  }

  const top = articles.slice(0, MAX_ARTICLES);

  const context = top
    .map((a) => {
      const chapterTitle = a.chapters?.title ?? "";
      const articleKeywords = (a.keywords ?? []).join(", ");
      const chapterKeywords = (a.chapters?.keywords ?? []).join(", ");
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
