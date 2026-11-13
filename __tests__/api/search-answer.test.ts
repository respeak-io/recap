import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase } from "../helpers/mock-supabase";

const supa = mockSupabase();
const generateContent = vi.fn();

vi.mock("next/cache", () => ({
  // Pass-through: these tests exercise the handler, not Next's cache.
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/ai/gemini", () => ({ getAI: () => ({ models: { generateContent } }) }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => supa.client }));
vi.mock("@/lib/ai/budget", () => ({
  isWithinDailyBudget: vi.fn(),
  recordAiUsage: vi.fn(),
}));

const budget = await import("@/lib/ai/budget");
const { resetRateLimits } = await import("@/lib/rate-limit");
const { POST } = await import("@/app/api/search/answer/route");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const A1 = "22222222-2222-4222-8222-222222222222";

function req(body: Record<string, unknown>, ip = "203.0.113.5") {
  return new Request("http://localhost/api/search/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

const validBody = { query: "How do I export?", projectId: PROJECT, articleIds: [A1], lang: "en" };

describe("POST /api/search/answer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    supa.setTable("articles", {
      data: [{ id: A1, title: "Export", content_text: "Click Export.", keywords: [], chapters: null }],
      error: null,
    });
    vi.mocked(budget.isWithinDailyBudget).mockResolvedValue(true);
    generateContent.mockResolvedValue({
      text: "Click Export (Export).",
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 50, thoughtsTokenCount: 0 },
    });
  });

  it("answers with the search-answer model and records the cost", async () => {
    const res = await POST(req(validBody));
    expect(await res.json()).toEqual({ answer: "Click Export (Export)." });

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.5-flash-lite" }),
    );
    const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).toContain('"how do i export?"');
    expect(prompt).toContain("Answer in the language of the question.");
    expect(budget.recordAiUsage).toHaveBeenCalledWith("search_answer", {
      inputTokens: 1000,
      outputTokens: 50,
      costUsd: (1000 * 0.3 + 50 * 2.5) / 1_000_000,
    });
  });

  it("skips Gemini once the daily budget is used up", async () => {
    vi.mocked(budget.isWithinDailyBudget).mockResolvedValue(false);
    const res = await POST(req(validBody));
    expect(await res.json()).toEqual({ answer: null, error: "daily_budget_exceeded" });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("rejects over-long questions without calling Gemini", async () => {
    const res = await POST(req({ ...validBody, query: "x".repeat(301) }));
    expect(res.status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("ignores malformed ids and answers null without articles", async () => {
    const res = await POST(req({ ...validBody, articleIds: ["not-a-uuid", 42] }));
    expect(await res.json()).toEqual({ answer: null });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("uses at most three articles", async () => {
    const ids = [1, 2, 3, 4, 5].map((n) => `2222222${n}-2222-4222-8222-222222222222`);
    await POST(req({ ...validBody, articleIds: ids }));
    const inCall = supa.getChain("articles").in.mock.calls[0];
    expect(inCall).toEqual(["id", ids.slice(0, 3)]);
  });

  it("rate-limits per IP", async () => {
    for (let i = 0; i < 10; i++) expect((await POST(req(validBody))).status).toBe(200);
    const blocked = await POST(req(validBody));
    expect(blocked.status).toBe(429);
    expect((await POST(req(validBody, "198.51.100.1"))).status).toBe(200);
  });

  it("returns a null answer when Gemini fails", async () => {
    generateContent.mockRejectedValue(new Error("upstream 503"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: null });
    spy.mockRestore();
  });
});
