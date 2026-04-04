import { describe, it, expect } from "vitest";
import { generateApiKey, hashKey } from "@/lib/api-key-auth";

describe("generateApiKey", () => {
  it("returns key with rd_ prefix", () => {
    const { key } = generateApiKey();
    expect(key).toMatch(/^rd_[a-f0-9]{40}$/);
  });

  it("returns a hash that is a 64-char hex string (SHA-256)", () => {
    const { hash } = generateApiKey();
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns prefix as first 11 characters of key", () => {
    const { key, prefix } = generateApiKey();
    expect(prefix).toBe(key.slice(0, 11));
    expect(prefix).toHaveLength(11);
    expect(prefix).toMatch(/^rd_[a-f0-9]{8}$/);
  });

  it("generates unique keys each time", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it("hash matches hashKey of the key", () => {
    const { key, hash } = generateApiKey();
    expect(hashKey(key)).toBe(hash);
  });
});

describe("hashKey", () => {
  it("produces consistent hashes for same input", () => {
    const input = "rd_test1234567890";
    expect(hashKey(input)).toBe(hashKey(input));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashKey("rd_aaa")).not.toBe(hashKey("rd_bbb"));
  });

  it("returns 64-char hex string", () => {
    expect(hashKey("anything")).toMatch(/^[a-f0-9]{64}$/);
  });
});
