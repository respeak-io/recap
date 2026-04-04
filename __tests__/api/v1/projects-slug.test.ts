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
const { GET, PATCH } = await import("@/app/api/v1/projects/[slug]/route");

describe("GET /api/v1/projects/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns project with sorted chapters and articles", async () => {
    const project = {
      id: "p1",
      name: "Docs",
      slug: "docs",
      chapters: [
        {
          id: "ch2",
          order: 1,
          articles: [
            { id: "a2", order: 1 },
            { id: "a1", order: 0 },
          ],
        },
        { id: "ch1", order: 0, articles: [] },
      ],
    };
    const chain = supabaseMock.getChain("projects");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: project, error: null })
      ),
    }));

    const res = await GET(
      makeRequest("http://localhost/api/v1/projects/docs", {
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    const json = await res.json();
    // Chapters sorted by order
    expect(json.chapters[0].id).toBe("ch1");
    expect(json.chapters[1].id).toBe("ch2");
    // Articles within ch2 sorted
    expect(json.chapters[1].articles[0].id).toBe("a1");
  });

  it("returns 404 when project not found", async () => {
    const chain = supabaseMock.getChain("projects");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: null, error: null })
      ),
    }));

    const res = await GET(
      makeRequest("http://localhost/api/v1/projects/missing", {
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "missing" }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/projects/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiV1Helpers.resolveProject).mockResolvedValue({ id: "proj-1" });
  });

  it("updates project fields", async () => {
    supabaseMock.setTable("projects", { data: null, error: null });

    const res = await PATCH(
      makeRequest("http://localhost/api/v1/projects/docs", {
        method: "PATCH",
        body: { name: "Updated Docs", subtitle: "New subtitle" },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(supabaseMock.getChain("projects").update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated Docs",
        subtitle: "New subtitle",
      })
    );
  });

  it("returns 422 when no valid fields provided", async () => {
    const res = await PATCH(
      makeRequest("http://localhost/api/v1/projects/docs", {
        method: "PATCH",
        body: { invalid_field: "test" },
        headers: { Authorization: "Bearer rd_key" },
      }),
      { params: Promise.resolve({ slug: "docs" }) }
    );
    expect(res.status).toBe(422);
  });
});
