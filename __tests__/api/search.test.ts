import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase, makeRequest } from "../helpers/mock-supabase";

const supabaseMock = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(supabaseMock.client),
}));

const { GET } = await import("@/app/api/search/route");

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty articles when query is missing", async () => {
    const res = await GET(
      makeRequest("http://localhost/api/search?projectId=p1")
    );
    const json = await res.json();
    expect(json).toEqual({ articles: [] });
  });

  it("returns empty articles when projectId is missing", async () => {
    const res = await GET(
      makeRequest("http://localhost/api/search?q=hello")
    );
    const json = await res.json();
    expect(json).toEqual({ articles: [] });
  });

  it("searches articles and returns results", async () => {
    const mockArticles = [
      { id: "a1", title: "Getting Started", slug: "getting-started" },
    ];
    supabaseMock.setTable("articles", { data: mockArticles });
    // Also set search_events for the async log
    supabaseMock.setTable("search_events", { data: null, error: null });

    const res = await GET(
      makeRequest("http://localhost/api/search?q=getting&projectId=p1")
    );
    const json = await res.json();
    expect(json.articles).toEqual(mockArticles);
    expect(supabaseMock.getChain("articles").textSearch).toHaveBeenCalledWith(
      "fts",
      "getting",
      expect.objectContaining({ type: "websearch" })
    );
  });

  it("filters by language when provided", async () => {
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("search_events", { data: null, error: null });

    await GET(
      makeRequest("http://localhost/api/search?q=test&projectId=p1&lang=de")
    );
    // The chain should have eq called with "language", "de" at some point
    const eqCalls = supabaseMock.getChain("articles").eq.mock.calls;
    expect(eqCalls.some((c: unknown[]) => c[0] === "language" && c[1] === "de")).toBe(true);
  });
});
