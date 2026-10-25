/**
 * Site search's numbers and word lists (spec 045 §5.1 "Configuration", §2.3, §2.8, §2.11; TASK-400).
 *
 * Every constant the search engine, the results page and the abuse limits read, in one parsed
 * object, so a tuning change is one edit here and `SearchConfigSchema` refuses a malformed one at
 * module load rather than at request time. No database is read here and none may be (`pnpm
 * check:no-db` scans `src/config`), and no value names a country: a destination is data in
 * `src/config/countries.ts`, never a constant of search (spec 004 AC-73).
 *
 * **Word lists are keyed by language, not by locale code.** `en` and `en-gb` read the same English
 * list, which is what "per launch locale" means for two locales of one language; a language with
 * no entry (a pseudo-locale, a Phase 4 locale before its lists are authored) gets no stop words
 * and no stemming, so its documents fall back to normalisation and prefix matching only (§7).
 * `tests/unit/search-config.test.ts` asserts every launch locale's language has both lists.
 *
 * **Stem rules** are §2.3's closed suffix lists as data, tried in the order written (longest
 * first) and applied once: `replace` is what the suffix becomes, and `after`, when present, lists
 * the endings the remaining word must have for the rule to apply (English `es` only after `ss`,
 * `x`, `ch`, `sh`). A stem keeps at least `stemMinLetters` letters, or the token is left whole.
 */
import { z } from "zod";

const PositiveInt = z.number().int().positive();
const NonNegativeInt = z.number().int().nonnegative();

/** One normalised-language word: lower-case ASCII letters, as `normaliseForSearch` emits them. */
const WordSchema = z.string().regex(/^[a-z]+$/u);

/** A stop word as authored (`für`), normalised by the engine before it is compared. */
const StopWordSchema = z.string().min(1);

export const StemRuleSchema = z.strictObject({
  suffix: WordSchema,
  replace: z.string().regex(/^[a-z]*$/u),
  after: z.array(WordSchema).min(1).readonly().optional(),
});
export type StemRule = z.infer<typeof StemRuleSchema>;

/** A language subtag as it appears in a locale code (`en`, `de`, `pl`). */
const LanguageSchema = z.string().regex(/^[a-z]{2,3}$/u);

export const SearchConfigSchema = z
  .strictObject({
    /** `maxlength` of the field and the server-side truncation, in code points (§2.8). */
    maxQueryChars: PositiveInt,
    /** Tokens kept after stop words (§2.3, §2.8). */
    maxTokens: PositiveInt,
    /** Fewer letters than this after normalisation is the "too short" state (§2.7). */
    minQueryLetters: PositiveInt,
    /** Cards per results page (spec 008's page size) and the last page there is (§2.2). */
    pageSize: PositiveInt,
    maxPages: PositiveInt,
    /** Links in the "Pages" block (§2.3). */
    pagesBlockMax: PositiveInt,
    /**
     * Damerau-Levenshtein tolerance (§2.3): `short` for tokens of `minLength` to `longFrom - 1`
     * letters, `long` from `longFrom`, none below `minLength`. `fixedPrefix` letters at the start
     * of a word are never the typo: a typo target begins as the typed word does. Without it the
     * Polish `róże` (roses) is one edit from `Boże` (`Boże Narodzenie`, Christmas) and a search
     * for roses lists the Christmas bouquets, which spec 045 AC-6 forbids; see TASK-401's brief.
     */
    typoDistance: z.strictObject({
      short: PositiveInt,
      long: PositiveInt,
      longFrom: PositiveInt,
      minLength: PositiveInt,
      fixedPrefix: NonNegativeInt,
    }),
    /** The last token prefix-matches from this many letters (§2.3). */
    prefixMinLetters: PositiveInt,
    /** A stem keeps at least this many letters (§2.3). */
    stemMinLetters: PositiveInt,
    stopWords: z.record(LanguageSchema, z.array(StopWordSchema).readonly()),
    stemRules: z.record(LanguageSchema, z.array(StemRuleSchema).readonly()),
    /** Margin-share thresholds in basis points; the band is how many are at or below the share (§2.5). */
    marginBandThresholdsBp: z.array(NonNegativeInt).length(4).readonly(),
    /** The in-process index is rebuilt on the next search once it is older than this (§2.9, §5.4). */
    indexMaxAgeSeconds: PositiveInt,
    rateLimit: z.strictObject({
      resultsPerMinute: PositiveInt,
      suggestPerMinute: PositiveInt,
      maxConcurrent: PositiveInt,
    }),
    insights: z.strictObject({
      minCount: PositiveInt,
      flushSeconds: PositiveInt,
      queryRetentionDays: PositiveInt,
      totalRetentionDays: PositiveInt,
    }),
    /** The suggestions island (slice 2), off until the founder's budget run (§2.11, §13 Q9). */
    suggestions: z.boolean(),
    suggestMax: PositiveInt,
  })
  .superRefine((config, ctx) => {
    const thresholds = config.marginBandThresholdsBp;
    for (let index = 1; index < thresholds.length; index += 1) {
      if ((thresholds[index] ?? 0) <= (thresholds[index - 1] ?? 0)) {
        ctx.addIssue({
          code: "custom",
          path: ["marginBandThresholdsBp", index],
          message: "margin band thresholds must rise strictly (spec 045 §2.5)",
        });
      }
    }
    if (config.typoDistance.longFrom <= config.typoDistance.minLength) {
      ctx.addIssue({
        code: "custom",
        path: ["typoDistance", "longFrom"],
        message:
          "the long typo distance must start above the minimum typo length",
      });
    }
  });
