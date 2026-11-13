import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Anonymous Supabase client that never reads or writes cookies.
 *
 * Used for public docs data that is shared across visitors and cached (see
 * `lib/docs/data.ts`). Because it always runs as the `anon` role, RLS only
 * returns public projects and published articles, so a cached result can never
 * contain drafts that a logged-in org member would otherwise be allowed to see.
 */
export function createPublicClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return client;
}
