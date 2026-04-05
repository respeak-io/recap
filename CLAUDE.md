# Project Guidelines

## Context

- The `README.md` at the project root serves as high-level context and should be kept up to date as the project evolves.
- The `docs/` folder contains plans and design documents. Check these when you need deeper context about the project's architecture, features, or decisions.
- This project uses native Claude Code and the Superpowers plugin, so expect artifacts from both (e.g., skill invocations, plans, worktrees).

## Git

- Use `--no-gpg-sign` for all git commits
- `gh` CLI is not installed. Use `git` commands and provide GitHub URLs for PR creation instead.

## Testing

- **Framework**: Vitest. Run with `npx vitest run`. Config in `vitest.config.ts` (has `@` path alias).
- **Structure**:
  - `__tests__/lib/` — Unit tests for pure logic (languages, constants, markdown-to-tiptap, VTT, etc.)
  - `__tests__/api/` — Integration tests for internal API route handlers (session auth via `createClient()`)
  - `__tests__/api/v1/` — Integration tests for v1 API route handlers (API key auth via `validateApiKey()`)
  - `__tests__/helpers/mock-supabase.ts` — Shared mock builder for Supabase clients
- **Mocking patterns**:
  - Internal routes: mock `@/lib/supabase/server` → `createClient` returns `mockSupabase().client`
  - V1 routes: mock `@/lib/supabase/service` → `createServiceClient` returns `mockSupabase().client`, mock `@/lib/api-key-auth` → `validateApiKey` returns `{ orgId, keyId }`
  - For modules with transitive deps on `@/lib/ai/gemini` or `reeldocs/ai`, use `vi.mock()` to stub them before dynamic `await import()`
  - Use `async` callbacks in `vi.mock()` when you need `await import()` inside (esbuild rejects `await` in non-async functions)
  - Use `vi.mocked(module.fn)` to reset mocks in `beforeEach` — do NOT use `require()` with `@/` path aliases (they don't resolve)
- **Adding new tests**: Follow existing patterns. Use `mockSupabase()` from the helpers, `makeRequest()` for building Request objects, and `Promise.resolve()` for route handler `params`.
