/**
 * The country → locale suggestion table (spec 003 §14 A14, AC-1's shape applied to a second
 * registry; TASK-119).
 *
 * Two doors on one set of rows, exactly as `locales.data.ts`/`locales.ts` have: the constants the
 * browser-side decision function reads, and the zod parse the server runs at module load. The
 * tests below are the reason that split is safe — they pin the table itself, prove the parse
 * rejects each way a row can be wrong, and prove the two doors answer the same question.
 */
import { describe, expect, it } from "vitest";

import {
  COUNTRY_LOCALE_DATA,
  DEFAULT_COUNTRY_LOCALE,
  MAPPED_COUNTRY_CODES,
  NON_COUNTRY_CODES,
  localeForCountry,
} from "../../src/config/country-locale.data.ts";
import {
  COUNTRY_LOCALES,
  COUNTRY_LOCALE_FALLBACK,
  CountryLocaleTableSchema,
  localeForMappedCountry,
  suggestionCountries,
} from "../../src/config/country-locale.ts";
import { LAUNCH_LOCALE_CODES } from "../../src/config/locales.data.ts";

describe("the table spec 003 §14 A14 names", () => {
  it("maps exactly the countries the amendment lists, to the locales it lists", () => {
    expect(COUNTRY_LOCALE_DATA).toEqual({
      AT: "de",
      CH: "de",
      DE: "de",
      GB: "en-gb",
      IE: "en-gb",
      PL: "pl",
    });
    expect(DEFAULT_COUNTRY_LOCALE).toBe("en");
  });

  it("targets only launch locales, so no suggestion can offer a URL that 404s", () => {
    for (const target of [
      ...Object.values(COUNTRY_LOCALE_DATA),
      DEFAULT_COUNTRY_LOCALE,
    ]) {
      expect(LAUNCH_LOCALE_CODES, target).toContain(target);
    }
  });

  it("exposes the mapped countries sorted, and the parsed half agrees", () => {
    expect(MAPPED_COUNTRY_CODES).toEqual(["AT", "CH", "DE", "GB", "IE", "PL"]);
    expect(suggestionCountries()).toEqual(MAPPED_COUNTRY_CODES);
    expect(COUNTRY_LOCALES).toEqual(COUNTRY_LOCALE_DATA);
    expect(COUNTRY_LOCALE_FALLBACK).toBe(DEFAULT_COUNTRY_LOCALE);
    for (const country of MAPPED_COUNTRY_CODES) {
      expect(localeForMappedCountry(country)).toBe(
        COUNTRY_LOCALE_DATA[country],
      );
    }
    expect(localeForMappedCountry("FR")).toBeUndefined();
  });
});

describe("the schema rejects each way a row can be wrong", () => {
  it("refuses a key that is not an ISO 3166-1 alpha-2 code", () => {
    for (const key of ["de", "DEU", "D", "D1", "", "DE "]) {
      const result = CountryLocaleTableSchema.safeParse({ [key]: "de" });
      expect(result.success, key).toBe(false);
      expect(JSON.stringify(result.error?.issues), key).toContain(
        "ISO 3166-1 alpha-2",
      );
    }
  });

  it("refuses the edge network's non-country answers as keys", () => {
    for (const key of NON_COUNTRY_CODES) {
      const result = CountryLocaleTableSchema.safeParse({ [key]: "en" });
      expect(result.success, key).toBe(false);
      expect(JSON.stringify(result.error?.issues), key).toContain("no country");
    }
  });

  it("refuses a target that is not a launch locale", () => {
    for (const target of ["fr", "en-XA", "EN", "de-DE"]) {
      const result = CountryLocaleTableSchema.safeParse({ DE: target });
      expect(result.success, target).toBe(false);
      expect(JSON.stringify(result.error?.issues), target).toContain(
        "launch locale",
      );
    }
  });

  it("accepts the shipped table", () => {
    expect(
      CountryLocaleTableSchema.safeParse(COUNTRY_LOCALE_DATA).success,
    ).toBe(true);
  });
});

describe("localeForCountry — the lookup the browser runs", () => {
  it("answers the mapped locale for a mapped country", () => {
    expect(localeForCountry("DE")).toBe("de");
    expect(localeForCountry("AT")).toBe("de");
    expect(localeForCountry("CH")).toBe("de");
    expect(localeForCountry("PL")).toBe("pl");
    expect(localeForCountry("GB")).toBe("en-gb");
    expect(localeForCountry("IE")).toBe("en-gb");
  });

  it("answers the x-default locale for every country the table does not name", () => {
    for (const country of ["FR", "ES", "US", "JP", "NL"]) {
      expect(localeForCountry(country), country).toBe("en");
    }
  });

  it("normalises case and surrounding space, because a header is not a promise", () => {
    expect(localeForCountry("de")).toBe("de");
    expect(localeForCountry(" pl ")).toBe("pl");
  });

  it("answers `null` — never the default — for anything that is not a country", () => {
    for (const value of [
      null,
      undefined,
      "",
      "D",
      "DEU",
      "12",
      "XX",
      "T1",
      42,
      {},
      ["DE"],
    ]) {
      expect(localeForCountry(value), JSON.stringify(value)).toBeNull();
    }
  });
});
