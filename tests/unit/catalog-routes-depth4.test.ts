/**
 * The **depth-4 resolver** — the country category and the country occasion, which share one route
 * file and therefore one resolver (spec 008 §2 rows 7 and 8, §14 **A5**, **AC-1**, AC-3; T-01;
 * TASK-110, TASK-111).
 *
 * `resolveLocalePath()` is what `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx` calls
 * and the only thing it calls, so every shape AC-1 requires to 404 is observable here without a
 * server: an unknown slug, a **below-floor** category or occasion, one the destination does not
 * observe, another locale's segment, another locale's slug, an uppercase variant, an unpublished
 * country and an unknown locale. The served half — the status codes, the absent `Location` header
 * and the trailing-slash 308 — is `tests/e2e/country-category.spec.ts` and
 * `tests/e2e/country-occasion.spec.ts`.
 *
 * The set this file reads is `localeGrandchildParams()`, which is `listingPages()` filtered to the
 * two page types that share the depth: `generateStaticParams` emits exactly it and
 * `dynamicParams = false`, so "everything else is a 404" is a property of the router rather than
 * of a branch someone could delete. The two page types are asserted **together** because the one
 * thing a shared resolver can get wrong is answering for the wrong sibling.
 */
import { describe, expect, it } from "vitest";

import {
  listingPages,
  localeGrandchildParams,
  resolveLocalePath,
} from "../../src/modules/catalog";

const params = await localeGrandchildParams();

/** The rows of one page type, by the segment the URL carries in `en`/`en-gb`. */
const rowsFor = (child: "flowers" | "occasions") =>
  params.filter((row) => row.child === child);

