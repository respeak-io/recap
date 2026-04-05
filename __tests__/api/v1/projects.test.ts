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

const { GET } = await import("@/app/api/v1/projects/route");

describe("GET /api/v1/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when API key is invalid", async () => {
    const { validateApiKey } = await import("@/lib/api-key-auth");
    (validateApiKey as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      Response.json({ error: "Invalid API key" }, { status: 401 })
    );

    const res = await GET(
      makeRequest("http://localhost/api/v1/projects", {
        headers: { Authorization: "Bearer bad_key" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("lists projects for the org", async () => {
    const projects = [
      { id: "p1", name: "Docs", slug: "docs", is_public: true },
    ];
    supabaseMock.setTable("projects", { data: projects });

    const res = await GET(
      makeRequest("http://localhost/api/v1/projects", {
        headers: { Authorization: "Bearer rd_validkey" },
      })
    );
    const json = await res.json();
    expect(json).toEqual(projects);
    expect(supabaseMock.getChain("projects").eq).toHaveBeenCalledWith(
      "org_id",
      "org-1"
    );
  });

  it("returns 500 on db error", async () => {
    supabaseMock.setTable("projects", {
      error: { message: "db error" },
    });
    const res = await GET(
      makeRequest("http://localhost/api/v1/projects", {
        headers: { Authorization: "Bearer rd_validkey" },
      })
    );
    expect(res.status).toBe(500);
  });
});
