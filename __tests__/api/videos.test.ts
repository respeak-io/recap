import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase, makeRequest } from "../helpers/mock-supabase";

const supabaseMock = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(supabaseMock.client),
}));

const { DELETE } = await import("@/app/api/videos/[id]/route");
const { POST: uploadUrlPOST } = await import(
  "@/app/api/videos/upload-url/route"
);

describe("DELETE /api/videos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes video storage and record", async () => {
    // First query: get video storage_path
    const selectChain = supabaseMock.getChain("videos");
    let singleCallCount = 0;
    selectChain.single = vi.fn(() => {
      singleCallCount++;
      if (singleCallCount === 1) {
        const data = { storage_path: "org/proj/vid.mp4" };
        return {
          ...selectChain,
          then: vi.fn((r: (v: unknown) => void) => r({ data, error: null })),
        };
      }
      return {
        ...selectChain,
        then: vi.fn((r: (v: unknown) => void) =>
          r({ data: null, error: null })
        ),
      };
    });

    const res = await DELETE(
      makeRequest("http://localhost/api/videos/vid-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "vid-1" }) }
    );
    const json = await res.json();
    expect(json).toEqual({ success: true });
    expect(supabaseMock.getBucket("videos").remove).toHaveBeenCalledWith([
      "org/proj/vid.mp4",
    ]);
  });

  it("returns 500 when delete fails", async () => {
    // Return no storage_path on first call, then error on delete
    const chain = supabaseMock.getChain("videos");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: null, error: null })
      ),
    }));
    // Override the delete to error
    chain._result = { data: null, error: { message: "delete failed" } };
    chain.then = vi.fn((r: (v: unknown) => void) =>
      r({ data: null, error: { message: "delete failed" } })
    );

    const res = await DELETE(
      makeRequest("http://localhost/api/videos/vid-2", { method: "DELETE" }),
      { params: Promise.resolve({ id: "vid-2" }) }
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /api/videos/upload-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when project not found", async () => {
    supabaseMock.setTable("projects", { data: null });
    const chain = supabaseMock.getChain("projects");
    chain.single = vi.fn(() => ({
      ...chain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: null, error: null })
      ),
    }));

    const res = await uploadUrlPOST(
      makeRequest("http://localhost/api/videos/upload-url", {
        method: "POST",
        body: { projectId: "missing" },
      })
    );
    expect(res.status).toBe(404);
  });

  it("creates video record and returns upload URL", async () => {
    // Setup projects to return a project
    const projChain = supabaseMock.getChain("projects");
    projChain.single = vi.fn(() => ({
      ...projChain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: { id: "p1", org_id: "org-1" }, error: null })
      ),
    }));

    // Setup videos to return inserted record
    const vidChain = supabaseMock.getChain("videos");
    vidChain.single = vi.fn(() => ({
      ...vidChain,
      then: vi.fn((r: (v: unknown) => void) =>
        r({ data: { id: "new-vid-id" }, error: null })
      ),
    }));

    const res = await uploadUrlPOST(
      makeRequest("http://localhost/api/videos/upload-url", {
        method: "POST",
        body: { projectId: "p1" },
      })
    );
    const json = await res.json();
    expect(json.videoId).toBe("new-vid-id");
    expect(json.uploadUrl).toBe("https://mock-url.com/upload");
    expect(json.storagePath).toContain("org-1");
  });
});
