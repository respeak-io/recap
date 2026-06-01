import { LANGUAGES } from "@/lib/languages";

/**
 * Locale model for the public docs site.
 *
 * Reader language is **path-based**: every docs URL carries an explicit
 * `/<locale>/…` segment (e.g. `/de/experte/per-link-teilen`). This module holds
 * the pure logic for classifying paths, resolving the best locale for a reader,
 * and building locale-prefixed URLs. It has no Next.js / Supabase dependencies so
 * it can be unit-tested in isolation and run on the Edge middleware runtime.
 */

export const DEFAULT_LOCALE = "en";

/** Every supported locale code, derived from the shared label/flag map. */
export const LOCALE_CODES: readonly string[] = LANGUAGES.map((l) => l.code);

const LOCALE_SET = new Set<string>(LOCALE_CODES);

export function isLocale(code: string | null | undefined): code is string {
  return typeof code === "string" && LOCALE_SET.has(code);
}

/**
 * Root-level path segments owned by other route groups (dashboard, auth, api) or
 * Next internals. A first segment in this set — or any segment containing a `.`
 * (top-level files such as `sitemap.xml`, `robots.txt`, `favicon.ico`) — is never
 * treated as a docs project slug.
 *
 * NOTE: keep in sync with the static root routes in `app/(dashboard)`, `app/(auth)`
 * and `app/api`. Docs project slugs are arbitrary, so the only way to disambiguate
 * them from app routes at the root level is to blacklist the reserved segments.
 */
export const RESERVED_DOCS_SEGMENTS = new Set<string>([
  "api",
  "project",
  "dashboard",
  "login",
  "signup",
  "callback",
  "_next",
]);

export function firstSegment(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

/**
 * Project slugs that must be rejected at creation. Because docs URLs are
 * `/<locale>/<projectSlug>/…`, a project slug equal to a locale code (`de`, `en`, …)
 * is ambiguous with the locale segment, and a slug equal to a reserved app segment
 * (`project`, `dashboard`, …) collides with another route group. Either makes the
 * project's bare URL unreachable, so forbid both up front.
 */
export function isReservedDocsSlug(slug: string): boolean {
  return LOCALE_SET.has(slug) || RESERVED_DOCS_SEGMENTS.has(slug);
}

/**
 * True when `pathname` addresses the public docs site — i.e. a `/<projectSlug>/…`
 * (legacy/bare) or `/<locale>/<projectSlug>/…` path — as opposed to the dashboard,
 * auth pages, the API, the landing page, or a top-level file.
 */
export function isDocsPath(pathname: string): boolean {
  if (!pathname || pathname === "/") return false;
  const seg = firstSegment(pathname);
  if (!seg) return false;
  if (RESERVED_DOCS_SEGMENTS.has(seg)) return false;
  if (seg.includes(".")) return false;
  return true;
}

/**
 * Parse an `Accept-Language` header into base language codes ordered by quality
 * (highest first), de-duplicated. `de-DE;q=0.9` → `de`. Wildcards are dropped.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      const base = tag.trim().toLowerCase().split("-")[0];
      return { base, quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((x) => x.base && x.base !== "*")
    .sort((a, b) => b.quality - a.quality)
    .map((x) => x.base)
    .filter((base, i, arr) => arr.indexOf(base) === i);
}

/**
 * The default locale for a project given the locales it actually publishes:
 * English when available (the platform-wide default), otherwise the first
 * published locale. Falls back to {@link DEFAULT_LOCALE} when nothing is known.
 */
export function projectDefaultLocale(available?: readonly string[] | null): string {
  if (!available || available.length === 0) return DEFAULT_LOCALE;
  return available.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : available[0];
}

/**
 * Resolve the best locale for a reader.
 *
 * Precedence: explicit choice (e.g. a legacy `?lang=`) → persisted cookie →
 * `Accept-Language` → the project's default. Every candidate is constrained to the
 * project's published locales (`available`) when known, otherwise to the full set
 * of supported locales — so a reader is never sent to a locale with no content.
 */
export function resolveLocale(opts: {
  explicit?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
  available?: readonly string[] | null;
}): string {
  const pool =
    opts.available && opts.available.length > 0 ? opts.available : LOCALE_CODES;
  const inPool = (c: string | null | undefined): c is string =>
    !!c && pool.includes(c);

  if (inPool(opts.explicit)) return opts.explicit;
  if (inPool(opts.cookie)) return opts.cookie;
  for (const base of parseAcceptLanguage(opts.acceptLanguage)) {
    if (inPool(base)) return base;
  }
  return projectDefaultLocale(opts.available);
}

/** Prefix a docs path (`/experte/slug`, `experte/slug` or ``) with a locale segment. */
export function localizeDocsPath(locale: string, pathname: string): string {
  const clean = pathname.replace(/^\/+/, "");
  return clean ? `/${locale}/${clean}` : `/${locale}`;
}

/** Absolute origin of the public docs site, used for canonical / hreflang / sitemap URLs. */
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.respeak.io").replace(
    /\/+$/,
    "",
  );
}

/**
 * Build `canonical` + `hreflang` alternates for a docs page. Paths are returned
 * locale-prefixed and relative; Next resolves them against `metadataBase`. The
 * `x-default` alternate points at the project's default locale.
 */
export function buildAlternates(opts: {
  /** Path without any locale prefix, e.g. `/experte/per-link-teilen`. */
  pathWithoutLocale: string;
  /** Locales this page is available in (the project's, or this article's, published locales). */
  available: string[];
  /** The locale currently being rendered. */
  currentLocale: string;
}): { canonical: string; languages: Record<string, string> } {
  const languages: Record<string, string> = {};
  for (const loc of opts.available) {
    languages[loc] = localizeDocsPath(loc, opts.pathWithoutLocale);
  }
  languages["x-default"] = localizeDocsPath(
    projectDefaultLocale(opts.available),
    opts.pathWithoutLocale,
  );
  return {
    canonical: localizeDocsPath(opts.currentLocale, opts.pathWithoutLocale),
    languages,
  };
}

/** Name of the cookie that persists a reader's chosen/derived locale. */
export const LOCALE_COOKIE = "recap-lang";
