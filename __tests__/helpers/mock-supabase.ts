import { vi } from "vitest";

type MockFn = ReturnType<typeof vi.fn>;

/**
 * Chainable mock builder for Supabase query chains.
 * Each chain method returns `this` so calls like
 *   db.from("t").select("*").eq("id", x).single()
 * all resolve correctly.
 */
export interface MockChain {
  select: MockFn;
  insert: MockFn;
  update: MockFn;
  delete: MockFn;
  eq: MockFn;
  neq: MockFn;
  order: MockFn;
  limit: MockFn;
  single: MockFn;
  textSearch: MockFn;
  then: MockFn;
  // Terminal result – set via `resolves()` / `rejects()`
  _result: { data: unknown; error: unknown };
}

function createChain(result?: { data?: unknown; error?: unknown }): MockChain {
  const r = { data: result?.data ?? null, error: result?.error ?? null };

  const chain: MockChain = {} as MockChain;
  const self = () => chain;

  chain._result = r;
  chain.select = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.update = vi.fn(self);
  chain.delete = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.neq = vi.fn(self);
  chain.order = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.single = vi.fn(self);
  chain.textSearch = vi.fn(self);
  // Make chain thenable so `await` resolves to `{ data, error }`
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(r));

  return chain;
}

export interface MockStorageBucket {
  remove: MockFn;
  createSignedUploadUrl: MockFn;
  upload: MockFn;
}

export interface MockSupabase {
  from: MockFn;
  rpc: MockFn;
  auth: { getUser: MockFn };
  storage: { from: MockFn };
  /** Map of table name → chain for fine-grained control */
  _chains: Map<string, MockChain>;
  /** Map of bucket name → storage mock */
  _buckets: Map<string, MockStorageBucket>;
}

/**
 * Build a mock Supabase client.
 *
 * Usage:
 * ```ts
 * const db = mockSupabase();
 * // Set a default response for a table:
 * db.setTable("articles", { data: [{ id: "1" }] });
 * // Or get the chain for assertions:
 * const chain = db.getChain("articles");
 * expect(chain.delete).toHaveBeenCalled();
 * ```
 */
export function mockSupabase() {
  const chains = new Map<string, MockChain>();
  const buckets = new Map<string, MockStorageBucket>();

  const getOrCreateChain = (table: string): MockChain => {
    if (!chains.has(table)) {
      chains.set(table, createChain());
    }
    return chains.get(table)!;
  };

  const getOrCreateBucket = (bucket: string): MockStorageBucket => {
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        createSignedUploadUrl: vi
          .fn()
          .mockResolvedValue({ data: { signedUrl: "https://mock-url.com/upload" }, error: null }),
        upload: vi.fn().mockResolvedValue({ data: { path: "mock-path" }, error: null }),
      });
    }
    return buckets.get(bucket)!;
  };

  const mock: MockSupabase = {
    from: vi.fn((table: string) => getOrCreateChain(table)),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      }),
    },
    storage: {
      from: vi.fn((bucket: string) => getOrCreateBucket(bucket)),
    },
    _chains: chains,
    _buckets: buckets,
  };

  return {
    client: mock as unknown as MockSupabase,
    /** Set the resolved result for a table's query chain */
    setTable(table: string, result: { data?: unknown; error?: unknown }) {
      chains.set(table, createChain(result));
    },
    /** Get the mock chain for a table (for assertions) */
    getChain(table: string) {
      return getOrCreateChain(table);
    },
    /** Get the storage bucket mock */
    getBucket(bucket: string) {
      return getOrCreateBucket(bucket);
    },
  };
}

/**
 * Helper: create a Request object for testing route handlers.
 */
export function makeRequest(
  url: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Request {
  const { method = "GET", body, headers = {} } = options ?? {};
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
