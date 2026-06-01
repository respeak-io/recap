import { describe, it, expect } from "vitest";
import {
  isLocale,
  isDocsPath,
  firstSegment,
  parseAcceptLanguage,
  projectDefaultLocale,
  resolveLocale,
  localizeDocsPath,
  buildAlternates,
  getSiteUrl,
  isReservedDocsSlug,
  DEFAULT_LOCALE,
} from "@/lib/docs-locale";

describe("isLocale", () => {
  it("accepts supported codes and rejects everything else", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    // A project slug that looks like a path must not be treated as a locale.
    expect(isLocale("experte")).toBe(false);
  });
});

describe("firstSegment", () => {
  it("returns the first non-empty path segment", () => {
    expect(firstSegment("/de/experte/slug")).toBe("de");
    expect(firstSegment("experte")).toBe("experte");
    expect(firstSegment("/")).toBe("");
    expect(firstSegment("")).toBe("");
  });
});

describe("isDocsPath", () => {
  it("treats project / locale paths as docs", () => {
    expect(isDocsPath("/experte")).toBe(true);
    expect(isDocsPath("/experte/per-link-teilen")).toBe(true);
    expect(isDocsPath("/de/experte/per-link-teilen")).toBe(true);
    expect(isDocsPath("/experte/llms.txt")).toBe(true); // dotted *second* segment is fine
  });

  it("excludes the landing page, reserved routes, api and top-level files", () => {
    expect(isDocsPath("/")).toBe(false);
    expect(isDocsPath("")).toBe(false);
    expect(isDocsPath("/login")).toBe(false);
    expect(isDocsPath("/signup")).toBe(false);
    expect(isDocsPath("/callback")).toBe(false);
    expect(isDocsPath("/dashboard")).toBe(false);
    expect(isDocsPath("/project/abc")).toBe(false);
    expect(isDocsPath("/api/search")).toBe(false);
    expect(isDocsPath("/_next/data")).toBe(false);
    expect(isDocsPath("/sitemap.xml")).toBe(false);
    expect(isDocsPath("/robots.txt")).toBe(false);
    expect(isDocsPath("/favicon.ico")).toBe(false);
  });
});

describe("parseAcceptLanguage", () => {
  it("orders by quality and reduces to base codes", () => {
    expect(parseAcceptLanguage("de-DE,de;q=0.9,en;q=0.8")).toEqual(["de", "en"]);
    expect(parseAcceptLanguage("en-US,en;q=0.5")).toEqual(["en"]);
    expect(parseAcceptLanguage("fr;q=0.2,de;q=0.9")).toEqual(["de", "fr"]);
  });

  it("handles empty / wildcard / missing headers", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
    expect(parseAcceptLanguage("*")).toEqual([]);
  });
});

describe("projectDefaultLocale", () => {
  it("prefers English when published, else the first available locale", () => {
    expect(projectDefaultLocale(["de", "en"])).toBe("en");
    expect(projectDefaultLocale(["de", "fr"])).toBe("de");
    expect(projectDefaultLocale([])).toBe(DEFAULT_LOCALE);
    expect(projectDefaultLocale(null)).toBe(DEFAULT_LOCALE);
  });
});

describe("resolveLocale", () => {
  it("honors an explicit choice first when it is available", () => {
    expect(
      resolveLocale({ explicit: "de", cookie: "en", available: ["en", "de"] }),
    ).toBe("de");
  });

  it("falls back from an unavailable explicit choice to the cookie", () => {
    expect(
      resolveLocale({ explicit: "fr", cookie: "de", available: ["en", "de"] }),
    ).toBe("de");
  });

  it("uses the persisted cookie before Accept-Language", () => {
    expect(
      resolveLocale({
        cookie: "de",
        acceptLanguage: "en-US,en;q=0.9",
        available: ["en", "de"],
      }),
    ).toBe("de");
  });

  it("uses Accept-Language when there is no cookie", () => {
    expect(
      resolveLocale({
        acceptLanguage: "de-DE,de;q=0.9,en;q=0.8",
        available: ["en", "de"],
      }),
    ).toBe("de");
  });

  it("constrains every candidate to the project's published locales", () => {
    // A German-primary project with no English content: a cold visitor with no
    // signal must land on German, not the platform default English.
    expect(resolveLocale({ available: ["de"] })).toBe("de");
    // Cookie/Accept-Language pointing at an unpublished locale is ignored.
    expect(
      resolveLocale({
        cookie: "en",
        acceptLanguage: "en",
        available: ["de"],
      }),
    ).toBe("de");
  });

  it("falls back to the full supported set when availability is unknown", () => {
    expect(resolveLocale({ acceptLanguage: "ja" })).toBe("ja");
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
  });
});

describe("localizeDocsPath", () => {
  it("prefixes a locale segment, tolerating leading slashes", () => {
    expect(localizeDocsPath("de", "/experte/slug")).toBe("/de/experte/slug");
    expect(localizeDocsPath("de", "experte/slug")).toBe("/de/experte/slug");
    expect(localizeDocsPath("de", "")).toBe("/de");
  });
});

describe("buildAlternates", () => {
  it("emits canonical + per-language + x-default alternates", () => {
    const alts = buildAlternates({
      pathWithoutLocale: "/experte/per-link-teilen",
      available: ["en", "de"],
      currentLocale: "de",
    });
    expect(alts.canonical).toBe("/de/experte/per-link-teilen");
    expect(alts.languages.en).toBe("/en/experte/per-link-teilen");
    expect(alts.languages.de).toBe("/de/experte/per-link-teilen");
    expect(alts.languages["x-default"]).toBe("/en/experte/per-link-teilen");
  });

  it("points x-default at the first locale when English is absent", () => {
    const alts = buildAlternates({
      pathWithoutLocale: "/experte",
      available: ["de", "fr"],
      currentLocale: "de",
    });
    expect(alts.languages["x-default"]).toBe("/de/experte");
  });
});

describe("isReservedDocsSlug", () => {
  it("rejects locale codes and reserved app segments", () => {
    expect(isReservedDocsSlug("de")).toBe(true);
    expect(isReservedDocsSlug("en")).toBe(true);
    expect(isReservedDocsSlug("ja")).toBe(true);
    expect(isReservedDocsSlug("project")).toBe(true);
    expect(isReservedDocsSlug("dashboard")).toBe(true);
    expect(isReservedDocsSlug("api")).toBe(true);
  });

  it("allows ordinary project slugs", () => {
    expect(isReservedDocsSlug("experte")).toBe(false);
    expect(isReservedDocsSlug("my-product")).toBe(false);
    expect(isReservedDocsSlug("docs")).toBe(false);
  });
});

describe("getSiteUrl", () => {
  it("returns an origin without a trailing slash", () => {
    expect(getSiteUrl()).not.toMatch(/\/$/);
    expect(getSiteUrl()).toMatch(/^https?:\/\//);
  });
});
