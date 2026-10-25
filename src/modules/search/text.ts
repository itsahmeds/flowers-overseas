/**
 * Search's text core: one normaliser for documents and queries, the tokeniser, the light stemmers
 * and the typo distance (spec 045 §2.3, §5.2; TASK-400).
 *
 * Every function here is pure: same input, same output, no clock, no I/O, no locale default read
 * from the environment. The word lists and suffix rules are `src/config/search.ts` data, so a new
 * language is a config edit and fixtures, never an edit here (§7).
 *
 * **No regular expression is built from user input** (§2.8). The patterns below are constants
 * applied *to* the input; a query is only ever compared, sliced and split.
 */
import {
  SEARCH_CONFIG,
  type SearchConfig,
  type StemRule,
} from "@/config/search";

/**
 * The letters NFKD leaves whole, mapped by table (§2.3). Applied after lower-casing, so the
 * capitals (`Ł`, `Æ`, `Ø`, `Đ`, and `ẞ`, which lower-cases to `ß`) need no rows of their own.
 */
const LETTER_TABLE: Readonly<Record<string, string>> = {
  ł: "l",
  ß: "ss",
  æ: "ae",
  ø: "o",
  đ: "d",
};
const TABLE_LETTERS = /[łßæøđ]/gu;
const COMBINING_MARKS = /\p{M}+/gu;
/** German digraphs folded on both sides, so `Maigloeckchen` and `Maiglöckchen` meet (§2.3). */
const GERMAN_DIGRAPHS = /ae|oe|ue/gu;
const NOT_WORD = /[^a-z0-9]+/gu;

/**
 * Spec 045 §2.3's normalisation, `plan/03` §7's "search uses `unaccent`" done in the application:
 * NFC; lower case; NFKD with combining marks removed (`róża` to `roza`, `Kraków` to `krakow`); the
 * table above (`ł` to `l`, `ß` to `ss`, `æ` to `ae`, `ø` to `o`, `đ` to `d`); `ae`, `oe`, `ue`
 * folded to `a`, `o`, `u`; every other character a space; spaces collapsed and trimmed.
 */
export function normaliseForSearch(text: string): string {
  const lowered = text.normalize("NFC").toLowerCase();
  const unmarked = lowered.normalize("NFKD").replace(COMBINING_MARKS, "");
  const tabled = unmarked.replace(
    TABLE_LETTERS,
    (letter) => LETTER_TABLE[letter] ?? letter,
  );
  const folded = tabled.replace(GERMAN_DIGRAPHS, (pair) => pair.charAt(0));
  return folded.replace(NOT_WORD, " ").trim();
}

/**
 * The word-list language of a locale code: its primary subtag (`en-gb` reads `en`'s lists). A
 * language with no lists gets none, which is §7's fallback for a locale whose lists are not yet
 * authored.
 */
export function searchLanguage(locale: string): string {
  return (locale.split("-")[0] ?? locale).toLowerCase();
}

const stopWordCache = new Map<string, ReadonlySet<string>>();

function stopWordsFor(
  locale: string,
  config: SearchConfig,
): ReadonlySet<string> {
  const language = searchLanguage(locale);
  const cacheKey = config === SEARCH_CONFIG ? language : undefined;
  const cached =
    cacheKey === undefined ? undefined : stopWordCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const words = new Set(
    (config.stopWords[language] ?? []).map((word) => normaliseForSearch(word)),
  );
  if (cacheKey !== undefined) stopWordCache.set(cacheKey, words);
  return words;
}

/**
 * Split a normalised string into tokens, drop the locale's stop words and keep at most `limit`
 * (the query's `maxTokens`, 8; documents pass `Infinity`).
 */
export function tokenise(
  normalised: string,
  locale: string,
  limit: number = SEARCH_CONFIG.maxTokens,
  config: SearchConfig = SEARCH_CONFIG,
): string[] {
  const stopWords = stopWordsFor(locale, config);
  const tokens: string[] = [];
  for (const word of normalised.split(" ")) {
    if (word === "" || stopWords.has(word)) continue;
    if (tokens.length >= limit) break;
    tokens.push(word);
  }
  return tokens;
}

function applies(rule: StemRule, token: string): string | undefined {
  if (!token.endsWith(rule.suffix)) return undefined;
  const base = token.slice(0, token.length - rule.suffix.length);
  if (
    rule.after !== undefined &&
    !rule.after.some((ending) => base.endsWith(ending))
  ) {
    return undefined;
  }
  return base + rule.replace;
}

/**
 * The light stem of one normalised token in a locale's language (§2.3): the first suffix rule
 * that applies, applied once. A stem shorter than `stemMinLetters` leaves the token whole, and a
 * language with no rules leaves every token whole.
 */
export function stem(
  token: string,
  locale: string,
  config: SearchConfig = SEARCH_CONFIG,
): string {
  const rules = config.stemRules[searchLanguage(locale)] ?? [];
  for (const rule of rules) {
    const stemmed = applies(rule, token);
    if (stemmed === undefined) continue;
    return stemmed.length >= config.stemMinLetters ? stemmed : token;
  }
  return token;
}

/**
 * The restricted Damerau-Levenshtein distance (optimal string alignment: insertions, deletions,
 * substitutions and adjacent transpositions, each 1), bounded by `max`: any distance above `max`
 * is reported as `max + 1`, so a caller compares against its own limit and the scan stops early.
 */
export function damerauLevenshtein(a: string, b: string, max: number): number {
  const over = max + 1;
  if (Math.abs(a.length - b.length) > max) return over;
  if (a === b) return 0;

  const width = b.length + 1;
  let twoBack = new Array<number>(width).fill(0);
  let previous = Array.from({ length: width }, (_, index) => index);
  let current = new Array<number>(width).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      let value = Math.min(
        (previous[j] ?? over) + 1,
        (current[j - 1] ?? over) + 1,
        (previous[j - 1] ?? over) + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charAt(i - 1) === b.charAt(j - 2) &&
        a.charAt(i - 2) === b.charAt(j - 1)
      ) {
        value = Math.min(value, (twoBack[j - 2] ?? over) + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return over;
    [twoBack, previous, current] = [previous, current, twoBack];
  }
  const distance = previous[b.length] ?? over;
  return distance > max ? over : distance;
}

/**
 * True when `term` may be a typo target of `token`: it starts with the same `fixedPrefix` letters
 * (§2.3 as configured in `src/config/search.ts`, which says why).
 */
export function sharesTypoPrefix(
  token: string,
  term: string,
  config: SearchConfig = SEARCH_CONFIG,
): boolean {
  const length = config.typoDistance.fixedPrefix;
  return token.slice(0, length) === term.slice(0, length);
}

/**
 * The typo tolerance of a query token (§2.3): `short` (1) for 4 to 7 letters, `long` (2) from 8,
 * none (0) under 4. `widen` adds one step for "Did you mean" (§14 A-orchestrator-2026-10-24 item
 * 2: 1 for 3 letters, 2 for 4 to 7, 3 for 8 or more, none under 3).
 */
export function typoAllowance(
  token: string,
  config: SearchConfig = SEARCH_CONFIG,
  widen = false,
): number {
  const { short, long, longFrom, minLength } = config.typoDistance;
  const length = token.length;
  const step = widen ? 1 : 0;
  if (length < minLength - step) return 0;
  if (length < minLength) return step;
  return (length >= longFrom ? long : short) + step;
}
