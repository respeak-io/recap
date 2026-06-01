import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/lib/docs-locale";

interface UpdateSessionOptions {
  /**
   * Resolved docs locale for this request. When set, it is forwarded to the app
   * as the `x-recap-locale` request header (so the root layout can emit the
   * correct `<html lang>`) and persisted in the {@link LOCALE_COOKIE} cookie.
   */
  locale?: string;
}

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function updateSession(
  request: NextRequest,
  options: UpdateSessionOptions = {},
) {
  const requestHeaders = new Headers(request.headers);
  if (options.locale) requestHeaders.set("x-recap-locale", options.locale);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  // Persist the resolved locale so a later bare-URL visit (search result,
  // bookmark, shared link) remembers the reader's language. Only write when it
  // changed, to avoid a Set-Cookie on every docs response.
  if (options.locale && request.cookies.get(LOCALE_COOKIE)?.value !== options.locale) {
    supabaseResponse.cookies.set(LOCALE_COOKIE, options.locale, {
      path: "/",
      maxAge: ONE_YEAR,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }

  return supabaseResponse;
}
