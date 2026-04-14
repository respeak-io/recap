import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

function makeRequest(q: string, projectId = "p1", lang = "de") {
  const url = `http://localhost/api/search?q=${encodeURIComponent(q)}&projectId=${projectId}&lang=${lang}`;
  return new Request(url);
}

describe("GET /api/search — hybrid pipeline", () => {
  let supa: ReturnType<typeof mockSupabase>;

  beforeEach(() => {
    supa = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(
      supa.client as unknown as Awaited<ReturnType<typeof createClient>>
    );
  });

  it("returns strict hits with fallback: null when stage 1 has results", async () => {
    supa.setTable("articles", {
      data: [
        { id: "a1", title: "Chat Zugriff", slug: "chat", content_text: "...", keywords: [], project_id: "p1", chapters: { title: "C", keywords: [] } },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const res = await GET(makeRequest("chat zugriff"));
    const body = await res.json();

    expect(body.articles).toHaveLength(1);
    expect(body.fallback).toBeNull();
    expect(supa.client.rpc).not.toHaveBeenCalled();
  });

  it("falls back to OR RPC when strict returns empty", async () => {
    supa.setTable("articles", { data: [], error: null });
    supa.client.rpc = vi.fn().mockResolvedValue({
      data: [
        { id: "a1", title: "Chat Zugriff", slug: "chat", content_text: "...", keywords: [], project_id: "p1", chapters: { title: "C", keywords: [] } },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const res = await GET(makeRequest("chat zugriff bekommen"));
    const body = await res.json();

    expect(body.articles).toHaveLength(1);
    expect(body.fallback).toBe("or");
    expect(supa.client.rpc).toHaveBeenCalledWith(
      "search_articles_loose",
      expect.objectContaining({
        p_project_id: "p1",
        p_query: "chat | zugriff | bekommen",
        p_lang: "de",
      })
    );
  });

  it("returns empty with fallback: null when both stages empty", async () => {
    supa.setTable("articles", { data: [], error: null });
    supa.client.rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    const { GET } = await import("@/app/api/search/route");
    const res = await GET(makeRequest("nothingmatches"));
    const body = await res.json();

    expect(body.articles).toEqual([]);
    expect(body.fallback).toBeNull();
  });

  it("sanitizes punctuation from OR tokens", async () => {
    supa.setTable("articles", { data: [], error: null });
    const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
    supa.client.rpc = rpcMock;

    const { GET } = await import("@/app/api/search/route");
    await GET(makeRequest("foo's bar; baz!"));

    expect(rpcMock).toHaveBeenCalledWith(
      "search_articles_loose",
      expect.objectContaining({ p_query: "foos | bar | baz" })
    );
  });

  it("short-circuits with empty response when query is only punctuation", async () => {
    supa.setTable("articles", { data: [], error: null });
    const rpcMock = vi.fn();
    supa.client.rpc = rpcMock;

    const { GET } = await import("@/app/api/search/route");
    const res = await GET(makeRequest("###"));
    const body = await res.json();

    expect(body.articles).toEqual([]);
    expect(body.fallback).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("logs fallback_level on search_events insert", async () => {
    supa.setTable("articles", { data: [], error: null });
    supa.client.rpc = vi.fn().mockResolvedValue({
      data: [{ id: "a1", title: "x", slug: "x", content_text: "", keywords: [], project_id: "p1", chapters: null }],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    await GET(makeRequest("chat zugriff bekommen"));

    expect(supa.getChain("search_events").insert).toHaveBeenCalledWith(
      expect.objectContaining({ fallback_level: "or", query: "chat zugriff bekommen" })
    );
  });

  it("logs fallback_level: null when strict succeeds", async () => {
    supa.setTable("articles", {
      data: [{ id: "a1", title: "x", slug: "x", content_text: "", keywords: [], project_id: "p1", chapters: null }],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    await GET(makeRequest("chat"));

    expect(supa.getChain("search_events").insert).toHaveBeenCalledWith(
      expect.objectContaining({ fallback_level: null, query: "chat" })
    );
  });
});
