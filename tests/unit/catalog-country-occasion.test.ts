/**
 * The country occasion, as data (spec 008 §2 row 8, §5.2, §12 task 7 — the country half of
 * **AC-11** — and §14 **A10**; T-01's resolver half, T-11's unit half; TASK-111).
 *
 * Three properties are provable here and nowhere else:
 *
 *  - **the dated line is `occasionDate`'s answer for *that* destination** (AC-11, T-11), checked
 *    against a hand-computed table for 2026–2030 rather than against the function that produced
 *    it: the fixtures below were worked out from the committed rule (`seed/data/occasion-country`)
 *    with an independent calendar, so a regression in the rule evaluator fails here;
 *  - **which URLs exist** (AC-1): `resolveLocalePath()` answers the country occasion for exactly
 *    the existence set and `notFound` for every other shape — an unknown slug, an occasion below
 *    the six-product floor, one the destination does not observe, another locale's segment, a
 *    casing variant, a locale with no authored slug, an unknown locale;
 *  - **the shop root's third column** (§14 **A10**): a row carries an `href` exactly when the
 *    (occasion, country) pair has a page, so the column can never link at a URL that 404s.
 */
import { describe, expect, it } from "vitest";

import {
  type ListingPageRecord,
  listingPages,
  listingView,
  localeGrandchildParams,
  resolveLocalePath,
} from "../../src/modules/catalog";
import { observedUndatedOccasions } from "../../src/modules/geo";

/** A fixed window start, so an assertion about a date does not depend on the day it runs. */
const FROM = "2026-09-15";

/**
 * Mother's Day in each destination, 2026–2030, computed from the committed rule by hand:
 * PL a fixed 26 May, DE/IT/NL the second Sunday of May, ES/RO the first, FR the last
 * (`seed/data/occasion-country.json`). This table is the fixture T-11 asks for — it is not read
 * from the evaluator, so the two can disagree and the test says so.
 */
const MOTHERS_DAY: Readonly<Record<string, Readonly<Record<number, string>>>> =
  {
    poland: {
      2026: "2026-05-26",
      2027: "2027-05-26",
      2028: "2028-05-26",
      2029: "2029-05-26",
      2030: "2030-05-26",
    },
    germany: {
      2026: "2026-05-10",
      2027: "2027-05-09",
      2028: "2028-05-14",
      2029: "2029-05-13",
      2030: "2030-05-12",
    },
    italy: {
      2026: "2026-05-10",
      2027: "2027-05-09",
      2028: "2028-05-14",
      2029: "2029-05-13",
      2030: "2030-05-12",
    },
    netherlands: {
      2026: "2026-05-10",
      2027: "2027-05-09",
      2028: "2028-05-14",
      2029: "2029-05-13",
      2030: "2030-05-12",
    },
    spain: {
      2026: "2026-05-03",
      2027: "2027-05-02",
      2028: "2028-05-07",
      2029: "2029-05-06",
      2030: "2030-05-05",
    },
    romania: {
      2026: "2026-05-03",
      2027: "2027-05-02",
      2028: "2028-05-07",
      2029: "2029-05-06",
      2030: "2030-05-05",
    },
    france: {
      2026: "2026-05-31",
      2027: "2027-05-30",
      2028: "2028-05-28",
      2029: "2029-05-27",
      2030: "2030-05-26",
    },
  };

const occasionPages = async (locale: string): Promise<ListingPageRecord[]> =>
  (await listingPages(locale as "en")).filter(
    (page) => page.pageType === "countryOccasion",
  );

