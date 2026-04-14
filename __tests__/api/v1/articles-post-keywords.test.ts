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
    text: "",
  }),
}));

const { POST } = await import(
  "@/app/api/v1/projects/[slug]/articles/route"
);

describe("POST /v1/projects/:slug/articles — keywords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("persists normalized keywords when provided", async () => {
    const chain = supabaseMock.getChain("articles");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({
          data: {
            id: "a1",
            title: "My Article",
            slug: "my-article",
            language: "en",
            status: "draft",
            order: 0,
            keywords: ["foo"],
          },
          error: null,
        })
      ),
    }));

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/p1/articles", {
        method: "POST",
        body: { title: "My Article", content: "# Hello", keywords: ["#FOO", "foo"] },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1" }) }
    );

    expect(res.status).toBe(201);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["foo"] })
    );
  });

  it("defaults keywords to [] when field is omitted", async () => {
    const chain = supabaseMock.getChain("articles");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({
          data: {
            id: "a2",
            title: "No Keywords",
            slug: "no-keywords",
            language: "en",
            status: "draft",
            order: 0,
            keywords: [],
          },
          error: null,
        })
      ),
    }));

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/p1/articles", {
        method: "POST",
        body: { title: "No Keywords", content: "# Hello" },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1" }) }
    );

    expect(res.status).toBe(201);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: [] })
    );
  });

  it("returns 422 when more than 20 keywords are sent", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `kw${i}`);

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/p1/articles", {
        method: "POST",
        body: { title: "My Article", content: "# Hello", keywords: tooMany },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1" }) }
    );

    expect(res.status).toBe(422);
  });
});
