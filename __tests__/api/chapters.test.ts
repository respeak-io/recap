import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase, makeRequest } from "../helpers/mock-supabase";

const supabaseMock = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(supabaseMock.client),
}));

const { PATCH } = await import("@/app/api/chapters/[id]/route");

describe("PATCH /api/chapters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates chapter group and returns success", async () => {
    supabaseMock.setTable("chapters", { data: null, error: null });
    const res = await PATCH(
      makeRequest("http://localhost/api/chapters/ch-1", {
        method: "PATCH",
        body: { group: "Getting Started" },
      }),
      { params: Promise.resolve({ id: "ch-1" }) }
    );
    const json = await res.json();
    expect(json).toEqual({ success: true });
    expect(supabaseMock.getChain("chapters").update).toHaveBeenCalledWith({
      group: "Getting Started",
    });
    expect(supabaseMock.getChain("chapters").eq).toHaveBeenCalledWith(
      "id",
      "ch-1"
    );
  });

  it("returns 400 on update error", async () => {
    supabaseMock.setTable("chapters", {
      error: { message: "constraint violation" },
    });
    const res = await PATCH(
      makeRequest("http://localhost/api/chapters/ch-2", {
        method: "PATCH",
        body: { group: "Invalid" },
      }),
      { params: Promise.resolve({ id: "ch-2" }) }
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("constraint violation");
  });
});
