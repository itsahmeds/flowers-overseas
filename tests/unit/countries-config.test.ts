/**
 * `src/config/countries.ts` (spec 004 §2 "Everything data-gated is config", §5.1, §13 Q12;
 * TASK-047).
 *
 * Three things are pinned here because a later spec reads them rather than restating them:
 *
 *  1. **the destination set** — the seven of spec 004 §13 Q12, in the order the founder-approved
 *     destinations grid draws them, with PL as the one `live` row;
 *  2. **the projection's column list against spec 002 §5.1 itself** — the test parses the
 *     `country(...)` definition out of `specs/002-schema-v1.md` and requires every column
 *     `toCountryRow()` emits to exist there, so TASK-015's migration and TASK-026's seed cannot
 *     drift from this config in either direction (spec 004 §5.1's contract);
 *  3. **the refusals** — a corridor page published for a country that is neither live nor
 *     guide-published, a city list on a country we do not deliver to, a mismatched name key, a
 *     duplicate slug inside one locale. Each is a way the layout could claim something untrue or
 *     link to a non-200 URL (spec 004 AC-14, `plan/10` §3).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COUNTRIES,
  COUNTRY_CODES,
  COUNTRY_ROW_COLUMNS,
  CountryConfigSchema,
  CountryRegistrySchema,
  countryConfig,
  countrySlug,
  countryRegions,
  countryStatuses,
  countriesInRegion,
  destinationStateKey,
  regionHeadingKey,
  isCorridorPagePublished,
  isCountryIso2,
  isGuidePublished,
  toCountryRow,
} from "../../src/config/countries.ts";
import { launchLocales } from "../../src/config/locales.ts";

/** Spec 004 §13 Q12 / `plan/13` A7, in the canvas's grid order. */
const CANVAS_DESTINATIONS = ["PL", "DE", "FR", "ES", "IT", "RO", "NL"] as const;

const valid = {
  iso2: "PT",
  status: "demo",
  region: "westernSouthernEurope",
  nameKey: "destinations.pt.name",
  slugs: Object.fromEntries(launchLocales.map((code) => [code, "portugal"])),
  corridorPagePublished: false,
  guidePublished: false,
};

