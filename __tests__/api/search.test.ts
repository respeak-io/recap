import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase, makeRequest } from "../helpers/mock-supabase";
import { resetRateLimits } from "@/lib/rate-limit";

const supabaseMock = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(supabaseMock.client),
}));

const { GET } = await import("@/app/api/search/route");

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  it("returns empty articles when query is missing", async () => {
    const res = await GET(makeRequest("http://localhost/api/search?projectId=p1"));
    expect(await res.json()).toEqual({ articles: [], fallback: null });
  });

  it("returns empty articles when projectId is missing", async () => {
    const res = await GET(makeRequest("http://localhost/api/search?q=hello"));
    expect(await res.json()).toEqual({ articles: [], fallback: null });
  });

  it("searches through the ranked RPC with the language filter", async () => {
    const hits = [
      { id: "a1", title: "Getting Started", slug: "getting-started" },
      { id: "a2", title: "Getting Help", slug: "getting-help" },
      { id: "a3", title: "Getting Paid", slug: "getting-paid" },
    ];
    supabaseMock.client.rpc = vi.fn().mockResolvedValue({ data: hits, error: null });
    supabaseMock.setTable("search_events", { data: null, error: null });

    const res = await GET(makeRequest("http://localhost/api/search?q=getting&projectId=p1&lang=de"));
    const json = await res.json();

    expect(json.articles).toEqual(hits);
    expect(supabaseMock.client.rpc).toHaveBeenCalledWith(
      "search_articles_ranked",
      expect.objectContaining({ p_project_id: "p1", p_terms: ["getting"], p_lang: "de" }),
    );
  });

  it("returns 429 after the per-IP limit", async () => {
    supabaseMock.client.rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    supabaseMock.setTable("search_events", { data: null, error: null });
    const req = () =>
      new Request("http://localhost/api/search?q=x&projectId=p1", { headers: { "x-real-ip": "203.0.113.9" } });

    for (let i = 0; i < 60; i++) expect((await GET(req())).status).toBe(200);
    const blocked = await GET(req());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });
});
