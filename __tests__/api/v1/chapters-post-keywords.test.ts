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
  "@/app/api/v1/projects/[slug]/chapters/route"
);

describe("POST /v1/projects/:slug/chapters — keywords", () => {
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
            slug: "t",
            order: 0,
            keywords: ["bar"],
          },
          error: null,
        })
      ),
    }));

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/p1/chapters", {
        method: "POST",
        body: { title: "T", keywords: ["#Bar", "bar"] },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1" }) }
    );

    expect(res.status).toBe(201);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["bar"] })
    );
  });

  it("defaults keywords to [] when field is omitted", async () => {
    const chain = supabaseMock.getChain("chapters");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({
          data: {
            id: "c2",
            title: "T",
            slug: "t",
            order: 0,
            keywords: [],
          },
          error: null,
        })
      ),
    }));

    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/p1/chapters", {
        method: "POST",
        body: { title: "T" },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1" }) }
    );

    expect(res.status).toBe(201);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: [] })
    );
  });

  it("returns 422 when a keyword exceeds 40 characters", async () => {
    const res = await POST(
      makeRequest("http://localhost/api/v1/projects/p1/chapters", {
        method: "POST",
        body: { title: "T", keywords: ["a".repeat(41)] },
        headers: { Authorization: "Bearer rd_test" },
      }),
      { params: Promise.resolve({ slug: "p1" }) }
    );

    expect(res.status).toBe(422);
  });
});