describe("the existence set (AC-1, T-01)", () => {
  it("is every observed occasion above the floor with an authored slug, and nothing else", async () => {
    // Mother's Day clears six tagged products in all seven destinations; nothing else does. `de`
    // and `pl` have no authored occasion slug yet (TASK-106), so they have no page at all — which
    // is §2's "and an authored slug" and §13 Q10's "the pages appear as data".
    expect((await occasionPages("en")).map((page) => page.path)).toEqual([
      "/en/poland/occasions/mothers-day",
      "/en/germany/occasions/mothers-day",
      "/en/france/occasions/mothers-day",
      "/en/spain/occasions/mothers-day",
      "/en/italy/occasions/mothers-day",
      "/en/romania/occasions/mothers-day",
      "/en/netherlands/occasions/mothers-day",
    ]);
    expect(await occasionPages("de")).toEqual([]);
    expect(await occasionPages("pl")).toEqual([]);
  });

  it("is exactly what `generateStaticParams` emits at depth 4 (AC-3)", async () => {
    const params = await localeGrandchildParams();
    const expected = [
      ...(await occasionPages("en")),
      ...(await occasionPages("en-gb")),
    ].map(
      (page) =>
        `/${page.locale}/${page.countrySlug ?? ""}/occasions/${page.slug ?? ""}`,
    );
    expect(
      params.map(
        ({ locale, segment, child, grandchild }) =>
          `/${locale}/${segment}/${child}/${grandchild}`,
      ),
    ).toEqual(expected);
  });
});

describe("`resolveLocalePath()` at depth 4 (AC-1, T-01)", () => {
  it("resolves the country occasion, carrying the key rather than the slug", async () => {
    const match = await resolveLocalePath("en", [
      "poland",
      "occasions",
      "mothers-day",
    ]);
    expect(match).toEqual({
      kind: "countryOccasion",
      locale: "en",
      iso2: "PL",
      countrySlug: "poland",
      occasionKey: "mothers_day",
      occasionSlug: "mothers-day",
    });
  });

  it("answers `notFound` for every shape AC-1 lists", async () => {
    for (const segments of [
      // an occasion the destination observes that is below the six-product floor
      ["poland", "occasions", "all-saints-day"],
      ["poland", "occasions", "womens-day"],
      // an occasion this destination does not observe at all
      ["france", "occasions", "name-day"],
      // an unknown slug and an unknown destination
      ["poland", "occasions", "arbor-day"],
      ["atlantis", "occasions", "mothers-day"],
      // a country we do not deliver to
      ["belgium", "occasions", "mothers-day"],
      // another locale's segment, and another locale's country slug
      ["poland", "anlaesse", "mothers-day"],
      ["polska", "occasions", "mothers-day"],
      // a casing variant — slugs are authored lowercase and nothing folds case (ADR-0006)
      ["Poland", "occasions", "mothers-day"],
      ["poland", "Occasions", "mothers-day"],
      ["poland", "occasions", "Mothers-Day"],
      // the shop-category segment at this depth is the country **category** (TASK-110)
      ["poland", "flowers", "roses"],
    ]) {
      expect(
        await resolveLocalePath("en", segments),
        segments.join("/"),
      ).toEqual({
        kind: "notFound",
      });
    }
  });

  it("answers `notFound` in a locale with no authored occasion slug, and in an unknown locale", async () => {
    expect(
      await resolveLocalePath("de", ["polen", "anlaesse", "muttertag"]),
    ).toEqual({ kind: "notFound" });
    expect(
      await resolveLocalePath("pl", ["polska", "okazje", "dzien-matki"]),
    ).toEqual({ kind: "notFound" });
    expect(
      await resolveLocalePath("fr", ["poland", "occasions", "mothers-day"]),
    ).toEqual({ kind: "notFound" });
  });
});

