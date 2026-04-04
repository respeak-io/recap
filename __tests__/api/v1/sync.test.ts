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
});
