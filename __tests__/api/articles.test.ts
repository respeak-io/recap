import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase, makeRequest } from "../helpers/mock-supabase";

// Mock createClient to return our mock
const supabaseMock = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(supabaseMock.client),
}));

// Mock translate module (has transitive deps)
vi.mock("@/lib/ai/translate", () => ({
  translateTiptapJson: vi.fn().mockResolvedValue({
    json: { type: "doc", content: [] },
    text: "translated text",
    title: "Translated Title",
  }),
}));

const { DELETE } = await import("@/app/api/articles/[id]/route");
const { POST: reorderPOST } = await import("@/app/api/articles/reorder/route");
const { POST: translatePOST } = await import(
  "@/app/api/articles/[id]/translate/route"
);

describe("DELETE /api/articles/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes an article and returns success", async () => {
    supabaseMock.setTable("articles", { data: null, error: null });
    const res = await DELETE(
      makeRequest("http://localhost/api/articles/art-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "art-1" }) }
    );
    const json = await res.json();

    expect(json).toEqual({ success: true });
    expect(supabaseMock.getChain("articles").delete).toHaveBeenCalled();
    expect(supabaseMock.getChain("articles").eq).toHaveBeenCalledWith(
      "id",
      "art-1"
    );
  });

  it("returns 500 when delete fails", async () => {
    supabaseMock.setTable("articles", {
      error: { message: "delete failed" },
    });
    const res = await DELETE(
      makeRequest("http://localhost/api/articles/art-2", { method: "DELETE" }),
      { params: Promise.resolve({ id: "art-2" }) }
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("delete failed");
  });
});

describe("POST /api/articles/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates order for each item", async () => {
    supabaseMock.setTable("articles", { data: null, error: null });
    const items = [
      { id: "a1", order: 0, chapter_id: "ch1" },
      { id: "a2", order: 1, chapter_id: "ch1" },
    ];
    const res = await reorderPOST(
      makeRequest("http://localhost/api/articles/reorder", {
        method: "POST",
        body: { items },
      })
    );
    const json = await res.json();
    expect(json).toEqual({ success: true });
    // update called for each item
    expect(supabaseMock.getChain("articles").update).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/articles/[id]/translate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when article not found", async () => {
    supabaseMock.setTable("articles", { data: null });
    const res = await translatePOST(
      makeRequest("http://localhost/api/articles/missing/translate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when english source not found", async () => {
    // First call returns the target article, second returns null for English sibling
    let callCount = 0;
    const chain = supabaseMock.getChain("articles");
    chain.single = vi.fn(() => {
      callCount++;
      const data = callCount === 1
        ? { id: "art-de", project_id: "p1", slug: "intro", language: "de" }
        : null;
      return { ...chain, _result: { data, error: null }, then: vi.fn((r: (v: unknown) => void) => r({ data, error: null })) };
    });

    const res = await translatePOST(
      makeRequest("http://localhost/api/articles/art-de/translate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "art-de" }) }
    );
    expect(res.status).toBe(404);
  });

  it("translates and updates the article", async () => {
    const targetArticle = {
      id: "art-de",
      project_id: "p1",
      slug: "intro",
      language: "de",
      title: "Einleitung",
    };
    const englishArticle = {
      id: "art-en",
      project_id: "p1",
      slug: "intro",
      language: "en",
      title: "Introduction",
      content_json: { type: "doc", content: [] },
      content_text: "Hello",
    };

    let callCount = 0;
    const chain = supabaseMock.getChain("articles");
    chain.single = vi.fn(() => {
      callCount++;
      const data = callCount === 1 ? targetArticle : englishArticle;
      return { ...chain, _result: { data, error: null }, then: vi.fn((r: (v: unknown) => void) => r({ data, error: null })) };
    });

    const res = await translatePOST(
      makeRequest("http://localhost/api/articles/art-de/translate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "art-de" }) }
    );
    const json = await res.json();
    expect(json).toEqual({ success: true });
    expect(chain.update).toHaveBeenCalled();
  });
});
