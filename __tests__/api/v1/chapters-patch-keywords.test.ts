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

const { PATCH } = await import(
  "@/app/api/v1/projects/[slug]/chapters/[chapterSlug]/route"
);

describe("PATCH /v1/projects/:slug/chapters/:chapterSlug — keywords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("persists normalized keywords when provided", async () => {
    const chain = supabaseMock.getChain("chapters");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({
          data: {
            id: "c1",
            title: "T",
            slug: "c1",
            keywords: ["foo", "bar"],
          },
          error: null,
        })
      ),
    }));

    const res = await PATCH(
      makeRequest("http://localhost/api/v1/projects/p1/chapters/c1", {
        method: "PATCH",
        body: { keywords: ["#Foo", "foo", "Bar"] },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }) }
    );

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["foo", "bar"] })
    );
  });

  it("clears keywords when empty array is provided", async () => {
    const chain = supabaseMock.getChain("chapters");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({
          data: {
            id: "c1",
            title: "T",
            slug: "c1",
            keywords: [],
          },
          error: null,
        })
      ),
    }));

    await PATCH(
      makeRequest("http://localhost/api/v1/projects/p1/chapters/c1", {
        method: "PATCH",
        body: { keywords: [] },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }) }
    );

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: [] })
    );
  });

  it("leaves keywords untouched when field is omitted", async () => {
    const chain = supabaseMock.getChain("chapters");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({
          data: {
            id: "c1",
            title: "T",
            slug: "c1",
            description: "x",
            keywords: ["existing"],
          },
          error: null,
        })
      ),
    }));

    await PATCH(
      makeRequest("http://localhost/api/v1/projects/p1/chapters/c1", {
        method: "PATCH",
        body: { description: "x" },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }) }
    );

    const call = chain.update.mock.calls[0]?.[0] ?? {};
    expect(call).not.toHaveProperty("keywords");
  });

  it("returns 422 when more than 20 keywords are sent", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `kw${i}`);
    const res = await PATCH(
      makeRequest("http://localhost/api/v1/projects/p1/chapters/c1", {
        method: "PATCH",
        body: { keywords: tooMany },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }) }
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when a keyword exceeds 40 characters", async () => {
    const res = await PATCH(
      makeRequest("http://localhost/api/v1/projects/p1/chapters/c1", {
        method: "PATCH",
        body: { keywords: ["ok", "a".repeat(41)] },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1", chapterSlug: "c1" }) }
    );
    expect(res.status).toBe(422);
  });
});
