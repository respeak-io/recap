import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase, makeRequest } from "../helpers/mock-supabase";

const supabaseMock = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(supabaseMock.client),
}));

const { POST } = await import("@/app/api/analytics/track/route");

describe("POST /api/analytics/track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when type is missing", async () => {
    const res = await POST(
      makeRequest("http://localhost/api/analytics/track", {
        method: "POST",
        body: { projectId: "p1" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when projectId is missing", async () => {
    const res = await POST(
      makeRequest("http://localhost/api/analytics/track", {
        method: "POST",
        body: { type: "page_view" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for page_view without articleSlug", async () => {
    const res = await POST(
      makeRequest("http://localhost/api/analytics/track", {
        method: "POST",
        body: { type: "page_view", projectId: "p1" },
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("articleSlug");
  });

  it("inserts a page_view event", async () => {
    supabaseMock.setTable("page_views", { data: null, error: null });
    const res = await POST(
      makeRequest("http://localhost/api/analytics/track", {
        method: "POST",
        body: {
          type: "page_view",
          projectId: "p1",
          articleSlug: "getting-started",
          articleId: "art-1",
          language: "en",
        },
        headers: { referer: "https://example.com" },
      })
    );
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(supabaseMock.getChain("page_views").insert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "p1",
        article_slug: "getting-started",
      })
    );
  });

  it("returns 400 for search without query", async () => {
    const res = await POST(
      makeRequest("http://localhost/api/analytics/track", {
        method: "POST",
        body: { type: "search", projectId: "p1" },
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("query");
  });

  it("inserts a search event", async () => {
    supabaseMock.setTable("search_events", { data: null, error: null });
    const res = await POST(
      makeRequest("http://localhost/api/analytics/track", {
        method: "POST",
        body: {
          type: "search",
          projectId: "p1",
          query: "hello",
          resultsCount: 5,
        },
      })
    );
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(
      supabaseMock.getChain("search_events").insert
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "p1",
        query: "hello",
        results_count: 5,
      })
    );
  });

  it("returns 400 for unknown event type", async () => {
    const res = await POST(
      makeRequest("http://localhost/api/analytics/track", {
        method: "POST",
        body: { type: "unknown_type", projectId: "p1" },
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Unknown");
  });

  it("returns 500 when page_view insert fails", async () => {
    supabaseMock.setTable("page_views", {
      error: { message: "insert failed" },
    });
    const res = await POST(
      makeRequest("http://localhost/api/analytics/track", {
        method: "POST",
        body: {
          type: "page_view",
          projectId: "p1",
          articleSlug: "test",
        },
      })
    );
    expect(res.status).toBe(500);
  });
});
