import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { DOCS_CACHE_TAG, DOCS_REVALIDATE_SECONDS } from "@/lib/docs/cache";
import { Vocabulary, expandCompoundTerms } from "./compounds";

/** Shorter terms are rarely compounds; skip the vocabulary for them. */
const MIN_COMPOUND_LENGTH = 8;

/**
 * Words in the search index of a project's published articles (anonymous
 * client, so only public projects), cached with the docs cache.
 */
const fetchVocabulary = unstable_cache(
  async (projectId: string, lang: string): Promise<string[]> => {
    const { data, error } = await createPublicClient().rpc("docs_search_vocabulary", {
      p_project_id: projectId,
      p_lang: lang || null,
    });
    if (error) throw new Error(`search vocabulary lookup failed: ${error.message}`);
    // One text[] (see migration 20261113160000); PostgREST would cap row sets.
    return Array.isArray(data) ? (data as string[]) : [];
  },
  ["docs-search-vocabulary-v2"],
  { tags: [DOCS_CACHE_TAG], revalidate: DOCS_REVALIDATE_SECONDS },
);

/**
 * Split long terms that match nothing in the project's docs into compound parts
 * that do. Falls back to the original terms if the vocabulary is unavailable.
 */
export async function expandSearchTerms(
  terms: string[],
  projectId: string,
  lang: string | null,
): Promise<string[]> {
  if (!terms.some((t) => t.length >= MIN_COMPOUND_LENGTH)) return terms;
  try {
    const vocab = new Vocabulary(await fetchVocabulary(projectId, lang ?? ""));
    return expandCompoundTerms(terms, vocab);
  } catch (err) {
    console.error("[search]", err);
    return terms;
  }
}
