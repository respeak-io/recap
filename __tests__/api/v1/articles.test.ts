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

const { POST } = await import(
  "@/app/api/v1/projects/[slug]/articles/route"
);
const { PATCH, DELETE } = await import(
  "@/app/api/v1/projects/[slug]/articles/[articleSlug]/route"
);

describe("POST /api/v1/projects/[slug]/articles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("returns 422 when title is missing", async () => {
    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/docs/articles", {
        method: "POST",
        body: { content: "# Hello" },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when content is missing", async () => {
    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/docs/articles", {
        method: "POST",
        body: { title: "Test" },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(422);
  });

  it("creates an article with auto-generated slug", async () => {
    // Mock order lookup
    const artChain = supabaseMock.getChain("articles");
    let singleCallCount = 0;
    artChain.single = vi.fn(() => {
      singleCallCount++;
      if (singleCallCount === 1) {
        // Order lookup
        return {
          ...artChain,
          then: vi.fn((r: (v: unknown) => void) =>
            r({ data: { order: 2 }, error: null })
          ),
        };
      }
      // Insert result
      return {
        ...artChain,
        then: vi.fn((r: (v: unknown) => void) =>
          r({
            data: {
              id: "new-art",
              title: "Getting Started",
              slug: "getting-started",
              language: "en",
              status: "draft",
              order: 3,
            },
            error: null,
          })
        ),
      };
    });

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/docs/articles", {
        method: "POST",
        body: { title: "Getting Started", content: "# Welcome" },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.title).toBe("Getting Started");
  });

  it("returns 404 when chapter_slug not found", async () => {
    const chapChain = supabaseMock.getChain("chapters");
    chapChain.single = vi.fn(() => ({
      ...chapChain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: null, error: null })
      ),
    }));

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/docs/articles", {
        method: "POST",
        body: {
          title: "Test",
          content: "content",
          chapter_slug: "nonexistent",
        },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 on duplicate slug", async () => {
    const artChain = supabaseMock.getChain("articles");
    artChain.single = vi.fn(() => ({
      ...artChain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: null, error: { code: "23505", message: "duplicate" } })
      ),
    }));

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/docs/articles", {
        method: "POST",
        body: { title: "Duplicate", content: "content" },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/v1/projects/[slug]/articles/[articleSlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("returns 422 when no fields to update", async () => {
    const res = await PATCH(
      makeRequest(
        "http://localhost/api/v1/projects/docs/articles/intro",
        {
          method: "PATCH",
          body: {},
          headers: { Authorization: "Bearer rd_key" },
        }
      ),
      { params: Promise.resolve({ slug: "docs", articleSlug: "intro" }) }
    );
    expect(res.status).toBe(422);
  });

  it("updates article title and returns updated data", async () => {
    const chain = supabaseMock.getChain("articles");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({
          data: {
            id: "a1",
            title: "Updated",
            slug: "intro",
            language: "en",
            status: "published",
            order: 0,
          },
          error: null,
        })
      ),
    }));

    const res = await PATCH(
      makeRequest(
        "http://localhost/api/v1/projects/docs/articles/intro",
        {
          method: "PATCH",
          body: { title: "Updated" },
          headers: { Authorization: "Bearer rd_key" },
        }
      ),
      { params: Promise.resolve({ slug: "docs", articleSlug: "intro" }) }
    );
    const json = await res.json();
    expect(json.title).toBe("Updated");
  });

  it("returns 404 when article not found", async () => {
    const chain = supabaseMock.getChain("articles");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: null, error: null })
      ),
    }));

    const res = await PATCH(
      makeRequest(
        "http://localhost/api/v1/projects/docs/articles/missing",
        {
          method: "PATCH",
          body: { title: "Test" },
          headers: { Authorization: "Bearer rd_key" },
        }
      ),
      { params: Promise.resolve({ slug: "docs", articleSlug: "missing" }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/projects/[slug]/articles/[articleSlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("deletes article and returns 204", async () => {
    supabaseMock.setTable("articles", { data: null, error: null });

    const res = await DELETE(
      makeRequest(
        "http://localhost/api/v1/projects/docs/articles/old-article",
        {
          method: "DELETE",
          headers: { Authorization: "Bearer rd_key" },
        }
      ),
      {
        params: Promise.resolve({ slug: "docs", articleSlug: "old-article" }),
      }
    );
    expect(res.status).toBe(204);
  });

  it("filters by language when lang param provided", async () => {
    supabaseMock.setTable("articles", { data: null, error: null });

    await DELETE(
      makeRequest(
        "http://localhost/api/v1/projects/docs/articles/intro?lang=de",
        {
          method: "DELETE",
          headers: { Authorization: "Bearer rd_key" },
        }
      ),
      { params: Promise.resolve({ slug: "docs", articleSlug: "intro" }) }
    );
    const eqCalls = supabaseMock.getChain("articles").eq.mock.calls;
    expect(
      eqCalls.some((c: unknown[]) => c[0] === "language" && c[1] === "de")
    ).toBe(true);
  });
});
