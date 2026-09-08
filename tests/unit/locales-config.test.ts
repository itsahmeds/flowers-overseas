/**
 * T-01 (spec 003 AC-1) and the locale half of T-04 (AC-4), TASK-033.
 *
 * `src/config/locales.ts` is the Phase 0 source of truth for the locale set (spec 003 §1 "the
 * no-database seam"): it parses itself under `LocaleRegistrySchema` at module load, and the
 * registry-level refinements of §5.3 are what stop a fifth locale from being added wrongly
 * (duplicate code, cyclic fallback, unknown currency, bad `bcp47`, bad `dir`, duplicate path
 * segment). Each of the six malformed fixtures below must fail *naming the offending field*,
 * because the failure a future implementer sees is the whole value of the schema.
 *
 * `toLocaleRow()` is pinned to spec 002 §5.1's `locale` column set so TASK-015's seed reads the
 * projection instead of restating the locale set (AC-4).
 *
 * TASK-044 adds the `bcp47` / `formattingTag` split: `formattingTag` may be omitted and then
 * defaults to `bcp47` (asserted for `en-gb`, `de` and `pl`, which omit it), and its two
 * refinements — canonical tag, same primary language subtag as `bcp47` — are exercised with the
 * two failures that matter: an unparseable tag and a `de-150` formatting tag on an English
 * locale, which would silently relabel the language of every formatted value.
 */
import { describe, expect, it } from "vitest";

import { CURRENCY_CODES } from "../../src/config/currencies.ts";
import {
  LOCALES,
  LOCALE_ROW_COLUMNS,
  LocaleConfigSchema,
  LocaleRegistrySchema,
  PATH_SEGMENT_KEYS,
  defaultLocale,
  launchLocales,
  localeConfig,
  toLocaleRow,
  xDefaultLocale,
} from "../../src/config/locales.ts";

/** A deep, mutable copy of the shipped registry, so a fixture can break exactly one thing. */
function registryCopy(): Record<string, unknown>[] {
  return JSON.parse(JSON.stringify(LOCALES)) as Record<string, unknown>[];
}

