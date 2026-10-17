/**
 * T-34 — the fixture barrel's reserved exports are filled and typed (spec 002 AC-34; TASK-026).
 *
 * `occasionDates` carries 2026–2027 for PL, DE and GB including the five `plan/09` dates (with
 * Mothering Sunday 2027 at its verified 7 March, `tests/fixtures/occasions.ts`'s correction of
 * `plan/13` D6); `currencies` covers every seeded currency in every launch locale with the
 * exponent `Intl` uses; `addresses` and `phones` hold valid and invalid PL, DE and GB cases; the
 * slug rows fold Polish diacritics to ASCII the way the seed does.
 */
import { describe, expect, it } from "vitest";

import { asciiFoldSlug } from "../../seed/copy.ts";
import { CURRENCIES } from "../../src/config/currencies.ts";
import {
  addresses,
  currencies,
  occasionDates,
  phones,
  slugTransliterations,
} from "../fixtures/index.ts";

const LAUNCH_TAGS = ["en-150", "en-GB", "de", "pl"] as const;
const CORPUS = ["PL", "DE", "GB"] as const;

describe("T-34 — the shared fixtures (AC-34)", () => {
  it("occasionDates covers 2026 and 2027 for PL, DE and GB", () => {
    for (const country of CORPUS) {
      for (const year of ["2026", "2027"]) {
        expect(
          occasionDates.some(
            (row) => row.country === country && row.date.startsWith(year),
          ),
          `${country} ${year}`,
        ).toBe(true);
      }
    }
  });

  it.each([
    ["valentines", "PL", "2027-02-14"],
    ["womens-day", "PL", "2027-03-08"],
    ["mothers-day", "GB", "2027-03-07"],
    ["mothers-day", "DE", "2027-05-09"],
    ["mothers-day", "PL", "2027-05-26"],
  ])(
    "occasionDates holds the plan/09 date %s %s %s",
    (occasion, country, date) => {
      const found = occasionDates.find(
        (row) =>
          row.occasion === occasion &&
          row.country === country &&
          row.date === date,
      );
      expect(found, `${occasion} ${country} ${date}`).toBeDefined();
    },
  );

  it("currencies covers every seeded currency in every launch locale", () => {
    for (const { code } of CURRENCIES) {
      for (const tag of LAUNCH_TAGS) {
        expect(
          currencies.some((row) => row.code === code && row.locale === tag),
          `${code} in ${tag}`,
        ).toBe(true);
      }
    }
  });

  it("every seeded currency's minor-unit exponent is the one Intl formats with", () => {
    for (const { code, minorUnitExponent } of CURRENCIES) {
      const digits = new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
      }).resolvedOptions().maximumFractionDigits;
      expect(digits, code).toBe(minorUnitExponent);
    }
  });

  it("every currency row is integer minor units and a formatted string", () => {
    for (const row of currencies) {
      expect(Number.isInteger(row.amount_minor), row.code).toBe(true);
      expect(row.formatted.length, row.code).toBeGreaterThan(0);
    }
  });

  it("addresses and phones hold a valid and an invalid case for PL, DE and GB", () => {
    for (const country of CORPUS) {
      for (const corpus of [addresses, phones]) {
        const rows = (
          corpus as readonly { country: string; invalid?: boolean }[]
        ).filter((row) => row.country === country);
        expect(
          rows.some((row) => row.invalid !== true),
          country,
        ).toBe(true);
        expect(
          rows.some((row) => row.invalid === true),
          country,
        ).toBe(true);
      }
    }
  });

  it.each(slugTransliterations)(
    "folds $name to the ASCII slug $slug",
    ({ name, slug }) => {
      expect(asciiFoldSlug(name)).toBe(slug);
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/u);
    },
  );
});
