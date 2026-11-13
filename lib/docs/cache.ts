import { revalidateTag } from "next/cache";

/** Cache tag shared by every cached public-docs query (see `lib/docs/data.ts`). */
export const DOCS_CACHE_TAG = "docs";

/**
 * Safety net: cached public-docs data is refetched at most this many seconds
 * after it was cached, even if a write path forgot to call {@link revalidateDocs}
 * (e.g. the background video pipeline or a direct database edit).
 */
export const DOCS_REVALIDATE_SECONDS = 300;

/**
 * Expire all cached public-docs data immediately. Call after any write that can
 * change what the public docs show (articles, chapters, project details/theme,
 * publish state, sync).
 *
 * Never throws: outside a Next.js request context (unit tests, scripts)
 * `revalidateTag` raises an invariant error, and a failed cache purge must never
 * fail the write itself. The time-based revalidation above is the fallback.
 */
export function revalidateDocs(): void {
  try {
    revalidateTag(DOCS_CACHE_TAG, { expire: 0 });
  } catch {
    // No request context (tests/scripts): nothing to purge.
  }
}

/**
 * Wrap a route handler that writes docs content: after a successful response
 * (status < 400) the public-docs cache is purged. Failed requests leave it alone.
 *
 * @example
 *   async function handlePatch(req: Request, ctx: Ctx) { ... }
 *   export const PATCH = withDocsRevalidation(handlePatch);
 */
export function withDocsRevalidation<A extends unknown[], R extends Response>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const response = await handler(...args);
    if (response.status < 400) revalidateDocs();
    return response;
  };
}