function issueSummary(registry: unknown): string {
  const result = LocaleRegistrySchema.safeParse(registry);
  expect(result.success).toBe(false);
  if (result.success) return "";
  return result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

describe("src/config/locales.ts (AC-1 / T-01)", () => {
  it("parses under LocaleRegistrySchema at module load", () => {
    expect(LocaleRegistrySchema.parse(LOCALES)).toEqual(LOCALES);
    for (const locale of LOCALES) {
      expect(LocaleConfigSchema.parse(locale)).toEqual(locale);
    }
  });

  it("contains exactly en, en-gb, de and pl, all `isLaunch`", () => {
    expect(LOCALES.map((locale) => locale.code)).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
    ]);
    for (const locale of LOCALES)
      expect(locale.isLaunch, locale.code).toBe(true);
    expect(launchLocales).toEqual(["en", "en-gb", "de", "pl"]);
  });

  it("makes `en` the x-default and the fallback-chain terminus", () => {
    expect(xDefaultLocale).toBe("en");
    expect(defaultLocale).toBe("en");
    expect(localeConfig("en").hreflangAliases).toContain("x-default");
    expect(localeConfig("en").fallbackCode).toBeNull();
    for (const code of ["en-gb", "de", "pl"] as const) {
      expect(localeConfig(code).fallbackCode, code).toBe("en");
    }
  });

  it("gives every locale a known default currency, an `Intl`-parsable bcp47 tag and `latn` digits", () => {
    const known: ReadonlySet<string> = new Set(CURRENCY_CODES);
    for (const locale of LOCALES) {
      expect(known.has(locale.currencyDefault), locale.code).toBe(true);
      expect(new Intl.Locale(locale.bcp47).baseName).toBe(locale.bcp47);
      expect(new Intl.Locale(locale.formattingTag).baseName).toBe(
        locale.formattingTag,
      );
      expect(locale.numberingSystem, locale.code).toBe("latn");
      expect(locale.dir, locale.code).toBe("ltr");
      expect(locale.name.length, locale.code).toBeGreaterThan(0);
      expect(locale.nativeName.length, locale.code).toBeGreaterThan(0);
    }
    expect(
      LOCALES.map((locale) => [locale.code, locale.currencyDefault]),
    ).toEqual([
      ["en", "EUR"],
      ["en-gb", "GBP"],
      ["de", "EUR"],
      ["pl", "PLN"],
    ]);
  });

  it("serves the plan/02 §3 hreflang alias set, unique across locales", () => {
    expect(localeConfig("en").hreflangAliases).toEqual([
      "en",
      "x-default",
      "en-IE",
      "en-NL",
      "en-150",
    ]);
    expect(localeConfig("en-gb").hreflangAliases).toEqual(["en-GB"]);
    expect(localeConfig("de").hreflangAliases).toEqual([
      "de",
      "de-DE",
      "de-AT",
    ]);
    expect(localeConfig("pl").hreflangAliases).toEqual(["pl", "pl-PL"]);

    const all = LOCALES.flatMap((locale) =>
      locale.hreflangAliases.map((alias) => alias.toLowerCase()),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("authors the plan/02 §4.1 path segments per locale, lowercase ASCII and unique", () => {
    expect(localeConfig("en").pathSegments).toEqual({
      destinations: "send-flowers-to",
      shopCategory: "flowers",
      occasions: "occasions",
      product: "product",
      blog: "blog",
      forFlorists: "for-florists",
      legal: "legal",
    });
    expect(localeConfig("de").pathSegments).toEqual({
      destinations: "blumen-verschicken",
      shopCategory: "blumen",
      occasions: "anlaesse",
      product: "produkt",
      blog: "blog",
      forFlorists: "fuer-floristen",
      legal: "rechtliches",
    });
    expect(localeConfig("pl").pathSegments).toEqual({
      destinations: "wyslij-kwiaty",
      shopCategory: "kwiaty",
      occasions: "okazje",
      product: "produkt",
      blog: "blog",
      forFlorists: "dla-kwiaciarni",
      legal: "regulamin",
    });
    // `en-gb` is the English column of plan/02 §4.1, identical to `en`.
    expect(localeConfig("en-gb").pathSegments).toEqual(
      localeConfig("en").pathSegments,
    );

    for (const locale of LOCALES) {
      const segments = PATH_SEGMENT_KEYS.map((key) => locale.pathSegments[key]);
      expect(
        segments.every((segment) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(segment)),
        locale.code,
      ).toBe(true);
      expect(new Set(segments).size, locale.code).toBe(segments.length);
    }
  });

  it("rejects a duplicate locale code, naming the field", () => {
    const registry = registryCopy();
    registry[2] = { ...registry[2], code: "en-gb" };
    expect(issueSummary(registry)).toMatch(/code/);
    expect(issueSummary(registry)).toMatch(/duplicate/i);
  });

  it("rejects a cyclic fallback chain, naming the field", () => {
    const registry = registryCopy();
    registry[0] = { ...registry[0], fallbackCode: "de" };
    const summary = issueSummary(registry);
    expect(summary).toMatch(/fallbackCode/);
    expect(summary).toMatch(/cycl|terminat/i);
  });

  it("rejects an unresolvable fallback code, naming the field", () => {
    const registry = registryCopy();
    registry[3] = { ...registry[3], fallbackCode: "fr" };
    const summary = issueSummary(registry);
    expect(summary).toMatch(/fallbackCode/);
    expect(summary).toMatch(/fr/);
  });

  it("rejects an unknown default currency, naming the field", () => {
    const registry = registryCopy();
    registry[3] = { ...registry[3], currencyDefault: "XXX" };
    const summary = issueSummary(registry);
    expect(summary).toMatch(/currencyDefault/);
  });

  it("rejects a bcp47 tag Intl.Locale will not accept, naming the field", () => {
    const registry = registryCopy();
    registry[1] = { ...registry[1], bcp47: "en_GB!" };
    expect(issueSummary(registry)).toMatch(/bcp47/);
  });

  it("rejects a direction outside {ltr, rtl}, naming the field", () => {
    const registry = registryCopy();
    registry[2] = { ...registry[2], dir: "sideways" };
    expect(issueSummary(registry)).toMatch(/dir/);
  });

  it("rejects a path segment duplicated within one locale, naming the field", () => {
    const registry = registryCopy();
    const segments = {
      ...(registry[2]?.["pathSegments"] as Record<string, string>),
      occasions: "blumen",
    };
    registry[2] = { ...registry[2], pathSegments: segments };
    const summary = issueSummary(registry);
    expect(summary).toMatch(/pathSegments/);
    expect(summary).toMatch(/blumen/);
  });

  it("rejects a path segment that is uppercase, non-ASCII or trailing-slashed", () => {
    for (const bad of ["Okazje", "wyślij-kwiaty", "okazje/", "/okazje"]) {
      const registry = registryCopy();
      const segments = {
        ...(registry[3]?.["pathSegments"] as Record<string, string>),
        occasions: bad,
      };
      registry[3] = { ...registry[3], pathSegments: segments };
      expect(issueSummary(registry), bad).toMatch(/pathSegments/);
    }
  });

  it("rejects a registry with no x-default and one with two", () => {
    const none = registryCopy();
    none[0] = { ...none[0], hreflangAliases: ["en", "en-IE"] };
    expect(issueSummary(none)).toMatch(/x-default/);

    const two = registryCopy();
    two[3] = { ...two[3], hreflangAliases: ["pl", "pl-PL", "x-default"] };
    expect(issueSummary(two)).toMatch(/x-default/);
  });

  it("rejects an hreflang alias claimed by two locales", () => {
    const registry = registryCopy();
    registry[1] = { ...registry[1], hreflangAliases: ["en-GB", "de-AT"] };
    expect(issueSummary(registry)).toMatch(/hreflangAliases/);
  });
});

describe("formattingTag (TASK-044)", () => {
  it("defaults to `bcp47` for every locale that omits it", () => {
    // `en` is the only locale that writes the field; the other three inherit their own `bcp47`.
    for (const code of ["en-gb", "de", "pl"] as const) {
      const locale = localeConfig(code);
      expect(locale.formattingTag, code).toBe(locale.bcp47);
    }
    const en = localeConfig("en");
    expect(en.bcp47).toBe("en");
    expect(en.formattingTag).toBe("en-150");
  });

  it("applies the default and the refinements to an authored locale that omits the field", () => {
    const authored = JSON.parse(JSON.stringify(localeConfig("de"))) as Record<
      string,
      unknown
    >;
    delete authored["formattingTag"];
    expect(LocaleConfigSchema.parse(authored)).toEqual({
      ...authored,
      formattingTag: "de",
    });
  });

  it("rejects a formattingTag Intl.Locale will not accept, naming the field", () => {
    const registry = registryCopy();
    registry[2] = { ...registry[2], formattingTag: "de_DE!" };
    const summary = issueSummary(registry);
    expect(summary).toMatch(/formattingTag/);
    expect(summary).toMatch(/de_DE!/);
  });

  it("rejects a non-canonical formattingTag ICU would rewrite", () => {
    const registry = registryCopy();
    registry[1] = { ...registry[1], formattingTag: "en-gb" };
    expect(issueSummary(registry)).toMatch(/formattingTag/);
  });

  it("rejects a formattingTag whose primary language differs from `bcp47`", () => {
    // `de-150` on `en` would format English pages with German conventions and call it English.
    const registry = registryCopy();
    registry[0] = { ...registry[0], formattingTag: "de-150" };
    const summary = issueSummary(registry);
    expect(summary).toMatch(/formattingTag/);
    expect(summary).toMatch(/primary language subtag/);
    expect(summary).toMatch(/`en`/);
    expect(summary).toMatch(/`de`/);
  });

  it("accepts a region-only refinement of the same language", () => {
    const registry = registryCopy();
    registry[0] = { ...registry[0], formattingTag: "en-IE" };
    expect(LocaleRegistrySchema.safeParse(registry).success).toBe(true);
  });
});

describe("toLocaleRow (AC-4 / T-04)", () => {
  it("returns exactly spec 002 §5.1's `locale` column set", () => {
    // `formatting_tag` is the column spec 002 §5.1 gains for the TASK-044 split; the pin is
    // updated deliberately here so the seed of TASK-015 and this projection stay one edit.
    expect([...LOCALE_ROW_COLUMNS]).toEqual([
      "code",
      "bcp47",
      "formatting_tag",
      "name",
      "is_launch",
      "rtl",
      "fallback_code",
    ]);
    for (const locale of LOCALES) {
      const row = toLocaleRow(locale);
      expect(Object.keys(row), locale.code).toEqual([...LOCALE_ROW_COLUMNS]);
    }
  });

  it("maps `dir` to `rtl` and keeps a null fallback null", () => {
    expect(toLocaleRow(localeConfig("en"))).toEqual({
      code: "en",
      bcp47: "en",
      formatting_tag: "en-150",
      name: "English",
      is_launch: true,
      rtl: false,
      fallback_code: null,
    });
    expect(toLocaleRow(localeConfig("pl")).formatting_tag).toBe("pl");
    expect(toLocaleRow(localeConfig("pl")).fallback_code).toBe("en");
    expect(toLocaleRow(localeConfig("pl")).rtl).toBe(false);
  });
});
