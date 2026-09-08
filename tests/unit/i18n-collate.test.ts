/**
 * T-18 (spec 003 AC-18; TASK-036): Polish collation.
 *
 * `plan/03` §7's acid test is that `ł` is a *letter of its own*, sorting after every `l`, and
 * that a Polish city list therefore comes out in a different order than an English collator
 * produces — where `Łódź` is filed among the `L`s by base letter. Both are asserted, because the
 * single-character comparison alone passes in `en` too (`l` < `ł` at the tertiary level there);
 * only the word list shows that `pl` puts *all* `l` words before *any* `ł` word.
 *
 * The last case covers TASK-044: collation is a formatting convention, so `collator()` reads a
 * locale's `formattingTag` (`en-150` for `en`), never its document-language `bcp47`. ICU's root
 * collation makes `en` and `en-150` order identically, so the *field* is observed through the
 * per-tag memoisation rather than through an ordering difference that does not exist.
 */
import { describe, expect, it } from "vitest";

import { type LocaleCode, localeConfig } from "../../src/config/locales.ts";
import { collator, sortBy } from "../../src/modules/i18n";
import {
  localeRegistryOf,
  staticLocaleRegistry,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";

/** Real Polish cities, chosen so `ł` and `l` interleave by base letter. */
const CITIES = [
  "Łódź",
  "Lublin",
  "Lomianki",
  "Warszawa",
  "Zakopane",
  "Łomża",
  "Kraków",
] as const;

const sorted = (locale: LocaleCode): string[] =>
  sortBy(CITIES, locale, (city) => city);

describe("collator (AC-18 / T-18)", () => {
  it("orders `ł` after `l` in Polish", () => {
    expect(collator("pl").compare("l", "ł")).toBeLessThan(0);
    expect(collator("pl").compare("ł", "m")).toBeLessThan(0);
    expect(collator("pl").compare("ł", "l")).toBeGreaterThan(0);
  });

  it("sorts a Polish city list with every `l` word before every `ł` word", () => {
    expect(sorted("pl")).toEqual([
      "Kraków",
      "Lomianki",
      "Lublin",
      "Łomża",
      "Łódź",
      "Warszawa",
      "Zakopane",
    ]);
  });

  it("sorts the same list differently under the English collator", () => {
    expect(sorted("en")).toEqual([
      "Kraków",
      "Łódź",
      "Lomianki",
      "Łomża",
      "Lublin",
      "Warszawa",
      "Zakopane",
    ]);
    expect(sorted("en")).not.toEqual(sorted("pl"));
  });

  it("keeps `ł` and `l` distinct rather than collapsing them", () => {
    // `sensitivity: "base"` would make these equal, which would merge two real cities.
    expect(collator("pl").compare("Łomża", "Lomza")).not.toBe(0);
  });

  it("orders embedded numbers numerically, not lexically", () => {
    expect(sortBy(["Aleja 10", "Aleja 2"], "pl", (line) => line)).toEqual([
      "Aleja 2",
      "Aleja 10",
    ]);
  });

  it("does not sort the caller's array in place", () => {
    const input = ["Łódź", "Lublin"];
    const output = sortBy(input, "pl", (city) => city);
    expect(input).toEqual(["Łódź", "Lublin"]);
    expect(output).toEqual(["Lublin", "Łódź"]);
  });

  it("memoises one collator per locale", () => {
    expect(collator("pl")).toBe(collator("pl"));
    expect(collator("pl")).not.toBe(collator("en"));
  });

  it("throws on a locale the registry does not know", () => {
    expect(() => collator("fr" as LocaleCode)).toThrow(/unknown locale code/);
  });

  it("builds the collator from `formattingTag`, not `bcp47` (TASK-044)", async () => {
    const en = localeConfig("en");
    expect(en.bcp47).toBe("en");
    expect(en.formattingTag).toBe("en-150");
    const registry = localeRegistryOf([
      ...staticLocaleRegistry.list(),
      // Different document language, same formatting tag → the same memoised collator as `en`.
      { ...en, code: "en-x-doc", bcp47: "en-GB" },
      // Same document language, different formatting tag → a different collator.
      { ...en, code: "en-x-fmt", formattingTag: "en" },
    ]);
    await withLocaleRegistry(registry, () => {
      expect(collator("en-x-doc" as LocaleCode)).toBe(collator("en"));
      expect(collator("en-x-fmt" as LocaleCode)).not.toBe(collator("en"));
    });
  });
});
