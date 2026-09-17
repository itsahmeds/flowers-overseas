/**
 * `localePath`, `parseLocaleFromPath` and `isLaunchLocale` (TASK-034: the routing half of AC-6 and
 * AC-8, and the builder half of AC-13 whose `i18n:check` counterpart lands in TASK-040).
 *
 * The failure cases are the point: an uppercase or unknown locale is not "normalised", it is
 * rejected — because `/EN` must 404 rather than serve a duplicate of `/en` (spec 003 §6
 * "Canonical"), and a hand-shaped trailing segment must not be able to produce a URL the canonical
 * rule would reject.
 */
import { describe, expect, it } from "vitest";

import { listingPageTypes } from "../../src/modules/catalog";
import type { ListingTarget } from "../../src/modules/i18n";
import {
  isLaunchLocale,
  launchLocale,
  launchLocaleCodes,
  listingPath,
  localePath,
  parseLocaleFromPath,
  productPath,
} from "../../src/modules/i18n";

describe("isLaunchLocale (AC-8)", () => {
  it("accepts exactly the configured launch codes", () => {
    for (const code of ["en", "en-gb", "de", "pl"]) {
      expect(isLaunchLocale(code), code).toBe(true);
    }
  });

  it("rejects unknown, mis-cased and empty segments without case folding", () => {
    for (const code of ["fr", "xx", "EN", "En", "en-GB", "nope", "", "de/"]) {
      expect(isLaunchLocale(code), code).toBe(false);
    }
    expect(isLaunchLocale(undefined)).toBe(false);
  });

  it("returns the config for a launch locale and undefined otherwise", () => {
    expect(launchLocale("de")?.bcp47).toBe("de");
    expect(launchLocale("fr")).toBeUndefined();
    expect(launchLocaleCodes()).toEqual(["en", "en-gb", "de", "pl"]);
  });
});

describe("localePath (AC-13)", () => {
  it("builds the locale root", () => {
    expect(localePath("en", "home")).toBe("/en");
    expect(localePath("pl", "home")).toBe("/pl");
  });

  it("uses the locale's own path segment for a page type, never another locale's", () => {
    expect(localePath("en", "destinations")).toBe("/en/send-flowers-to");
    expect(localePath("de", "destinations")).toBe("/de/blumen-verschicken");
    expect(localePath("pl", "destinations")).toBe("/pl/wyslij-kwiaty");
    expect(localePath("de", "legal")).toBe("/de/rechtliches");
    expect(localePath("pl", "occasions")).toBe("/pl/okazje");
  });

  it("appends leaf slugs with no trailing slash", () => {
    expect(localePath("en", "destinations", "poland")).toBe(
      "/en/send-flowers-to/poland",
    );
    expect(localePath("de", "product", "rote-rosen")).toBe(
      "/de/produkt/rote-rosen",
    );
  });

  it("throws on an unknown locale rather than emitting a guessed URL", () => {
    expect(() => localePath("fr", "home")).toThrow(/unknown locale code: fr/);
    expect(() => localePath("EN", "home")).toThrow(/unknown locale code: EN/);
  });

  it("throws on a segment that is not lowercase, ASCII, hyphen-separated and slash-free", () => {
    for (const segment of [
      "Poland",
      "pol/and",
      "poland/",
      "polska ",
      "",
      "łódź",
    ]) {
      expect(() => localePath("en", "destinations", segment), segment).toThrow(
        /must be lowercase ASCII/,
      );
    }
  });
});

