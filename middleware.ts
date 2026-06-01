import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/middleware";
import {
  LOCALE_COOKIE,
  firstSegment,
  isDocsPath,
  isLocale,
  resolveLocale,
} from "@/lib/docs-locale";

// Cap the bare-URL locale lookup so a slow/unreachable database degrades to the
// supported-set fallback instead of stalling the redirect (and first paint).
const LOCALE_QUERY_TIMEOUT_MS = 400;

/**
 * Read the locales a public project actually publishes, so a bare-URL visitor is
 * resolved to a language that has content (never an empty English fallback for a
 * German-only project). Best-effort: a timeout, error, or unknown project yields
 * `null`, and resolution falls back to the full supported set (the page-level
 * availability guard then corrects the locale if needed).
 */
async function fetchProjectLocales(
  request: NextRequest,
  projectSlug: string,
): Promise<string[] | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      },
    );
    const data = await Promise.race([
      supabase
        .from("projects")
        .select("articles(language, status)")
        .eq("slug", projectSlug)
        .eq("is_public", true)
        .single()
        .then((r) => r.data),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), LOCALE_QUERY_TIMEOUT_MS),
      ),
    ]);

    const articles = (data?.articles ?? []) as {
      language: string;
      status: string;
    }[];
    const locales = [
      ...new Set(
        articles
          .filter((a) => a.status === "published")
          .map((a) => a.language),
      ),
    ].filter(isLocale);
    return locales.length > 0 ? locales : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Non-docs paths (dashboard, auth, api, landing, top-level files): session only.
  if (!isDocsPath(pathname)) {
    return updateSession(request);
  }

  const seg = firstSegment(pathname);

  // Already locale-prefixed: forward the locale to the app and persist it.
  if (isLocale(seg)) {
    return updateSession(request, { locale: seg });
  }

  // Bare docs URL (search result, bookmark, shared link, legacy `?lang=`): resolve
  // the reader's language and redirect to the canonical `/<locale>/…` URL.
  const explicit = request.nextUrl.searchParams.get("lang");
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const acceptLanguage = request.headers.get("accept-language");
  const available = await fetchProjectLocales(request, seg);

  const locale = resolveLocale({ explicit, cookie, acceptLanguage, available });

  const dest = request.nextUrl.clone();
  dest.pathname = `/${locale}${pathname}`;
  dest.searchParams.delete("lang");

  const response = NextResponse.redirect(dest, 307);
  // Content is language-negotiated, so caches must key on the negotiation inputs.
  response.headers.set("Vary", "Accept-Language, Cookie");
  // Don't persist the locale here: the resolution may be a best-effort fallback
  // (e.g. the project-locale lookup timed out). The locale-prefixed follow-up
  // request — and the page-level availability guard — persist the authoritative
  // locale via updateSession, so a transient miss never poisons the cookie.
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
