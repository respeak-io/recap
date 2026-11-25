import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { diff, push } from "../src/sync/index.js";
import type { SyncPayload } from "../src/sync/payload.js";
import { markdownToTiptapRaw } from "../src/markdown/markdown-to-tiptap.js";

// An in-memory v1 API that stores what `push` sends the way the server does, so
// every case starts from "just pushed" and changes exactly one thing.
interface StoredArticle { slug: string; language: string; title: string; order: number; content_json: unknown; content_text: string }
interface StoredChapter {
  slug: string; title: string; order: number; content_json: unknown;
  translations: Record<string, { title?: string; content_json?: unknown }>;
  articles: StoredArticle[];
}

let dir: string;
let chapters: StoredChapter[];
let failing: Set<string>;
const IMAGE = { id: "i1", filename: "a.png", url: "https://cdn.example/assets/a.png" };

function store(body: SyncPayload) {
  chapters = body.chapters.map((c) => ({
    slug: c.slug,
    title: c.title,
    order: c.order,
    content_json: c.content ? markdownToTiptapRaw(c.content).doc : { type: "doc", content: [] },
    translations: Object.fromEntries(
      Object.entries(c.translations).map(([lang, { content, ...rest }]) => [
        lang,
        { ...rest, ...(content ? { content_json: markdownToTiptapRaw(content).doc } : {}) },
      ]),
    ),
    articles: c.articles.map((a) => {
      const { doc, text } = markdownToTiptapRaw(a.content);
      return { slug: a.slug, language: a.language, title: a.title, order: a.order, content_json: doc, content_text: text };
    }),
  }));
}

const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const p = url.pathname.replace(/^\/api\/v1\/projects\/docs/, "");
  const method = init?.method ?? "GET";
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  if (failing.has(p)) return json({ error: "boom" }, 500);

  if (method === "PUT" && p === "/sync") {
    store(JSON.parse(String(init!.body)));
    return json({ chapters: { created: 0, updated: 0, deleted: 0 }, articles: { created: 0, updated: 0, deleted: 0 } });
  }
  if (p === "/media/images") return json({ images: [{ ...IMAGE, width: 1, height: 1 }] });
  if (p === "") {
    return json({
      name: "", subtitle: "", translations: null,
      chapters: chapters.map((c) => ({
        ...c,
        content_json: undefined,
        articles: c.articles.map((a) => ({ ...a, content_json: undefined, content_text: undefined })),
      })),
    });
  }
  const ch = p.match(/^\/chapters\/(.+)$/);
  if (ch) return json(chapters.find((c) => c.slug === ch[1]));
  const art = p.match(/^\/articles\/(.+)$/);
  if (art) {
    return json(
      chapters.flatMap((c) => c.articles).find((a) => a.slug === art[1] && a.language === url.searchParams.get("lang")),
    );
  }
  return json({ error: `unexpected ${method} ${p}` }, 500);
});

const write = (file: string, md: string) => writeFileSync(path.join(dir, file), md);
const opts = () => ({ docsDir: dir, url: "https://recap.test", apiKey: "k" });
const run = async () => (await diff(opts())).report;
const article = (slug: string, lang: string) =>
  chapters.flatMap((c) => c.articles).find((a) => a.slug === slug && a.language === lang)!;