describe("the dated line (AC-11's country half, T-11)", () => {
  for (const [country, byYear] of Object.entries(MOTHERS_DAY)) {
    it(`${country}: the date is the destination's own, 2026–2030`, async () => {
      for (const [year, expected] of Object.entries(byYear)) {
        const view = await listingView(
          {
            locale: "en",
            pageType: "countryOccasion",
            country,
            entity: "mothers-day",
          },
          { from: `${year}-01-01` },
        );
        expect(view, `${country} ${year}`).toBeDefined();
        // One row: the destination this page is for, and no other country's date on it.
        expect(view?.occasionDates, `${country} ${year}`).toHaveLength(1);
        expect(view?.occasionDates?.[0]?.date, `${country} ${year}`).toBe(
          expected,
        );
      }
    });
  }

  it("names the destination on the row, so a renderer cannot mislabel it", async () => {
    const view = await listingView(
      {
        locale: "en",
        pageType: "countryOccasion",
        country: "poland",
        entity: "mothers-day",
      },
      { from: FROM },
    );
    expect(view?.occasionDates?.[0]?.iso2).toBe("PL");
    expect(view?.occasionDates?.[0]?.nameKey).toBe("destinations.pl.name");
  });

  it("leaves an occasion with rule `none` undated rather than guessing (§14 Q6)", async () => {
    // Poland's name day is observed with rule `none`; Romania's Orthodox Easter left this list
    // when TASK-122 gave it a rule (spec 009 AC-12), so the Western date is not reused for it.
    expect(observedUndatedOccasions("PL")).toEqual(["name_day"]);
    expect(observedUndatedOccasions("RO")).toEqual([]);
    // It is not dated anywhere it is printed: the shop root's table carries only dated rows.
    const root = await listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { from: FROM },
    );
    expect(root?.occasionDates?.some((row) => row.date === null)).toBe(false);
    expect(root?.occasionDates?.map((row) => row.nameKey)).not.toContain(
      "catalog.facet.occasion.nameDay",
    );
  });
});

describe("the shop root's third column (§14 A10)", () => {
  it("carries an `href` for exactly the rows whose page exists", async () => {
    const view = await listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { from: FROM },
    );
    const linked = (view?.occasionDates ?? []).filter(
      (row) => row.href !== undefined,
    );
    expect(linked.map((row) => row.href)).toEqual([
      "/en/poland/occasions/mothers-day",
    ]);
    // Everything else is an empty cell, not a placeholder: All Saints' Day is the largest flower
    // day of the Polish year and has five tagged products, so it prints its date and no link.
    expect((view?.occasionDates ?? []).length).toBeGreaterThan(1);
  });

  it("never links at a URL outside the existence set, in any locale", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const paths = new Set(
        (await listingPages(locale)).map((page) => page.path),
      );
      for (const country of ["poland", "polen", "polska"]) {
        const view = await listingView(
          { locale, pageType: "countryShopRoot", country },
          { from: FROM },
        );
        for (const row of view?.occasionDates ?? []) {
          if (row.href === undefined) continue;
          expect(paths.has(row.href), `${locale} ${row.href}`).toBe(true);
        }
      }
    }
  });
});

describe("the page's own links (§2 'Links')", () => {
  it("resolves the shop root and no link to a page that does not exist", async () => {
    const view = await listingView(
      {
        locale: "en",
        pageType: "countryOccasion",
        country: "poland",
        entity: "mothers-day",
      },
      { from: FROM },
    );
    expect(view?.links.shopRoot).toBe("/en/poland/flowers");
    // TASK-113 has not built the occasions index and its link id is unpublished, so the page
    // carries no href for it — existence is not permission (spec 004 AC-14).
    expect(view?.links.occasionsIndex).toBeUndefined();
    expect(
      view?.breadcrumb.find(
        (crumb) => crumb.labelKey === "breadcrumb.occasions",
      )?.href,
    ).toBeUndefined();
  });

  it("cannot be empty: the existence rule keeps six products behind every page", async () => {
    for (const locale of ["en", "en-gb"] as const) {
      for (const page of await occasionPages(locale)) {
        const view = await listingView(
          {
            locale,
            pageType: "countryOccasion",
            country: page.countrySlug ?? "",
            entity: page.slug ?? "",
          },
          { from: FROM },
        );
        expect(view?.items.length, page.path).toBeGreaterThanOrEqual(6);
        expect(view?.hubItems, page.path).toEqual([]);
      }
    }
  });
});