describe("the prebuilt set (AC-3)", () => {
  it("is non-empty and well-formed on every row", () => {
    expect(params.length).toBeGreaterThan(0);
    for (const row of params) {
      expect(row.locale.length, JSON.stringify(row)).toBeGreaterThan(1);
      expect(row.segment.length, JSON.stringify(row)).toBeGreaterThan(0);
      expect(row.child.length, JSON.stringify(row)).toBeGreaterThan(0);
      expect(row.grandchild.length, JSON.stringify(row)).toBeGreaterThan(0);
    }
  });

  it("holds no duplicate URL across the two page types that share the depth", () => {
    const urls = params.map(
      (row) => `/${row.locale}/${row.segment}/${row.child}/${row.grandchild}`,
    );
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("carries both page types, and each row resolves to its own", async () => {
    // The whole set, not a sample: `dynamicParams = false` means this list *is* the 200 set, so a
    // row that resolved to `notFound` would be a prebuilt 404, and a row that resolved to the
    // *sibling* page type would be a page rendered from the wrong view model.
    expect(rowsFor("flowers").length).toBeGreaterThan(0);
    expect(rowsFor("occasions").length).toBeGreaterThan(0);

    for (const row of params) {
      const match = await resolveLocalePath(row.locale, [
        row.segment,
        row.child,
        row.grandchild,
      ]);
      expect(
        match.kind,
        `/${row.locale}/${row.segment}/${row.child}/${row.grandchild}`,
      ).toBe(row.child === "flowers" ? "countryCategory" : "countryOccasion");
    }
  });

  it("is exactly the depth-4 rows of `listingPages()` and nothing more", async () => {
    const expected: string[] = [];
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      for (const page of await listingPages(locale)) {
        if (
          page.pageType !== "countryCategory" &&
          page.pageType !== "countryOccasion"
        ) {
          continue;
        }
        expected.push(page.path);
      }
    }
    expect(
      [
        ...params.map(
          ({ locale, segment, child, grandchild }) =>
            `/${locale}/${segment}/${child}/${grandchild}`,
        ),
      ].sort(),
    ).toEqual([...expected].sort());
  });
});

describe("what each branch carries", () => {
  it("the country category carries the slugs the URL spells, not the catalogue keys", async () => {
    const match = await resolveLocalePath("en", ["poland", "flowers", "roses"]);
    expect(match).toEqual({
      kind: "countryCategory",
      locale: "en",
      iso2: "PL",
      countrySlug: "poland",
      categorySlug: "roses",
    });
  });

  it("the country occasion carries the catalogue key beside the slug", async () => {
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
});

describe("every shape AC-1 requires to be a miss", () => {
  const MISSES: readonly (readonly [string, readonly string[], string])[] = [
    // A category below `PRODUCT_COUNT_FLOOR`: orchids has 3 products in Poland and sunflowers 4,
    // so neither has a URL in any locale (§13 Q7). This is the one 404 shape that is a *count*.
    ["en", ["poland", "flowers", "orchids"], "below the six-product floor"],
    ["en", ["poland", "flowers", "sunflowers"], "below the six-product floor"],
    ["en", ["poland", "flowers", "orchidee"], "an unknown category slug"],
    ["en", ["atlantis", "flowers", "roses"], "an unknown country slug"],
    ["en", ["belgium", "flowers", "roses"], "a country we do not serve"],
    ["en", ["poland", "blumen", "roses"], "another locale's page segment"],
    ["en", ["polska", "flowers", "roses"], "another locale's country slug"],
    ["pl", ["poland", "flowers", "roses"], "another locale's URL entirely"],
    ["en", ["poland", "Flowers", "roses"], "an uppercase segment"],
    ["en", ["poland", "flowers", "Roses"], "an uppercase slug"],
    ["en", ["Poland", "flowers", "roses"], "an uppercase country slug"],
    ["fr", ["poland", "flowers", "roses"], "an unknown locale"],
    ["en", ["send-flowers-to", "poland", "roses"], "the corridor, one deeper"],
    // The occasion half of the same list. An occasion below the floor, one the destination does
    // not observe at all, and the casing and cross-locale shapes again — the sibling branch has
    // its own `resolveSlug()` namespace and must miss for the same reasons.
    [
      "en",
      ["poland", "occasions", "all-saints-day"],
      "an observed occasion below the floor",
    ],
    [
      "en",
      ["poland", "occasions", "womens-day"],
      "an observed occasion below the floor",
    ],
    [
      "en",
      ["france", "occasions", "name-day"],
      "an occasion that destination does not observe",
    ],
    ["en", ["poland", "occasions", "arbor-day"], "an unknown occasion slug"],
    ["en", ["atlantis", "occasions", "mothers-day"], "an unknown country slug"],
    [
      "en",
      ["belgium", "occasions", "mothers-day"],
      "a country we do not serve",
    ],
    [
      "en",
      ["poland", "anlaesse", "mothers-day"],
      "another locale's page segment",
    ],
    [
      "en",
      ["polska", "occasions", "mothers-day"],
      "another locale's country slug",
    ],
    ["en", ["Poland", "occasions", "mothers-day"], "an uppercase country slug"],
    ["en", ["poland", "Occasions", "mothers-day"], "an uppercase segment"],
    ["en", ["poland", "occasions", "Mothers-Day"], "an uppercase slug"],
    ["fr", ["poland", "occasions", "mothers-day"], "an unknown locale"],
    // The one shape only a **shared** resolver can get wrong: an entity that exists in the other
    // namespace, under this segment. Roses is a category, not an occasion, and Mother's Day is an
    // occasion, not a category, so each is a 404 under the sibling's segment.
    [
      "en",
      ["poland", "occasions", "roses"],
      "a category slug under the occasions segment",
    ],
    [
      "en",
      ["poland", "flowers", "mothers-day"],
      "an occasion slug under the shop-category segment",
    ],
  ];

  for (const [locale, segments, why] of MISSES) {
    it(`/${locale}/${segments.join("/")} — ${why}`, async () => {
      const match = await resolveLocalePath(locale, segments);
      expect(match).toEqual({ kind: "notFound" });
    });
  }

  it("has no authored category or occasion slug in `de` or `pl`, so those URLs do not exist (§13 Q10)", async () => {
    // Not a defect: the ~31 category and occasion slugs are human-authored per locale and never
    // machine-drafted (TASK-106 authors them). A locale with no slug has no page there and
    // contributes no `hreflang` alternate — which is why the set below is empty rather than an
    // English echo.
    expect(params.filter((row) => row.locale === "de")).toEqual([]);
    expect(params.filter((row) => row.locale === "pl")).toEqual([]);
    expect(
      (await resolveLocalePath("de", ["polen", "blumen", "rosen"])).kind,
    ).toBe("notFound");
    expect(
      (await resolveLocalePath("de", ["polen", "anlaesse", "muttertag"])).kind,
    ).toBe("notFound");
    expect(
      (await resolveLocalePath("pl", ["polska", "okazje", "dzien-matki"])).kind,
    ).toBe("notFound");
  });
});
