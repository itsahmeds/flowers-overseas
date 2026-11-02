/**
 * The token-distinctness measure two gates share: `corridor:check`'s rule 5 (spec 007 §2, §14 A4)
 * and the blog's `blog/distinct` rule (spec 044 §2.3 rule 3, advisor fix 3; TASK-321). Extracted
 * from `scripts/corridor-check.ts` so both read one function rather than a copy; the corridor
 * gate's floor (0.80) and its fixtures are unchanged, and the blog sets its own floor (0.70).
 *
 * Pure and dependency-free, so a Node script and the application import it alike.
 */

/** Spec 007 §14 A4: the shingle length the distinctness metric measures over. */
export const SHINGLE_SIZE = 5;

/**
 * The normalised token sequence of a body: lower-cased, Unicode letters and digits only, every
 * other character treated as a separator, stop-words retained (`plan/02` §5.2).
 *
 * Order matters here in a way it did not under the old multiset metric: the shingles below are
 * *contiguous* runs of this sequence, so the normalisation is what decides whether "Mother's Day"
 * is one shingle position or two. It is one rule, applied once, and both `shinglesOf` and any
 * caller that wants raw tokens read it from here.
 */
export function tokensOf(text: string): readonly string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length > 0,
  );
}

/**
 * The set of contiguous `size`-token shingles of a text, over `tokensOf`'s normalisation.
 *
 * A *set*, not a multiset: a phrase repeated inside one guide is one thing the author said twice,
 * not two things two guides share.
 */
export function shinglesOf(
  text: string,
  size: number = SHINGLE_SIZE,
): ReadonlySet<string> {
  const tokens = tokensOf(text);
  const shingles = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    shingles.add(tokens.slice(index, index + size).join(" "));
  }
  return shingles;
}

/**
 * Spec 007 §14 A4's metric, exactly: the **Jaccard distance between the two texts' 5-gram shingle
 * sets** — `1 − |S_a ∩ S_b| / |S_a ∪ S_b|`, where `S_x` is the set of contiguous five-token
 * shingles of `x` under `tokensOf`'s normalisation.
 *
 * 1 means the two texts share no five-word run at all; 0 means they are the same text. Two texts
 * with fewer than five tokens between them share nothing measurable, so the empty-union case is 1.
 */
export function shingleDistinctness(a: string, b: string): number {
  const own = shinglesOf(a);
  const other = shinglesOf(b);
  let shared = 0;
  for (const shingle of own) {
    if (other.has(shingle)) shared += 1;
  }
  const union = own.size + other.size - shared;
  return union === 0 ? 1 : 1 - shared / union;
}