describe("src/config/countries.ts", () => {
  it("holds the seven Phase 0 destinations in the canvas's grid order", () => {
    expect([...COUNTRY_CODES]).toEqual([...CANVAS_DESTINATIONS]);
  });

  it("delivers to Poland and treats the other six as guide + not-delivering", () => {
    expect(countryConfig("PL").status).toBe("live");
    for (const iso2 of CANVAS_DESTINATIONS.filter((code) => code !== "PL")) {
      expect(countryConfig(iso2).status, iso2).toBe("demo");
    }
  });

  it("restates spec 002 §5.1's `country.status` enum verbatim", () => {
    expect([...countryStatuses]).toEqual(["demo", "live", "disabled"]);
  });

  it("publishes every guide and every corridor page (spec 007 AC-7, AC-20)", () => {
    for (const country of COUNTRIES) {
      // TASK-091 flipped `guidePublished` on all seven: the `en` and `en-gb` guides are authored
      // and parsed, and this flag *is* `plan/02` §5.1's existence rule, so the corridor URLs
      // exist because of it (spec 007 AC-5, AC-7).
      expect(isGuidePublished(country.iso2), country.iso2).toBe(true);
      // TASK-092 flipped `corridorPagePublished`: the registry half of "this destination may be
      // linked". A link is still rendered only where the `site-links.ts` corridor id is published
      // **and** the page exists in that locale, which is why `/de` and `/pl` stay text.
      expect(isCorridorPagePublished(country.iso2), country.iso2).toBe(true);
    }
  });

  it("groups every destination into one of the hub's three regions (spec 007 §5.3)", () => {
    // The founder's 2026-09-15 ruling (b), in the hub's own order.
    expect(countriesInRegion("centralEurope").map((c) => c.iso2)).toEqual([
      "PL",
      "DE",
      "NL",
    ]);
    expect(
      countriesInRegion("westernSouthernEurope").map((c) => c.iso2),
    ).toEqual(["FR", "ES", "IT"]);
    expect(countriesInRegion("southEasternEurope").map((c) => c.iso2)).toEqual([
      "RO",
    ]);
    // Every destination is in exactly one group: the hub can neither drop nor double-count one.
    expect(
      countryRegions.flatMap((region) => countriesInRegion(region)).length,
    ).toBe(COUNTRIES.length);
    // The heading is a message key, never a literal (§7).
    expect(regionHeadingKey("centralEurope")).toBe(
      "destinationsHub.region.centralEurope",
    );
  });

  it("refuses a destination with no region, or with a region the hub does not draw", () => {
    const noRegion = Object.fromEntries(
      Object.entries(valid).filter(([field]) => field !== "region"),
    );
    expect(CountryConfigSchema.safeParse(noRegion).success).toBe(false);
    expect(
      CountryConfigSchema.safeParse({ ...valid, region: "oceania" }).success,
    ).toBe(false);
  });

  it("carries one slug per launch locale, unique inside each locale", () => {
    for (const country of COUNTRIES) {
      expect(Object.keys(country.slugs).sort(), country.iso2).toEqual(
        [...launchLocales].sort(),
      );
    }
    for (const locale of launchLocales) {
      const slugs = COUNTRIES.map((country) =>
        countrySlug(country.iso2, locale),
      );
      expect(new Set(slugs).size, locale).toBe(slugs.length);
    }
    // `plan/02` §4.2's worked examples, verbatim.
    expect(countrySlug("PL", "en")).toBe("poland");
    expect(countrySlug("PL", "de")).toBe("polen");
    expect(countrySlug("PL", "pl")).toBe("polska");
  });

  it("names every country through a `destinations.*` message key, never a literal", () => {
    for (const country of COUNTRIES) {
      expect(country.nameKey, country.iso2).toBe(
        `destinations.${country.iso2.toLowerCase()}.name`,
      );
    }
    expect(countryConfig("PL").citiesKey).toBe("destinations.pl.cities");
  });

  it("maps a destination's status onto the canvas's two state keys", () => {
    expect(destinationStateKey(countryConfig("PL"))).toBe(
      "destinations.state.deliveringNow",
    );
    expect(destinationStateKey(countryConfig("DE"))).toBe(
      "destinations.state.guideNotDelivering",
    );
  });

  it("looks a destination up by code and rejects an unknown one", () => {
    expect(isCountryIso2("PL")).toBe(true);
    expect(isCountryIso2("XX")).toBe(false);
    // @ts-expect-error — an unknown code is a type error as well as a runtime throw.
    expect(() => countryConfig("XX")).toThrow(/XX/);
  });

  it("rejects a malformed row: code shape, unknown status, missing slug, stray field", () => {
    for (const [field, patch] of [
      ["iso2", { iso2: "pl" }],
      ["iso2", { iso2: "POL" }],
      ["status", { status: "coming-soon" }],
      ["nameKey", { nameKey: "countries.pt.name" }],
      ["slugs", { slugs: { en: "portugal" } }],
      ["slugs", { slugs: { ...valid.slugs, en: "Portugal" } }],
    ] as const) {
      const result = CountryConfigSchema.safeParse({ ...valid, ...patch });
      expect(result.success, JSON.stringify(patch)).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.map((issue) => issue.path.join(".")).join(" "),
          JSON.stringify(patch),
        ).toContain(field);
      }
    }
    expect(
      CountryConfigSchema.safeParse({ ...valid, sundayDelivery: "none" })
        .success,
    ).toBe(false);
  });

  it("refuses a nameKey that belongs to another country", () => {
    const result = CountryConfigSchema.safeParse({
      ...valid,
      nameKey: "destinations.de.name",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/destinations\.pt\.name/);
    }
  });

  it("refuses a corridor page for a country that is neither live nor guide-published", () => {
    const result = CountryConfigSchema.safeParse({
      ...valid,
      corridorPagePublished: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/thin content/);
    }
    // Publishing the guide makes it legitimate.
    expect(
      CountryConfigSchema.safeParse({
        ...valid,
        corridorPagePublished: true,
        guidePublished: true,
      }).success,
    ).toBe(true);
  });

  it("refuses a city list on a destination we do not deliver to (plan/10 §3)", () => {
    const result = CountryConfigSchema.safeParse({
      ...valid,
      citiesKey: "destinations.pt.cities",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(
        /only a live destination/,
      );
    }
  });

  it("refuses a duplicate code and a slug two destinations share in one locale", () => {
    const duplicateCode = CountryRegistrySchema.safeParse([valid, valid]);
    expect(duplicateCode.success).toBe(false);

    const sharedSlug = CountryRegistrySchema.safeParse([
      valid,
      { ...valid, iso2: "IE", nameKey: "destinations.ie.name" },
    ]);
    expect(sharedSlug.success).toBe(false);
    if (!sharedSlug.success) {
      expect(
        sharedSlug.error.issues.map((issue) => issue.message).join(" "),
      ).toMatch(/already used by/);
    }
  });
});

describe("toCountryRow() against spec 002 §5.1", () => {
  /** The `country(...)` column list, read out of the spec so the pin cannot be faked here. */
  const specColumns = (() => {
    const spec = readFileSync(
      resolve(__dirname, "../../specs/002-schema-v1.md"),
      "utf8",
    );
    const match = /`country\(([^`]*)\)`/.exec(spec);
    if (match?.[1] === undefined)
      throw new Error("no `country(...)` in spec 002 §5.1");
    return match[1]
      .split(",")
      .map((part) => part.trim().split(/[\s(]/)[0] ?? "")
      .filter((name) => /^[a-z_][a-z0-9_]*$/.test(name));
  })();

  it("projects only Phase 0 columns, and every one of them exists in spec 002 §5.1", () => {
    expect([...COUNTRY_ROW_COLUMNS]).toEqual([
      "iso2",
      "status",
      "guide_published",
    ]);
    for (const column of COUNTRY_ROW_COLUMNS) {
      expect(specColumns, column).toContain(column);
    }
  });

  it("leaves the operational columns to the spec that owns their data", () => {
    // These exist on spec 002's table and are deliberately **not** projected: a fabricated
    // cutoff or VAT rate in a seed is worse than a missing one (spec 004 §5.1).
    for (const column of [
      "currency_code",
      "vat_rate_bp",
      "iana_zone",
      "same_day_cutoff_local",
    ]) {
      expect(specColumns, column).toContain(column);
      expect([...COUNTRY_ROW_COLUMNS], column).not.toContain(column);
    }
  });

  it("emits exactly the pinned keys for every destination", () => {
    for (const country of COUNTRIES) {
      const row = toCountryRow(country);
      expect(Object.keys(row), country.iso2).toEqual([...COUNTRY_ROW_COLUMNS]);
      expect(row).toEqual({
        iso2: country.iso2,
        status: country.status,
        guide_published: country.guidePublished,
      });
    }
  });
});
