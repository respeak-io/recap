import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { resetRateLimits } from "@/lib/rate-limit";

function makeRequest(q: string, projectId = "p1", lang = "de") {
  const url = `http://localhost/api/search?q=${encodeURIComponent(q)}&projectId=${projectId}&lang=${lang}`;
  return new Request(url);
}

describe("GET /api/search — ranked search", () => {
  let supa: ReturnType<typeof mockSupabase>;

  const art = (id: string, matched_terms: number) => ({
    id, title: id, slug: id, content_text: "", keywords: [], project_id: "p1", chapters: null, matched_terms,
  });

  beforeEach(() => {
    resetRateLimits();
    supa = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(
      supa.client as unknown as Awaited<ReturnType<typeof createClient>>
    );
  });

  it("calls search_articles_ranked once with the meaningful terms", async () => {
    supa.client.rpc = vi.fn().mockResolvedValue({ data: [art("a1", 2), art("a2", 1)], error: null });

    const { GET } = await import("@/app/api/search/route");
    const body = await (await GET(makeRequest("chat zugriff"))).json();

    expect(body.articles.map((a: { id: string }) => a.id)).toEqual(["a1", "a2"]);
    expect(body.fallback).toBeNull();
    expect(supa.client.rpc).toHaveBeenCalledTimes(1);
    expect(supa.client.rpc).toHaveBeenCalledWith("search_articles_ranked", {
      p_project_id: "p1",
      p_terms: ["chat", "zugriff"],
      p_lang: "de",
      p_limit: 10,
    });
  });

  it("does not expose the internal matched_terms column", async () => {
    supa.client.rpc = vi.fn().mockResolvedValue({ data: [art("a1", 2)], error: null });

    const { GET } = await import("@/app/api/search/route");
    const body = await (await GET(makeRequest("chat zugriff"))).json();

    expect(body.articles[0]).not.toHaveProperty("matched_terms");
  });

  it("drops stop words so natural-language questions still match", async () => {
    supa.client.rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    const { GET } = await import("@/app/api/search/route");
    await GET(makeRequest("Kann ich Ergebnisse exportieren?"));

    expect(supa.client.rpc).toHaveBeenCalledWith(
      "search_articles_ranked",
      expect.objectContaining({ p_terms: ["ergebnisse", "exportieren"] }),
    );
  });

  it("reports fallback 'or' when no result contains every term, and logs it", async () => {
    supa.client.rpc = vi.fn().mockResolvedValue({ data: [art("a1", 2)], error: null });

    const { GET } = await import("@/app/api/search/route");
    const body = await (await GET(makeRequest("chat zugriff bekommen"))).json();

    expect(body.fallback).toBe("or");
    expect(supa.getChain("search_events").insert).toHaveBeenCalledWith(
      expect.objectContaining({ fallback_level: "or", query: "chat zugriff bekommen" }),
    );
  });

  it("returns empty with fallback: null when nothing matches", async () => {
    supa.client.rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    const { GET } = await import("@/app/api/search/route");
    const body = await (await GET(makeRequest("nothing matches"))).json();

    expect(body).toEqual({ articles: [], fallback: null });
  });

  it("sanitizes punctuation into plain terms", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    supa.client.rpc = rpcMock;

    const { GET } = await import("@/app/api/search/route");
    await GET(makeRequest("foo's bar; baz!"));

    expect(rpcMock).toHaveBeenCalledWith(
      "search_articles_ranked",
      expect.objectContaining({ p_terms: ["foo", "bar", "baz"] }),
    );
  });

  it("short-circuits with an empty response when the query is only punctuation", async () => {
    const rpcMock = vi.fn();
    supa.client.rpc = rpcMock;

    const { GET } = await import("@/app/api/search/route");
    const body = await (await GET(makeRequest("###"))).json();

    expect(body).toEqual({ articles: [], fallback: null });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("logs fallback_level: null when a result contains every term", async () => {
    supa.client.rpc = vi.fn().mockResolvedValue({ data: [art("a1", 1)], error: null });

    const { GET } = await import("@/app/api/search/route");
    await GET(makeRequest("chat"));

    expect(supa.getChain("search_events").insert).toHaveBeenCalledWith(
      expect.objectContaining({ fallback_level: null, query: "chat" }),
    );
  });
});