describe("parseLocaleFromPath (spec 003 §11)", () => {
  it("splits a localised path into its prefix and the rest", () => {
    expect(parseLocaleFromPath("/en")).toEqual({ locale: "en", rest: "/" });
    expect(parseLocaleFromPath("/en/")).toEqual({ locale: "en", rest: "/" });
    expect(parseLocaleFromPath("/en-gb/send-flowers-to/poland")).toEqual({
      locale: "en-gb",
      rest: "/send-flowers-to/poland",
    });
  });

  it("reports no locale for a path that carries none, and never guesses one", () => {
    for (const path of [
      "/",
      "/robots.txt",
      "/api/health",
      "/nope",
      "/EN",
      "/fr/x",
    ]) {
      expect(parseLocaleFromPath(path).locale, path).toBeUndefined();
    }
    expect(parseLocaleFromPath("/nope").rest).toBe("/nope");
  });

  it("ignores a query string, so no query value can reach a log line", () => {
    expect(parseLocaleFromPath("/de/x?email=a@b.c")).toEqual({
      locale: "de",
      rest: "/x",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* The six listing URLs and the PDP pattern (spec 008 §2, AC-1 routing half,   */
/* AC-4; spec 009 §5.2; TASK-105).                                            */
/* -------------------------------------------------------------------------- */

describe("listingPath and productPath (spec 008 §2, T-04)", () => {
  /**
   * The table is spec 008 §2's own, transcribed: one row per page type per launch locale, with the
   * fixed segments taken from `plan/02` §4.1's authored columns. It is written out rather than
   * computed from `pathSegments`, because a test that built the expectation the same way the
   * builder does would pass on a swapped segment.
   */
  const cases = [
    [
      "en",
      { pageType: "countryShopRoot", country: "poland" },
      "/en/poland/flowers",
    ],
    [
      "en-gb",
      { pageType: "countryShopRoot", country: "poland" },
      "/en-gb/poland/flowers",
    ],
    [
      "de",
      { pageType: "countryShopRoot", country: "polen" },
      "/de/polen/blumen",
    ],
    [
      "pl",
      { pageType: "countryShopRoot", country: "polska" },
      "/pl/polska/kwiaty",
    ],
    [
      "en-gb",
      { pageType: "countryCategory", country: "poland", slug: "roses" },
      "/en-gb/poland/flowers/roses",
    ],
    [
      "de",
      { pageType: "countryCategory", country: "polen", slug: "rosen" },
      "/de/polen/blumen/rosen",
    ],
    [
      "en-gb",
      { pageType: "countryOccasion", country: "poland", slug: "womens-day" },
      "/en-gb/poland/occasions/womens-day",
    ],
    [
      "pl",
      { pageType: "countryOccasion", country: "polska", slug: "dzien-kobiet" },
      "/pl/polska/okazje/dzien-kobiet",
    ],
    [
      "en-gb",
      { pageType: "categoryHub", slug: "roses" },
      "/en-gb/flowers/roses",
    ],
    ["de", { pageType: "categoryHub", slug: "rosen" }, "/de/blumen/rosen"],
    [
      "en-gb",
      { pageType: "occasionHub", slug: "mothers-day" },
      "/en-gb/occasions/mothers-day",
    ],
    [
      "pl",
      { pageType: "occasionHub", slug: "dzien-matki" },
      "/pl/okazje/dzien-matki",
    ],
    ["en", { pageType: "occasionsIndex" }, "/en/occasions"],
    ["de", { pageType: "occasionsIndex" }, "/de/anlaesse"],
    ["pl", { pageType: "occasionsIndex" }, "/pl/okazje"],
  ] as const;

  it.each(cases)("builds %s %o as %s", (locale, target, expected) => {
    expect(listingPath(locale, target)).toBe(expected);
  });

  it("covers every page type spec 008 §2 defines", () => {
    expect(new Set(cases.map(([, target]) => target.pageType))).toEqual(
      new Set(listingPageTypes),
    );
  });

  // The two spellings of the same six names: the catalogue module owns the array (a barrel that
  // exports functions and schemas only cannot own a value list), `listingPath()`'s `ListingTarget`
  // owns the type. `satisfies` in both directions makes a seventh page type added to one and not
  // the other a typecheck failure rather than a route that builds no URL.
  it("agrees with ListingTarget's page-type union in both directions", () => {
    const everyValueIsATarget =
      listingPageTypes satisfies readonly ListingTarget["pageType"][];
    const everyTargetIsAValue = (pageType: ListingTarget["pageType"]) =>
      pageType satisfies (typeof listingPageTypes)[number];
    expect(everyValueIsATarget).toBe(listingPageTypes);
    expect(everyTargetIsAValue("occasionsIndex")).toBe("occasionsIndex");
    expect(listingPageTypes).toHaveLength(6);
  });

  it("puts the destination before the page segment on every country-scoped URL", () => {
    for (const [locale, target, expected] of cases) {
      if (!("country" in target)) continue;
      expect(expected.split("/")[2], `${locale} ${expected}`).toBe(
        target.country,
      );
    }
  });

  it("builds the PDP pattern of plan/02 §4.1 in each locale's own segment", () => {
    expect(productPath("en-gb", "poland", "amber-hour")).toBe(
      "/en-gb/poland/product/amber-hour",
    );
    expect(productPath("de", "polen", "amber-hour")).toBe(
      "/de/polen/produkt/amber-hour",
    );
    expect(productPath("pl", "polska", "amber-hour")).toBe(
      "/pl/polska/produkt/amber-hour",
    );
  });

  it("refuses a country or slug segment that is not URL-shaped, rather than emitting it", () => {
    for (const bad of ["Poland", "po land", "poland/", "", "poland?x=1"]) {
      expect(() =>
        listingPath("en", { pageType: "countryShopRoot", country: bad }),
      ).toThrow(/lowercase ASCII/);
      expect(() => productPath("en", "poland", bad)).toThrow(/lowercase ASCII/);
    }
  });

  it("rejects an unknown locale instead of guessing one", () => {
    expect(() => listingPath("fr", { pageType: "occasionsIndex" })).toThrow(
      /unknown locale code/,
    );
  });

  it("keeps the variadic form of localePath working unchanged", () => {
    expect(localePath("en-gb", "destinations", "poland")).toBe(
      "/en-gb/send-flowers-to/poland",
    );
    expect(localePath("de", "home")).toBe("/de");
    expect(localePath("de", { pageType: "home" })).toBe("/de");
  });
});
