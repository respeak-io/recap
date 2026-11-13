# Project Guidelines

## Context

- The `README.md` at the project root serves as high-level context and should be kept up to date as the project evolves.
- The `docs/` folder contains plans and design documents. Check these when you need deeper context about the project's architecture, features, or decisions.
- This project uses native Claude Code and the Superpowers plugin, so expect artifacts from both (e.g., skill invocations, plans, worktrees).

## Caching

- Public docs data (`app/(docs)/…`) comes from `lib/docs/data.ts` and is cached under the `docs` tag. Any new route handler or server action that changes articles, chapters, projects (details, theme, assets) or media used in docs must purge it: `export const PATCH = withDocsRevalidation(handlePatch)` for routes, `revalidateDocs()` in server actions (both in `lib/docs/cache.ts`). Otherwise readers see stale content for up to 5 minutes.
- Do not add a `loading.tsx` above docs pages: it turns `notFound()`/`redirect()` in the page into soft 404s (status 200) and client-side redirects.
- Dashboard server components share per-request lookups via React `cache()` in `lib/queries/projects.ts` (`getCurrentUser`, `getProjects`, `getProject`). Use those instead of calling `supabase.auth.getUser()` or re-querying the project.

## AI models and public endpoints

- Never hardcode a Gemini model ID at a call site. Use `MODELS` / `modelFor()` in `packages/cli/src/ai/models.ts` (CLI and shared tasks) or `AI_MODELS` in `lib/ai/models.ts` (app-only tasks), and update `MODEL_PRICES_USD_PER_MTOK` when adding a model there. Rationale and test results: `docs/model-comparison-2026-11.md`.
- Public, unauthenticated routes that cost money or write rows must use `checkRateLimit()` from `lib/rate-limit.ts`; AI calls from public routes must go through `isWithinDailyBudget()` / `recordAiUsage()` in `lib/ai/budget.ts`.

## Git

- Use `--no-gpg-sign` for all git commits
- The `gh` CLI is installed and authenticated — use it for GitHub operations (PRs, issues, API).

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
  - For modules with transitive deps on `@/lib/ai/gemini` or `@respeak/recap/ai`, use `vi.mock()` to stub them before dynamic `await import()`
  - Use `async` callbacks in `vi.mock()` when you need `await import()` inside (esbuild rejects `await` in non-async functions)
  - Use `vi.mocked(module.fn)` to reset mocks in `beforeEach` — do NOT use `require()` with `@/` path aliases (they don't resolve)
- **Adding new tests**: Follow existing patterns. Use `mockSupabase()` from the helpers, `makeRequest()` for building Request objects, and `Promise.resolve()` for route handler `params`.
