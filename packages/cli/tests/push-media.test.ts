import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { push } from "../src/sync/index.js";

// A tiny fake of the v1 API: enough for push() to list/upload/delete images and
// sync. Records every call so tests can assert what was (not) touched.
interface Call {
  method: string;
  path: string;
  body?: unknown;
}

const REF_URL = "https://cdn.example/assets/ref.png";

function fakeApi(remoteImages: { id: string; filename: string; url: string }[]) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const p = url.pathname.replace(/^\/api\/v1\/projects\/docs/, "");
    const method = init?.method ?? "GET";
    let body: unknown;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    calls.push({ method, path: p, body });

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    if (method === "GET" && p === "/media/images") {
      return json({
        images: remoteImages.map((img) => ({ ...img, alt_text: null, width: 10, height: 10, created_at: "" })),
      });
    }
    if (method === "POST" && p === "/media/images") {
      return json({ imageId: "new-id", url: "https://cdn.example/assets/new.png", filename: "new.png" }, 201);
    }
    if (method === "PATCH" && p.startsWith("/media/images/")) return json({});
    if (method === "PUT" && p === "/sync") {
      return json({
        chapters: { created: 0, updated: 1, deleted: 0 },
        articles: { created: 0, updated: 1, deleted: 0 },
      });
    }
    if (method === "POST" && p === "/media/images/batch-delete") {
      return json({ deleted: (body as { ids: string[] }).ids, errors: [] });
    }
    return json({ error: `unexpected ${method} ${p}` }, 500);
  });
  return { calls, fetchMock };
}

let dir: string;

function writeDocs(opts: { media?: string[]; keywords?: number } = {}) {
  dir = mkdtempSync(path.join(os.tmpdir(), "recap-push-media-"));
  mkdirSync(path.join(dir, "en"), { recursive: true });
  // The article still embeds ref.png by absolute URL, so cleanup must keep it.
  writeFileSync(path.join(dir, "en/art.md"), `# Art\n\nText.\n\n![ref](${REF_URL})\n`);
  if (opts.media) {
    mkdirSync(path.join(dir, "media"));
    for (const f of opts.media) writeFileSync(path.join(dir, "media", f), "not-really-a-png");
  }
  writeFileSync(
    path.join(dir, "sync.json"),
    JSON.stringify({
      project_slug: "docs",
      languages: ["en"],
      chapters: [
        {
          slug: "c",
          title: "C",
          ...(opts.keywords ? { keywords: Array.from({ length: opts.keywords }, (_, i) => `k${i}`) } : {}),
          articles: [{ slug: "art", en: { title: "Art", file: "en/art.md" } }],
        },
      ],
    }),
  );
}

const REMOTE = [
  { id: "id-keep", filename: "keep.png", url: "https://cdn.example/assets/keep.png" },
  { id: "id-old", filename: "old.png", url: "https://cdn.example/assets/old.png" },
  { id: "id-ref", filename: "ref.png", url: REF_URL },
];

describe("push media cleanup", () => {
  let api: ReturnType<typeof fakeApi>;

  beforeEach(() => {
    api = fakeApi(REMOTE);
    vi.stubGlobal("fetch", api.fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (extra: { prune?: boolean; only?: string[] } = {}) =>
    push({ docsDir: dir, url: "https://recap.test", apiKey: "k", ...extra });

  it("deletes remote images no longer in media/ after a successful full push", async () => {
    writeDocs({ media: ["keep.png"] });
    const { media, warnings } = await run();

    const del = api.calls.filter((c) => c.path === "/media/images/batch-delete");
    expect(del).toHaveLength(1);
    expect(del[0].body).toEqual({ ids: ["id-old"] });
    expect(media).toEqual({ uploaded: 0, reused: 1, deleted: 1 });
    // ref.png is not in media/ but the content still points at it.
    expect(warnings.some((w) => w.includes("Kept remote image 'ref.png'"))).toBe(true);
    // Cleanup happens only after the sync went through.
    const order = api.calls.map((c) => c.path);
    expect(order.indexOf("/sync")).toBeLessThan(order.indexOf("/media/images/batch-delete"));
  });

  it("deletes nothing on an additive push (--no-prune)", async () => {
    writeDocs({ media: ["keep.png"] });
    const { media } = await run({ prune: false });
    expect(api.calls.some((c) => c.path === "/media/images/batch-delete")).toBe(false);
    expect(media.deleted).toBe(0);
  });

  it("deletes nothing on a scoped push (--only)", async () => {
    writeDocs({ media: ["keep.png"] });
    await run({ only: ["c"] });
    expect(api.calls.some((c) => c.path === "/media/images/batch-delete")).toBe(false);
  });

  it("leaves remote media alone when the docs folder has no media/ dir", async () => {
    writeDocs();
    const { media } = await run();
    expect(api.calls.some((c) => c.path.startsWith("/media/images"))).toBe(false);
    expect(media.deleted).toBe(0);
  });

  it("does not run cleanup when the sync fails", async () => {
    writeDocs({ media: ["keep.png"] });
    const base = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/sync")) {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      return base(input, init);
    });
    await expect(run()).rejects.toThrow(/API 500 on PUT/);
    expect(api.calls.some((c) => c.path === "/media/images/batch-delete")).toBe(false);
  });

  it("fails on a keyword limit before uploading any media", async () => {
    writeDocs({ media: ["keep.png", "brand-new.png"], keywords: 23 });
    await expect(run()).rejects.toThrow(/Chapter 'c' keywords: 23 keywords, max 20/);
    expect(api.calls).toEqual([]);
  });
});
