import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, checkRateLimits, clientIp, resetRateLimits } from "@/lib/rate-limit";

describe("rate limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit per window, then blocks with retry-after", () => {
    const rule = { limit: 2, windowMs: 60_000 };
    expect(checkRateLimit("k", rule, 0).ok).toBe(true);
    expect(checkRateLimit("k", rule, 1).ok).toBe(true);
    const blocked = checkRateLimit("k", rule, 2);
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it("resets after the window and keeps keys separate", () => {
    const rule = { limit: 1, windowMs: 1_000 };
    expect(checkRateLimit("a", rule, 0).ok).toBe(true);
    expect(checkRateLimit("b", rule, 0).ok).toBe(true);
    expect(checkRateLimit("a", rule, 500).ok).toBe(false);
    expect(checkRateLimit("a", rule, 1_000).ok).toBe(true);
  });

  it("requires every rule to pass", () => {
    const perMinute = { limit: 10, windowMs: 60_000 };
    const perDay = { limit: 2, windowMs: 86_400_000 };
    expect(checkRateLimits("k", [perMinute, perDay], 0).ok).toBe(true);
    expect(checkRateLimits("k", [perMinute, perDay], 1).ok).toBe(true);
    expect(checkRateLimits("k", [perMinute, perDay], 2).ok).toBe(false);
  });

  it("reads the proxy-set client IP", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.7" } }))).toBe("198.51.100.7");
    expect(
      clientIp(new Request("http://x", { headers: { "x-forwarded-for": "10.0.0.1, 198.51.100.8" } })),
    ).toBe("198.51.100.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