export type SearchConfig = z.infer<typeof SearchConfigSchema>;

export const SEARCH_CONFIG: SearchConfig = SearchConfigSchema.parse({
  maxQueryChars: 80,
  maxTokens: 8,
  minQueryLetters: 2,
  pageSize: 12,
  maxPages: 10,
  pagesBlockMax: 3,
  typoDistance: {
    short: 1,
    long: 2,
    longFrom: 8,
    minLength: 4,
    fixedPrefix: 1,
  },
  prefixMinLetters: 3,
  stemMinLetters: 3,
  // §2.3's closed lists, verbatim.
  stopWords: {
    en: ["for", "the", "a", "to", "with"],
    de: ["für", "der", "die", "das", "und", "mit", "nach"],
    pl: ["dla", "i", "z", "na", "do", "w"],
  },
  stemRules: {
    // English: `ies` to `y`; `es` after `ss`, `x`, `ch`, `sh`; else `s`.
    en: [
      { suffix: "ies", replace: "y" },
      { suffix: "es", replace: "", after: ["ss", "x", "ch", "sh"] },
      { suffix: "s", replace: "" },
    ],
    // German: `en`, `er`, `e`, `n`, `s`.
    de: [
      { suffix: "en", replace: "" },
      { suffix: "er", replace: "" },
      { suffix: "e", replace: "" },
      { suffix: "n", replace: "" },
      { suffix: "s", replace: "" },
    ],
    // Polish: `ami`, `ach`, `om`, `ow` (`ów` after normalisation), `y`, `i`, `e`, `a`.
    pl: [
      { suffix: "ami", replace: "" },
      { suffix: "ach", replace: "" },
      { suffix: "om", replace: "" },
      { suffix: "ow", replace: "" },
      { suffix: "y", replace: "" },
      { suffix: "i", replace: "" },
      { suffix: "e", replace: "" },
      { suffix: "a", replace: "" },
    ],
  },
  marginBandThresholdsBp: [3000, 3500, 4000, 4500],
  indexMaxAgeSeconds: 300,
  rateLimit: { resultsPerMinute: 60, suggestPerMinute: 120, maxConcurrent: 32 },
  insights: {
    minCount: 3,
    flushSeconds: 60,
    queryRetentionDays: 90,
    totalRetentionDays: 400,
  },
  suggestions: false,
  suggestMax: 6,
});
