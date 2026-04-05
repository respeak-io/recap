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
  "@/app/api/v1/projects/[slug]/chapters/route"
);
const { GET, PATCH, DELETE } = await import(
  "@/app/api/v1/projects/[slug]/chapters/[chapterSlug]/route"
);

describe("POST /api/v1/projects/[slug]/chapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("returns 422 when title is missing", async () => {
    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/docs/chapters", {
        method: "POST",
        body: {},
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(422);
  });

  it("creates a chapter with auto-order", async () => {
    // Order lookup
    const chapChain = supabaseMock.getChain("chapters");
    let singleCount = 0;
    chapChain.single = vi.fn(() => {
      singleCount++;
      if (singleCount === 1) {
        return {
          ...chapChain,
          then: vi.fn((r: (v: unknown) => void) =>
            r({ data: { order: 1 }, error: null })
          ),
        };
      }
      return {
        ...chapChain,
        then: vi.fn((r: (v: unknown) => void) =>
          r({
            data: {
              id: "ch-new",
              title: "Setup",
              slug: "setup",
              order: 2,
            },
            error: null,
          })
        ),
      };
    });

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/docs/chapters", {
        method: "POST",
        body: { title: "Setup" },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.title).toBe("Setup");
  });

  it("returns 409 on duplicate slug", async () => {
    const chapChain = supabaseMock.getChain("chapters");
    chapChain.single = vi.fn(() => ({
      ...chapChain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: null, error: { code: "23505", message: "duplicate" } })
      ),
    }));

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/docs/chapters", {
        method: "POST",
        body: { title: "Duplicate" },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/projects/[slug]/chapters/[chapterSlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("returns chapter with sorted articles", async () => {
    const chapter = {
      id: "ch1",
      title: "Intro",
      slug: "intro",
      articles: [
        { id: "a2", order: 1 },
        { id: "a1", order: 0 },
      ],
    };
    const chain = supabaseMock.getChain("chapters");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: chapter, error: null })
      ),
    }));

    const res = await GET(
      makeRequest("http://localhost/api/v1/projects/docs/chapters/intro", {
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs", chapterSlug: "intro" }) }
    );
    const json = await res.json();
    expect(json.articles[0].id).toBe("a1");
    expect(json.articles[1].id).toBe("a2");
  });

  it("returns 404 when chapter not found", async () => {
    const chain = supabaseMock.getChain("chapters");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: null, error: { message: "not found" } })
      ),
    }));

    const res = await GET(
      makeRequest(
        "http://localhost/api/v1/projects/docs/chapters/missing",
        { headers: { Authorization: "Bearer rd_key" } }
      ),
      { params: Promise.resolve({ slug: "docs", chapterSlug: "missing" }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/projects/[slug]/chapters/[chapterSlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("returns 422 when no fields provided", async () => {
    const res = await PATCH(
      makeRequest(
        "http://localhost/api/v1/projects/docs/chapters/intro",
        {
          method: "PATCH",
          body: {},
          headers: { Authorization: "Bearer rd_key" },
        }
      ),
      { params: Promise.resolve({ slug: "docs", chapterSlug: "intro" }) }
    );
    expect(res.status).toBe(422);
  });

  it("updates chapter and returns data", async () => {
    const chain = supabaseMock.getChain("chapters");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({
          data: { id: "ch1", title: "Updated", slug: "intro" },
          error: null,
        })
      ),
    }));

    const res = await PATCH(
      makeRequest(
        "http://localhost/api/v1/projects/docs/chapters/intro",
        {
          method: "PATCH",
          body: { title: "Updated" },
          headers: { Authorization: "Bearer rd_key" },
        }
      ),
      { params: Promise.resolve({ slug: "docs", chapterSlug: "intro" }) }
    );
    const json = await res.json();
    expect(json.title).toBe("Updated");
  });
});

describe("DELETE /api/v1/projects/[slug]/chapters/[chapterSlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("deletes chapter and returns 204", async () => {
    supabaseMock.setTable("chapters", { data: null, error: null });

    const res = await DELETE(
      makeRequest(
        "http://localhost/api/v1/projects/docs/chapters/old-chapter",
        {
          method: "DELETE",
          headers: { Authorization: "Bearer rd_key" },
        }
      ),
      {
        params: Promise.resolve({
          slug: "docs",
          chapterSlug: "old-chapter",
        }),
      }
    );
    expect(res.status).toBe(204);
  });

  it("returns 500 on db error", async () => {
    supabaseMock.setTable("chapters", {
      error: { message: "fk violation" },
    });

    const res = await DELETE(
      makeRequest(
        "http://localhost/api/v1/projects/docs/chapters/ch-1",
        {
          method: "DELETE",
          headers: { Authorization: "Bearer rd_key" },
        }
      ),
      {
        params: Promise.resolve({ slug: "docs", chapterSlug: "ch-1" }),
      }
    );
    expect(res.status).toBe(500);
  });
});
