import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase, makeRequest } from "../../helpers/mock-supabase";

const supabaseMock = mockSupabase();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => supabaseMock.client),
}));
vi.mock("@/lib/api-key-auth", async () => ({
  validateApiKey: vi.fn().mockResolvedValue({ orgId: "org-1", keyId: "k-1" }),
  apiError: (await import("@/lib/api/errors")).apiError,
}));
vi.mock("@/lib/api-v1-helpers", async () => {
  const actual = await import("@/lib/api-v1-helpers");
  return {
    ...actual,
    resolveProject: vi.fn().mockResolvedValue({ id: "proj-1" }),
  };
});

const apiV1Helpers = await import("@/lib/api-v1-helpers");

vi.mock("@/lib/ai/markdown-to-tiptap", () => ({
  markdownToTiptapRaw: vi.fn().mockReturnValue({
    doc: { type: "doc", content: [] },
    text: "plain text",
  }),
}));

const { PUT } = await import(
  "@/app/api/v1/projects/[slug]/sync/route"
);

describe("PUT /api/v1/projects/[slug]/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("returns 422 when chapters array is missing", async () => {
    const res = await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {},
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when chapters is not an array", async () => {
    const res = await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: { chapters: "not an array" },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(422);
  });

  it("syncs chapters and articles, returning stats", async () => {
    // Mock existing chapters (empty — all will be created)
    supabaseMock.setTable("chapters", { data: [] });
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    // Mock chapter insert returning an id
    const chapChain = supabaseMock.getChain("chapters");
    chapChain.single = vi.fn(() => ({
      ...chapChain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: { id: "ch-new-1" }, error: null })
      ),
    }));

    // Mock article insert
    const artChain = supabaseMock.getChain("articles");
    artChain.then = vi.fn((r: (v: unknown) => void) =>
      r({ data: null, error: null })
    );

    const res = await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [
            {
              title: "Getting Started",
              articles: [
                { title: "Welcome", content: "# Welcome" },
                { title: "Setup", content: "# Setup" },
              ],
            },
          ],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    const json = await res.json();
    expect(json.chapters.created).toBe(1);
    expect(json.articles.created).toBe(2);
    expect(json.chapters.deleted).toBe(0);
    expect(json.articles.deleted).toBe(0);
  });

  it("updates existing chapters instead of creating new ones", async () => {
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    // Build a chapters chain that returns existing data on first await,
    // then null on subsequent awaits (update/insert)
    const chapChain = supabaseMock.getChain("chapters");
    const existingData = [{ id: "ch-existing", slug: "getting-started" }];
    let chapCallCount = 0;
    chapChain.then = vi.fn((r: (v: unknown) => void) => {
      chapCallCount++;
      if (chapCallCount === 1) {
        return r({ data: existingData, error: null });
      }
      return r({ data: null, error: null });
    });

    const res = await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [
            {
              title: "Getting Started",
              slug: "getting-started",
              articles: [],
            },
          ],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    const json = await res.json();
    expect(json.chapters.updated).toBe(1);
    expect(json.chapters.created).toBe(0);
  });

  it("deletes chapters not in payload", async () => {
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    const chapChain = supabaseMock.getChain("chapters");
    const existingData = [
      { id: "ch-keep", slug: "keep" },
      { id: "ch-remove", slug: "remove-me" },
    ];
    let chapCallCount = 0;
    chapChain.then = vi.fn((r: (v: unknown) => void) => {
      chapCallCount++;
      if (chapCallCount === 1) {
        return r({ data: existingData, error: null });
      }
      return r({ data: null, error: null });
    });

    const res = await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [{ title: "Keep", slug: "keep", articles: [] }],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    const json = await res.json();
    expect(json.chapters.deleted).toBe(1);
  });

  it("preserves chapters absent from payload when prune is false", async () => {
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    const chapChain = supabaseMock.getChain("chapters");
    const existingData = [
      { id: "ch-keep", slug: "keep" },
      { id: "ch-untouched", slug: "not-in-payload" },
    ];
    let chapCallCount = 0;
    chapChain.then = vi.fn((r: (v: unknown) => void) => {
      chapCallCount++;
      if (chapCallCount === 1) {
        return r({ data: existingData, error: null });
      }
      return r({ data: null, error: null });
    });

    const res = await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          prune: false,
          chapters: [{ title: "Keep", slug: "keep", articles: [] }],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    const json = await res.json();
    expect(json.chapters.deleted).toBe(0);
    // The chapter delete pass never runs, so .delete() is not invoked.
    expect(supabaseMock.getChain("chapters").delete).not.toHaveBeenCalled();
  });

  it("updates project-level fields when provided", async () => {
    supabaseMock.setTable("chapters", { data: [] });
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          name: "Updated Name",
          subtitle: "New sub",
          chapters: [],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    expect(supabaseMock.getChain("projects").update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated Name",
        subtitle: "New sub",
      })
    );
  });

  // --- Keywords ---

  it("includes normalized keywords in chapter and article inserts", async () => {
    supabaseMock.setTable("chapters", { data: [] });
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    const chapChain = supabaseMock.getChain("chapters");
    chapChain.single = vi.fn(() => ({
      ...chapChain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: { id: "ch-new-1" }, error: null })
      ),
    }));

    await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [
            {
              title: "Getting Started",
              keywords: ["#FOO", "foo", "Bar"],
              articles: [
                {
                  title: "Installation",
                  content: "# Install",
                  keywords: ["a", "b"],
                },
              ],
            },
          ],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    expect(supabaseMock.getChain("chapters").insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["foo", "bar"] })
    );
    expect(supabaseMock.getChain("articles").insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["a", "b"] })
    );
  });

  it("includes keywords in chapter update when provided", async () => {
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    const chapChain = supabaseMock.getChain("chapters");
    const existingData = [{ id: "ch-existing", slug: "getting-started" }];
    let chapCallCount = 0;
    chapChain.then = vi.fn((r: (v: unknown) => void) => {
      chapCallCount++;
      if (chapCallCount === 1) {
        return r({ data: existingData, error: null });
      }
      return r({ data: null, error: null });
    });

    await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [
            {
              title: "Getting Started",
              slug: "getting-started",
              keywords: ["new", "tags"],
              articles: [],
            },
          ],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    expect(supabaseMock.getChain("chapters").update).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["new", "tags"] })
    );
  });

  it("omits keywords from chapter update when field is absent (preserves existing)", async () => {
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    const chapChain = supabaseMock.getChain("chapters");
    const existingData = [{ id: "ch-existing", slug: "getting-started" }];
    let chapCallCount = 0;
    chapChain.then = vi.fn((r: (v: unknown) => void) => {
      chapCallCount++;
      if (chapCallCount === 1) {
        return r({ data: existingData, error: null });
      }
      return r({ data: null, error: null });
    });

    await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [
            {
              title: "Getting Started",
              slug: "getting-started",
              articles: [],
            },
          ],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    const updateArg = supabaseMock.getChain("chapters").update.mock.calls[0]?.[0] ?? {};
    expect(updateArg).not.toHaveProperty("keywords");
  });

  it("returns 422 when a chapter has too many keywords", async () => {
    supabaseMock.setTable("chapters", { data: [] });
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    const tooMany = Array.from({ length: 21 }, (_, i) => `kw${i}`);
    const res = await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [
            {
              title: "Chapter One",
              keywords: tooMany,
              articles: [],
            },
          ],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/chapters\[0\]/);
  });

  // --- Chapter content (default-language) ---

  it("writes chapter content_json when content is provided", async () => {
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    const chapChain = supabaseMock.getChain("chapters");
    const existingData = [{ id: "ch-existing", slug: "getting-started" }];
    let chapCallCount = 0;
    chapChain.then = vi.fn((r: (v: unknown) => void) => {
      chapCallCount++;
      if (chapCallCount === 1) {
        return r({ data: existingData, error: null });
      }
      return r({ data: null, error: null });
    });

    await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [
            {
              title: "Getting Started",
              slug: "getting-started",
              content: "## Overview\n\nWelcome.",
              articles: [],
            },
          ],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    expect(supabaseMock.getChain("chapters").update).toHaveBeenCalledWith(
      expect.objectContaining({ content_json: { type: "doc", content: [] } })
    );
  });

  it("omits chapter content_json on update when content is absent (preserves existing)", async () => {
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    const chapChain = supabaseMock.getChain("chapters");
    const existingData = [{ id: "ch-existing", slug: "getting-started" }];
    let chapCallCount = 0;
    chapChain.then = vi.fn((r: (v: unknown) => void) => {
      chapCallCount++;
      if (chapCallCount === 1) {
        return r({ data: existingData, error: null });
      }
      return r({ data: null, error: null });
    });

    await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [
            { title: "Getting Started", slug: "getting-started", articles: [] },
          ],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    const updateArg =
      supabaseMock.getChain("chapters").update.mock.calls[0]?.[0] ?? {};
    expect(updateArg).not.toHaveProperty("content_json");
  });

  it("inserts a valid empty doc for a new chapter without content", async () => {
    supabaseMock.setTable("chapters", { data: [] });
    supabaseMock.setTable("articles", { data: [] });
    supabaseMock.setTable("projects", { data: null, error: null });

    const chapChain = supabaseMock.getChain("chapters");
    chapChain.single = vi.fn(() => ({
      ...chapChain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: { id: "ch-new-1" }, error: null })
      ),
    }));

    await PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body: {
          chapters: [{ title: "Getting Started", articles: [] }],
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );

    expect(supabaseMock.getChain("chapters").insert).toHaveBeenCalledWith(
      expect.objectContaining({ content_json: { type: "doc", content: [] } })
    );
  });

  // --- Moving articles between chapters ---

  function sequenced(
    chain: ReturnType<typeof supabaseMock.getChain>,
    first: { data: unknown; error: unknown },
    rest: { data: unknown; error: unknown } = { data: null, error: null }
  ) {
    let n = 0;
    chain.then = vi.fn((r: (v: unknown) => void) => r(n++ === 0 ? first : rest));
  }

  function put(body: unknown) {
    return PUT(
      makeRequest("http://localhost/api/v1/projects/docs/sync", {
        method: "PUT",
        body,
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
  }

  it("moves an article to a new chapter while deleting its old chapter (keeps the article)", async () => {
    supabaseMock.setTable("projects", { data: null, error: null });
    supabaseMock.setTable("chapters", { data: null });
    supabaseMock.setTable("articles", { data: null });

    const chapChain = supabaseMock.getChain("chapters");
    sequenced(chapChain, { data: [{ id: "ch-old", slug: "experten-nutzen" }], error: null });
    chapChain.single = vi.fn(() => ({
      ...chapChain,
      then: vi.fn((r: (v: unknown) => void) => r({ data: { id: "ch-new" }, error: null })),
    }));

    const artChain = supabaseMock.getChain("articles");
    sequenced(artChain, {
      data: [
        { id: "art-en", slug: "quellenbetrachter", language: "en", chapter_id: "ch-old" },
        { id: "art-de", slug: "quellenbetrachter", language: "de", chapter_id: "ch-old" },
      ],
      error: null,
    });

    const res = await put({
      chapters: [
        {
          slug: "fragen-stellen",
          title: "Fragen stellen",
          articles: [
            { slug: "quellenbetrachter", title: "Viewer", content: "x", language: "en" },
            { slug: "quellenbetrachter", title: "Betrachter", content: "x", language: "de" },
          ],
        },
      ],
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.articles).toEqual({ created: 0, updated: 2, deleted: 0 });
    expect(json.chapters).toEqual({ created: 1, updated: 0, deleted: 1 });
    expect(artChain.insert).not.toHaveBeenCalled();
    expect(artChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ chapter_id: "ch-new" })
    );
    // Only the chapter is deleted, never the moved articles.
    expect(artChain.delete).not.toHaveBeenCalled();
    expect(chapChain.delete).toHaveBeenCalledTimes(1);
  });

  it("prunes articles absent from the payload regardless of chapter", async () => {
    supabaseMock.setTable("projects", { data: null, error: null });
    supabaseMock.setTable("chapters", { data: null });
    supabaseMock.setTable("articles", { data: null });

    sequenced(supabaseMock.getChain("chapters"), {
      data: [
        { id: "ch-keep", slug: "keep" },
        { id: "ch-gone", slug: "gone" },
      ],
      error: null,
    });
    sequenced(supabaseMock.getChain("articles"), {
      data: [
        { id: "a1", slug: "stays", language: "en", chapter_id: "ch-keep" },
        { id: "a2", slug: "dropped", language: "en", chapter_id: "ch-keep" },
        { id: "a3", slug: "in-gone", language: "en", chapter_id: "ch-gone" },
        { id: "a4", slug: "orphan", language: "en", chapter_id: null },
      ],
      error: null,
    });

    const res = await put({
      chapters: [
        { slug: "keep", title: "Keep", articles: [{ slug: "stays", title: "S", content: "x" }] },
      ],
    });
    const json = await res.json();
    expect(json.articles).toEqual({ created: 0, updated: 1, deleted: 3 });
    expect(json.chapters.deleted).toBe(1);
  });

  it("returns 500 instead of reporting success when an article insert fails", async () => {
    supabaseMock.setTable("projects", { data: null, error: null });
    supabaseMock.setTable("chapters", { data: null });
    supabaseMock.setTable("articles", { data: null });

    sequenced(supabaseMock.getChain("chapters"), {
      data: [{ id: "ch-1", slug: "c" }],
      error: null,
    });
    sequenced(
      supabaseMock.getChain("articles"),
      { data: [], error: null },
      { data: null, error: { message: "duplicate key value violates unique constraint" } }
    );

    const res = await put({
      chapters: [{ slug: "c", title: "C", articles: [{ slug: "a", title: "A", content: "x" }] }],
    });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/creating article 'a' \(en\).*duplicate key/);
    // Nothing is pruned after a failed write.
    expect(supabaseMock.getChain("articles").delete).not.toHaveBeenCalled();
  });

  it("validates keywords of every chapter before writing anything", async () => {
    supabaseMock.setTable("projects", { data: null, error: null });
    supabaseMock.setTable("chapters", { data: [] });
    supabaseMock.setTable("articles", { data: [] });

    const tooMany = Array.from({ length: 22 }, (_, i) => `kw${i}`);
    const res = await put({
      name: "Renamed",
      chapters: [
        { slug: "ok", title: "OK", articles: [] },
        { slug: "bereiche-verwalten", title: "B", keywords: tooMany, articles: [] },
      ],
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/chapters\[1\] 'bereiche-verwalten': max 20 keywords/);
    expect(supabaseMock.getChain("projects").update).not.toHaveBeenCalled();
    expect(supabaseMock.getChain("chapters").insert).not.toHaveBeenCalled();
  });

  it("rejects the same article slug+language in two chapters", async () => {
    supabaseMock.setTable("chapters", { data: [] });
    supabaseMock.setTable("articles", { data: [] });

    const res = await put({
      chapters: [
        { slug: "a", title: "A", articles: [{ slug: "dup", title: "D", content: "x" }] },
        { slug: "b", title: "B", articles: [{ slug: "dup", title: "D", content: "x" }] },
      ],
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/'dup' \(en\).*also in chapter 'a'/);
    expect(supabaseMock.getChain("articles").insert).not.toHaveBeenCalled();
  });
});
