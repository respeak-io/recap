/**
 * Turns a docs search box query into search terms for `search_articles_ranked`
 * (Postgres `simple` text-search config: no stemming, no built-in stop words),
 * plus the equivalent tsquery strings.
 *
 * - Stop words (German + English) and single characters are dropped: with the `simple` config, a
 *   natural-language question like "Kann ich Ergebnisse exportieren?" would
 *   otherwise require "kann" and "ich" to appear in the article.
 * - Terms are prefix-matched (`term:*`) in the database, which covers the
 *   half-typed last word in search-as-you-type and simple inflections
 *   ("export" → "exportieren").
 * - Terms are reduced to letters/digits, so the output is always valid tsquery
 *   syntax and cannot inject operators.
 */

const STOP_WORDS = new Set(
  `
  a about an and are as at be by can could do does for from how i if in into is it its me my of on or our should
  so that the their them then there these this to us was we what when where which who why will with would you your
  aber als am an auch auf aus bei bin bis bitte da damit dann das dass dem den der des die dies diese diesem diesen
  dieser doch du durch ein eine einem einen einer eines er es für gibt habe haben hat hier ich ihr ihre im in ist
  ja kann kannst können man mein meine mich mir mit muss müssen nach nicht noch nur ob oder ohne sein sich sie sind
  so soll sollte über um und uns unter vom von vor was welche welcher welches wenn werden wer wie wieso wir wird
  wo woher wohin zu zum zur
  `
    .split(/\s+/)
    .filter(Boolean),
);

const MAX_TERMS = 8;

export interface SearchTsQueries {
  /** All terms must match (ranked first). */
  and: string;
  /** Any term may match (fallback / top-up). */
  or: string;
  /** The terms used, for logging and tests. */
  terms: string[];
}

export function buildSearchTsQueries(input: string): SearchTsQueries | null {
  const words = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);

  // Single characters (e.g. the "s" in "foo's") would prefix-match nearly everything.
  const meaningful = words.filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  // A query made only of stop words ("wie geht das") still searches for them.
  const terms = [...new Set(meaningful.length > 0 ? meaningful : words)].slice(0, MAX_TERMS);
  if (terms.length === 0) return null;

  const tsTerms = terms.map((t) => `${t}:*`);
  return { and: tsTerms.join(" & "), or: tsTerms.join(" | "), terms };
}
