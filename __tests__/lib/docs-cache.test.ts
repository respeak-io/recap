import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const { revalidateTag } = await import("next/cache");
const { withDocsRevalidation, revalidateDocs, DOCS_CACHE_TAG } = await import("@/lib/docs/cache");

describe("docs cache invalidation", () => {
  beforeEach(() => {
    vi.mocked(revalidateTag).mockReset();
  });

  it("purges the docs tag immediately", () => {
    revalidateDocs();
    expect(revalidateTag).toHaveBeenCalledWith(DOCS_CACHE_TAG, { expire: 0 });
  });

  it("never throws when revalidateTag fails (no request context)", () => {
    vi.mocked(revalidateTag).mockImplementation(() => {
      throw new Error("Invariant: static generation store missing");
    });
    expect(() => revalidateDocs()).not.toThrow();
  });

  it("purges after a successful handler response and passes args through", async () => {
    const handler = vi.fn(async (_req: Request, ctx: { id: string }) =>
      Response.json({ id: ctx.id }, { status: 200 }),
    );
    const wrapped = withDocsRevalidation(handler);
    const req = new Request("http://test/x", { method: "PATCH" });

    const res = await wrapped(req, { id: "a1" });

    expect(handler).toHaveBeenCalledWith(req, { id: "a1" });
    expect(await res.json()).toEqual({ id: "a1" });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("does not purge when the handler fails", async () => {
    const wrapped = withDocsRevalidation(async () =>
      Response.json({ error: "nope" }, { status: 400 }),
    );
    await wrapped();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
