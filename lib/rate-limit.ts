/**
 * In-memory fixed-window rate limiter for public endpoints.
 *
 * Recap runs as a single Next.js process (one Docker container), so a module
 * level Map is shared by all requests. Counters reset when the process restarts,
 * which is acceptable for abuse protection; the hard cost ceiling for AI calls is
 * the persisted daily budget in `lib/ai/budget.ts`.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
const MAX_TRACKED_KEYS = 50_000;

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const RATE_LIMITS = {
  /** AI answers cost money: a person types a handful of questions per minute at most. */
  searchAnswerPerMinute: { limit: 10, windowMs: 60_000 },
  searchAnswerPerDay: { limit: 200, windowMs: 24 * 60 * 60_000 },
  /** Search-as-you-type fires roughly one request per pause in typing. */
  searchPerMinute: { limit: 60, windowMs: 60_000 },
  analyticsPerMinute: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimit>;

/**
 * Drop expired windows; if the map is still over the cap (day-long windows stay
 * live for 24 h), drop the oldest entries so the map stays bounded and the scan
 * does not repeat on every following request.
 */
function evictExpired(now: number) {
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
  const target = Math.floor(MAX_TRACKED_KEYS * 0.9);
  for (const key of windows.keys()) {
    if (windows.size <= target) break;
    windows.delete(key);
  }
}

/**
 * Count one request for `key` against `rule`.
 * @returns `ok: false` with seconds until the window resets when over the limit.
 */
export function checkRateLimit(
  key: string,
  rule: RateLimit,
  now: number = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  if (windows.size > MAX_TRACKED_KEYS) evictExpired(now);

  const id = `${key}:${rule.windowMs}`;
  const w = windows.get(id);
  if (!w || w.resetAt <= now) {
    windows.set(id, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true };
  }
  if (w.count >= rule.limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((w.resetAt - now) / 1000) };
  }
  w.count += 1;
  return { ok: true };
}

/** Check several rules for one key; all must pass. */
export function checkRateLimits(
  key: string,
  rules: readonly RateLimit[],
  now: number = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  for (const rule of rules) {
    const result = checkRateLimit(key, rule, now);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/**
 * Client IP as seen by the reverse proxy. Traefik sets `X-Real-Ip` to the
 * connecting address and the app port is not reachable without it; the last
 * `X-Forwarded-For` hop is the fallback (the proxy appends it).
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || "unknown";
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(retryAfterSeconds: number, body: unknown = { error: "Too many requests" }) {
  return Response.json(body, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

/** Test helper: forget all counters. */
export function resetRateLimits() {
  windows.clear();
}
