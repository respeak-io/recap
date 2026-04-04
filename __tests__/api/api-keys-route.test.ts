import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase, makeRequest } from "../helpers/mock-supabase";

const supabaseMock = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(supabaseMock.client),
}));
vi.mock("@/lib/queries/projects", () => ({
  getUserOrg: vi.fn().mockResolvedValue("org-123"),
}));
vi.mock("@/lib/api-key-auth", () => ({
  generateApiKey: vi.fn().mockReturnValue({
    key: "rd_testkey12345",
    hash: "abc123hash",
    prefix: "rd_testke",
  }),
}));

const { GET, POST } = await import("@/app/api/api-keys/route");
const { PATCH } = await import("@/app/api/api-keys/[id]/route");

describe("GET /api/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns list of api keys", async () => {
    const mockKeys = [
      { id: "k1", name: "Test Key", key_prefix: "rd_test", created_at: "2024-01-01" },
    ];
    supabaseMock.setTable("api_keys", { data: mockKeys });

    const res = await GET();
    const json = await res.json();
    expect(json).toEqual(mockKeys);
    expect(supabaseMock.getChain("api_keys").eq).toHaveBeenCalledWith(
      "org_id",
      "org-123"
    );
  });

  it("returns 500 on db error", async () => {
    supabaseMock.setTable("api_keys", {
      error: { message: "db error" },
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    supabaseMock.client.auth.getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(
      makeRequest("http://localhost/api/api-keys", {
        method: "POST",
        body: { name: "My Key" },
      })
    );
    expect(res.status).toBe(401);

    // Restore for other tests
    supabaseMock.client.auth.getUser = vi
      .fn()
      .mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });
  });

  it("returns 422 when name is missing", async () => {
    supabaseMock.client.auth.getUser = vi
      .fn()
      .mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });

    const res = await POST(
      makeRequest("http://localhost/api/api-keys", {
        method: "POST",
        body: {},
      })
    );
    expect(res.status).toBe(422);
  });

  it("creates an api key and returns it with the raw key", async () => {
    supabaseMock.client.auth.getUser = vi
      .fn()
      .mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });

    const insertedData = {
      id: "k-new",
      name: "Production",
      key_prefix: "rd_testke",
      created_at: "2024-01-01",
    };
    const chain = supabaseMock.getChain("api_keys");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: insertedData, error: null })
      ),
    }));

    const res = await POST(
      makeRequest("http://localhost/api/api-keys", {
        method: "POST",
        body: { name: "Production" },
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.key).toBe("rd_testkey12345");
    expect(json.name).toBe("Production");
  });
});

describe("PATCH /api/api-keys/[id] (revoke)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes an api key", async () => {
    supabaseMock.setTable("api_keys", { data: null, error: null });
    const res = await PATCH(
      makeRequest("http://localhost/api/api-keys/k-1", {
        method: "PATCH",
        body: { revoked: true },
      }),
      { params: Promise.resolve({ id: "k-1" }) }
    );
    const json = await res.json();
    expect(json).toEqual({ success: true });
    expect(supabaseMock.getChain("api_keys").update).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_at: expect.any(String) })
    );
  });

  it("returns success even without revoked flag (no-op)", async () => {
    const res = await PATCH(
      makeRequest("http://localhost/api/api-keys/k-2", {
        method: "PATCH",
        body: {},
      }),
      { params: Promise.resolve({ id: "k-2" }) }
    );
    const json = await res.json();
    expect(json).toEqual({ success: true });
  });
});
