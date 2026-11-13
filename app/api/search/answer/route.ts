import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAI } from "@/lib/ai/gemini";
import { AI_MODELS, estimateCostUsd, thinkingConfigFor } from "@/lib/ai/models";
import { isWithinDailyBudget, recordAiUsage } from "@/lib/ai/budget";
import { createPublicClient } from "@/lib/supabase/public";
import { DOCS_CACHE_TAG } from "@/lib/docs/cache";
import { isLocale } from "@/lib/docs-locale";
import {
  RATE_LIMITS,
  checkRateLimits,
  clientIp,
  tooManyRequests,
} from "@/lib/rate-limit";

/**
 * AI answer for the public docs search.
 *
 * Public and unauthenticated, so every layer here limits cost:
 * - input limits (question length, at most 3 articles, small request body),
 * - per-IP rate limits (lib/rate-limit.ts),
 * - an answer cache keyed by project/language/question/articles, purged with
 *   the docs cache when content changes, so repeated questions are free,
 * - a hard daily spend cap shared by all visitors (lib/ai/budget.ts).
 * When a limit is hit the search results still work; only the answer is null.
 */

const MAX_ARTICLES = 3;
const MAX_QUERY_CHARS = 300;
const MAX_BODY_BYTES = 8_192;
const MAX_CONTENT_CHARS = 100_000;
const ANSWER_CACHE_SECONDS = 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class DailyBudgetExceeded extends Error {}

interface AnswerArticle {
  id: string;
  title: string;
  content_text: string | null;
  keywords: string[] | null;
  chapters: { title: string; keywords: string[] | null } | { title: string; keywords: string[] | null }[] | null;
}

function buildPrompt(query: string, articles: AnswerArticle[]): string {
  const context = articles
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

      const text = a.content_text ?? "";
      const body =
        text.length > MAX_CONTENT_CHARS
          ? text.slice(0, MAX_CONTENT_CHARS) + "\n\n[article truncated at 100k chars]"
          : text;

      return `${header}\n\n${body}`;
    })
    .join("\n\n---\n\n");

  return `Answer this question based on the following documentation: "${query}"

The following articles are provided in full. Quote specifically and cite article titles. If you reference a video timestamp, include it as [video:MM:SS]. Keep your answer to 2–4 sentences unless the question clearly needs more. Answer in the language of the question.

${context}`;
}

/**
 * Cached per (project, language, normalized question, article ids). Throws on
 * budget exhaustion or Gemini errors so failures are never cached.
 */
const answerQuestion = unstable_cache(
  async (projectId: string, lang: string, query: string, articleIds: string[]): Promise<string | null> => {
    // Anonymous client: only published articles of public projects (RLS).
    let q = createPublicClient()
      .from("articles")
      .select("id, title, content_text, keywords, chapters(title, keywords)")
      .eq("project_id", projectId)
      .eq("status", "published")
      .in("id", articleIds);
    if (lang) q = q.eq("language", lang);

    const { data, error } = await q;
    if (error) throw new Error(`answer article lookup failed: ${error.message}`);
    const ordered = articleIds
      .map((id) => (data as AnswerArticle[] | null)?.find((a) => a.id === id))
      .filter((a): a is AnswerArticle => Boolean(a));
    if (ordered.length === 0) return null;

    if (!(await isWithinDailyBudget())) throw new DailyBudgetExceeded();

    const choice = AI_MODELS.searchAnswer;
    const response = await getAI().models.generateContent({
      model: choice.model,
      contents: [{ role: "user", parts: [{ text: buildPrompt(query, ordered) }] }],
      config: thinkingConfigFor(choice),
    });

    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
    await recordAiUsage("search_answer", {
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(choice.model, inputTokens, outputTokens),
    });

    return response.text ?? null;
  },
  ["search-answer-v2"],
  { tags: [DOCS_CACHE_TAG], revalidate: ANSWER_CACHE_SECONDS },
);

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().toLowerCase();
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ answer: null, error: "Request too large" }, { status: 413 });
  }

  const limited = checkRateLimits(`answer:${clientIp(request)}`, [
    RATE_LIMITS.searchAnswerPerMinute,
    RATE_LIMITS.searchAnswerPerDay,
  ]);
  if (!limited.ok) {
    return tooManyRequests(limited.retryAfterSeconds, { answer: null, error: "rate_limited" });
  }

  let body: { query?: unknown; projectId?: unknown; articleIds?: unknown; lang?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ answer: null, error: "Invalid JSON" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? normalizeQuery(body.query) : "";
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const lang = typeof body.lang === "string" && isLocale(body.lang) ? body.lang : "";
  const articleIds = Array.isArray(body.articleIds)
    ? body.articleIds.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)).slice(0, MAX_ARTICLES)
    : [];

  if (!query || !UUID_RE.test(projectId) || articleIds.length === 0) {
    return NextResponse.json({ answer: null });
  }
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json({ answer: null, error: "Question too long" }, { status: 400 });
  }

  try {
    const answer = await answerQuestion(projectId, lang, query, articleIds);
    return NextResponse.json({ answer });
  } catch (err) {
    if (err instanceof DailyBudgetExceeded) {
      return NextResponse.json({ answer: null, error: "daily_budget_exceeded" });
    }
    console.error("[search/answer]", err);
    return NextResponse.json({ answer: null });
  }
}
