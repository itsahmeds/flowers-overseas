/**
 * Site search's configuration (spec 045 §5.1 "Configuration", §2.3, §7; TASK-400).
 *
 * The parsed object is pinned value by value against §5.1's list, so a tuning change is a visible
 * edit to this file too; the refinements are driven with the shapes they exist to refuse; and every
 * launch locale's language must have its stop words and stem rules, which is what §7 means by "a new
 * locale needs its stop words and suffix list".
 */
import { describe, expect, it } from "vitest";

import { launchLocales } from "../../src/config/locales.ts";
import { SEARCH_CONFIG, SearchConfigSchema } from "../../src/config/search.ts";
import { searchLanguage } from "../../src/modules/search/index.ts";

describe("SEARCH_CONFIG (spec 045 §5.1)", () => {
  it("holds every §5.1 constant at its specified value", () => {
    expect(SEARCH_CONFIG.maxQueryChars).toBe(80);
    expect(SEARCH_CONFIG.maxTokens).toBe(8);
    expect(SEARCH_CONFIG.minQueryLetters).toBe(2);
    expect(SEARCH_CONFIG.pageSize).toBe(12);
    expect(SEARCH_CONFIG.maxPages).toBe(10);
    expect(SEARCH_CONFIG.pagesBlockMax).toBe(3);
    expect(SEARCH_CONFIG.typoDistance).toEqual({
      short: 1,
      long: 2,
      longFrom: 8,
      minLength: 4,
      fixedPrefix: 1,
    });
    expect(SEARCH_CONFIG.prefixMinLetters).toBe(3);
    expect(SEARCH_CONFIG.stemMinLetters).toBe(3);
    expect(SEARCH_CONFIG.marginBandThresholdsBp).toEqual([
      3000, 3500, 4000, 4500,
    ]);
    expect(SEARCH_CONFIG.indexMaxAgeSeconds).toBe(300);
    expect(SEARCH_CONFIG.rateLimit).toEqual({
      resultsPerMinute: 60,
      suggestPerMinute: 120,
      maxConcurrent: 32,
    });
    expect(SEARCH_CONFIG.insights).toEqual({
      minCount: 3,
      flushSeconds: 60,
      queryRetentionDays: 90,
      totalRetentionDays: 400,
    });
    expect(SEARCH_CONFIG.suggestions).toBe(false);
    expect(SEARCH_CONFIG.suggestMax).toBe(6);
  });

  it("carries §2.3's stop words per language, verbatim", () => {
    expect(SEARCH_CONFIG.stopWords).toEqual({
      en: ["for", "the", "a", "to", "with"],
      de: ["für", "der", "die", "das", "und", "mit", "nach"],
      pl: ["dla", "i", "z", "na", "do", "w"],
    });
  });

  it("carries §2.3's suffix lists per language, longest first", () => {
    expect(SEARCH_CONFIG.stemRules["pl"]?.map((rule) => rule.suffix)).toEqual([
      "ami",
      "ach",
      "om",
      "ow",
      "y",
      "i",
      "e",
      "a",
    ]);
    expect(SEARCH_CONFIG.stemRules["de"]?.map((rule) => rule.suffix)).toEqual([
      "en",
      "er",
      "e",
      "n",
      "s",
    ]);
    expect(SEARCH_CONFIG.stemRules["en"]).toEqual([
      { suffix: "ies", replace: "y" },
      { suffix: "es", replace: "", after: ["ss", "x", "ch", "sh"] },
      { suffix: "s", replace: "" },
    ]);
  });

  it("has word lists for every launch locale's language (§7)", () => {
    for (const locale of launchLocales) {
      const language = searchLanguage(locale);
      expect(SEARCH_CONFIG.stopWords[language], locale).toBeDefined();
      expect(SEARCH_CONFIG.stemRules[language], locale).toBeDefined();
    }
  });

  it("refuses thresholds that do not rise, and a long distance that starts too early", () => {
    expect(
      SearchConfigSchema.safeParse({
        ...SEARCH_CONFIG,
        marginBandThresholdsBp: [3000, 3000, 4000, 4500],
      }).success,
    ).toBe(false);
    expect(
      SearchConfigSchema.safeParse({
        ...SEARCH_CONFIG,
        typoDistance: { ...SEARCH_CONFIG.typoDistance, longFrom: 4 },
      }).success,
    ).toBe(false);
    expect(
      SearchConfigSchema.safeParse({ ...SEARCH_CONFIG, extra: true }).success,
    ).toBe(false);
    expect(SearchConfigSchema.safeParse(SEARCH_CONFIG).success).toBe(true);
  });

  it("names no country (spec 004 AC-73): no ISO code or country word in the file", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/config/search.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/"(PL|DE|FR|ES|IT|RO|NL)"/u);
    expect(source).not.toMatch(/poland|polska|polen|germany/iu);
  });
});
