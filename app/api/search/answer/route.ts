import { NextResponse } from "next/server";
import { getAI } from "@/lib/ai/gemini";

export async function POST(request: Request) {
  const { query, articles } = await request.json();

  if (!query || !articles?.length) {
    return NextResponse.json({ answer: null });
  }

  const context = articles
    .map(
      (a: { title: string; content_text: string }) =>
        `### ${a.title}\n${a.content_text.slice(0, 1000)}`
    )
    .join("\n\n");

  const response = await getAI().models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Based on the following documentation, answer this question concisely: "${query}"

${context}

If you reference a specific article, mention its title. If you reference a video timestamp, include it as [video:MM:SS]. Keep your answer to 2-3 sentences.`,
          },
        ],
      },
    ],
  });

  return NextResponse.json({ answer: response.text });
}
