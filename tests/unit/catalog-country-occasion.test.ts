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
 *  - **which URLs exist** (AC-1): the existence set is exactly the observed occasions above the
 *    floor with an authored slug. The resolver's own misses — an unknown slug, one below the
 *    floor, one the destination does not observe, another locale's segment, a casing variant, an
 *    unknown locale — are asserted for both depth-4 page types together in
 *    `tests/unit/catalog-routes-depth4.test.ts`, because a shared resolver's one new failure mode
 *    is answering for the sibling page type;
 *  - **the shop root's third column** (§14 **A10**): a row carries an `href` exactly when the
 *    (occasion, country) pair has a page, so the column can never link at a URL that 404s.
 */
import { describe, expect, it } from "vitest";

import {
  type ListingPageRecord,
  listingPages,
  listingView,
  localeGrandchildParams,
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

  it("is exactly the occasion half of what `generateStaticParams` emits (AC-3)", async () => {
    // The depth-4 set is shared with the country category (TASK-110), so the occasions are
    // isolated by their own segment rather than by position — and the assertion is still an
    // equality, not a subset: an occasion URL the prebuild missed is a 404 with `dynamicParams`
    // off, and one it invented is a page the existence rule never claimed.
    const params = await localeGrandchildParams();
    const expected = [
      ...(await occasionPages("en")),
      ...(await occasionPages("en-gb")),
    ].map(
      (page) =>
        `/${page.locale}/${page.countrySlug ?? ""}/occasions/${page.slug ?? ""}`,
    );
    expect(
      params
        .filter((row) => row.child === "occasions")
        .map(
          ({ locale, segment, child, grandchild }) =>
            `/${locale}/${segment}/${child}/${grandchild}`,
        ),
    ).toEqual(expected);
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
    let rows = 0;
    const linked: string[] = [];
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
          rows += 1;
          if (row.href === undefined) continue;
          linked.push(`${locale} ${row.href}`);
          expect(paths.has(row.href), `${locale} ${row.href}`).toBe(true);
        }
      }
    }
    // The view the loop walked, pinned: four shop roots answer (one per locale, each under its
    // own authored country segment — `polen` and `polska` are not `en` URLs), ten observed
    // occasions each, and two of those forty rows carry a link today. Without these the loop
    // could be satisfied by iterating nothing at all.
    expect(rows).toBe(40);
    expect(linked).toEqual([
      "en /en/poland/occasions/mothers-day",
      "en-gb /en-gb/poland/occasions/mothers-day",
    ]);
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
