/**
 * Splits search terms that never occur in the docs into parts that do.
 *
 * The docs search matches word prefixes with the `simple` config, so a German
 * compound typed by the reader ("akteneinträge") finds nothing when the docs
 * phrase it differently ("Einträge in der Akte"). Such a term is replaced by
 * its parts ("akte", "einträge") if every part is backed by the project's
 * vocabulary. Terms that already match something are never touched.
 */

const MIN_PART = 3;
/** German linking elements ("Fugenelemente") between compound parts. */
const LINKING = ["s", "es", "n", "en", "e"];
const MAX_PARTS = 3;

export class Vocabulary {
  private readonly words: string[];
  private readonly set: Set<string>;

  /** @param words lowercased words; need not be sorted or unique */
  constructor(words: Iterable<string>) {
    this.set = new Set(words);
    this.words = [...this.set].sort();
  }

  has(word: string): boolean {
    return this.set.has(word);
  }

  /** Whether any vocabulary word starts with `prefix` (what `prefix:*` matches). */
  hasPrefix(prefix: string): boolean {
    let lo = 0;
    let hi = this.words.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.words[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo < this.words.length && this.words[lo].startsWith(prefix);
  }
}

/** Shortest vocabulary form of a compound head ("akten" -> "akte"), or null. */
function headForm(head: string, vocab: Vocabulary): string | null {
  for (const link of LINKING) {
    const base = head.slice(0, -link.length);
    if (head.endsWith(link) && base.length >= MIN_PART && vocab.has(base)) return base;
  }
  return vocab.has(head) ? head : null;
}

/** Parts of `word` that all exist in the vocabulary, longest head first; null if none. */
export function splitCompound(word: string, vocab: Vocabulary, depth = 1): string[] | null {
  for (let i = word.length - MIN_PART; i >= MIN_PART; i--) {
    const head = headForm(word.slice(0, i), vocab);
    if (!head) continue;
    const tail = word.slice(i);
    if (vocab.hasPrefix(tail)) return [head, tail];
    if (depth < MAX_PARTS - 1) {
      const rest = splitCompound(tail, vocab, depth + 1);
      if (rest) return [head, ...rest];
    }
  }
  return null;
}

/** Replace terms with no match in the vocabulary by their compound parts. */
export function expandCompoundTerms(terms: string[], vocab: Vocabulary): string[] {
  const out: string[] = [];
  for (const term of terms) {
    const parts = vocab.hasPrefix(term) ? null : splitCompound(term, vocab);
    for (const t of parts ?? [term]) if (!out.includes(t)) out.push(t);
  }
  return out;
}