beforeEach(async () => {
  failing = new Set();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  dir = mkdtempSync(path.join(os.tmpdir(), "recap-drift-"));
  for (const d of ["en", "de", "media"]) mkdirSync(path.join(dir, d));
  writeFileSync(path.join(dir, "media/a.png"), "x");
  for (const lang of ["en", "de"]) {
    write(`${lang}/_a.md`, `# A\n\nIntro ${lang}`);
    write(`${lang}/one.md`, "# One\n\nText with [two](two.md).\n\n```\nls\n```\n\n![pic](media/a.png)\n");
    write(`${lang}/two.md`, "# Two\n\nMore.\n");
    write(`${lang}/three.md`, "# Three\n\nLast.\n");
  }
  const art = (slug: string) => ({
    slug,
    en: { title: slug, file: `en/${slug}.md` },
    de: { title: slug, file: `de/${slug}.md` },
  });
  writeFileSync(
    path.join(dir, "sync.json"),
    JSON.stringify({
      project_slug: "docs",
      languages: ["en", "de"],
      chapters: [
        { slug: "a", title: "A", order: 0, content: { en: "en/_a.md", de: "de/_a.md" }, articles: [art("one"), art("two")] },
        { slug: "b", title: "B", order: 1, articles: [art("three")] },
      ],
    }),
  );
  await push(opts());
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe("diff after a push", () => {
  it("is in sync, images and cross-links included", async () => {
    const report = await run();
    expect(report.diffs).toEqual([]);
    expect(report.info).toContain("Content: 6 match, 0 differ");
  });

  it("reports a changed code-block language", async () => {
    write("de/one.md", "# One\n\nText with [two](two.md).\n\n```bash\nls\n```\n\n![pic](media/a.png)\n");
    const report = await run();
    expect(report.diffs).toEqual([
      "Article 'one' (de) formatting differs: codeBlock language: remote=none, local=\"bash\"  [de/one.md]",
    ]);
    expect(report.info).toContain("Content: 5 match, 1 differ");
    expect(report.contentDiffs).toEqual([]);
  });

  it("reports changed text once, as text", async () => {
    write("en/two.md", "# Two\n\n**Other.**\n");
    expect((await run()).diffs).toEqual(["Article 'two' (en) content differs  [en/two.md]"]);
  });

  it("reports chapters in a different order, also when positions collide", async () => {
    chapters[0].order = 1;
    chapters[1].order = 0;
    expect((await run()).diffs).toEqual(['Chapter order: remote=["b","a"], local=["a","b"]']);
    chapters[0].order = 0;
    expect((await run()).diffs).toEqual([
      'Chapter order: remote=["a","b"] (some share a position), local=["a","b"]',
    ]);
  });

  it("reports articles in a different order, per language", async () => {
    article("one", "de").order = 9;
    expect((await run()).diffs).toEqual([
      "Chapter 'a' article order (de): remote=[\"two\",\"one\"], local=[\"one\",\"two\"]",
    ]);
  });

  it("ignores gaps and offsets in the stored positions", async () => {
    for (const c of chapters) {
      c.order = c.order * 10 + 5;
      for (const a of c.articles) a.order = a.order * 3 + 7;
    }
    expect((await run()).diffs).toEqual([]);
  });

  it("reports changed chapter bodies in every language", async () => {
    write("en/_a.md", "# A\n\nNew intro");
    write("de/_a.md", "# A\n\n**Intro de**");
    const report = await run();
    expect(report.diffs).toEqual([
      "Chapter 'a' (en) body differs  [en/_a.md]",
      'Chapter \'a\' (de) body formatting differs: formatting of "Intro de": remote=none, local=bold  [de/_a.md]',
    ]);
    expect(report.contentDiffs).toMatchObject([{ slug: "a", lang: "en", local: "New intro", remote: "Intro en" }]);
  });

  it("reports a translated body that a push would drop, but not a default-language one", async () => {
    chapters[1].content_json = markdownToTiptapRaw("Kept").doc;
    chapters[1].translations = { de: { content_json: markdownToTiptapRaw("Weg").doc } };
    expect((await run()).diffs).toEqual([
      "Chapter 'b' (de) body — on remote but not in sync.json (push removes it)",
    ]);
  });

  it("does not invent drift when something can't be fetched", async () => {
    failing = new Set(["/media/images", "/chapters/a"]);
    const { report, warnings } = await diff(opts());
    expect(report.diffs).toEqual([]);
    expect(report.info).toContain("Chapter 'a' (en) — could not fetch body");
    expect(warnings.some((w) => w.includes("Could not fetch remote chapter 'a'"))).toBe(true);
  });
});
