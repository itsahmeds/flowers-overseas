/**
 * The shop crawl's pinned target set, derived a second way (spec 008 AC-21; TASK-113; `/review 98`
 * round 2, nit on `TARGETS`).
 *
 * `tests/e2e/shop-reachability.spec.ts` requires the committed existence set, counted by page
 * type, to equal `TARGETS` exactly. That catches a fixture that loses pages, but on its own it
 * leaves the literals with one witness: whoever typed them. So the same counts are derived here
 * from **the predicate and the raw catalogue**, by a path that shares nothing with the fixture's
 * enumerator (`listingPages()`, `copyRows()`, `publishedCountries()`):
 *
 *   every catalogue category and occasion (`staticCatalogueProvider`) × every country in the
 *   registry, published or not, each asked of `listingExists()` one identity at a time.
 *
 * The result, with `EXCLUDED` applied the way the crawl applies it, must equal `TARGETS`. A pin
 * typed wrong is red here and red in the crawl. A catalogue change that moves a count is red here
 * first, and the fixture and the pin move in the same commit.
 */
import { describe, expect, it } from "vitest";

import { COUNTRIES } from "../../src/config/countries.ts";
import {
  type ListingIdentity,
  listingExists,
  listingLocales,
} from "../../src/modules/catalog";
import { staticCatalogueProvider } from "../../src/modules/catalog/static/index.ts";
import {
  EXCLUDED,
  TARGETS,
  isExcluded,
} from "../support/shop-crawl-targets.ts";

const categories = await staticCatalogueProvider.categories();
const occasions = await staticCatalogueProvider.occasions();

/** Every identity a listing page could have in one locale, before the predicate is asked. */
function candidates(locale: ListingIdentity["locale"]): ListingIdentity[] {
  const out: ListingIdentity[] = [{ pageType: "occasionsIndex", locale }];
  for (const category of categories) {
    out.push({ pageType: "categoryHub", locale, entityKey: category.key });
  }
  for (const occasion of occasions) {
    out.push({ pageType: "occasionHub", locale, entityKey: occasion.key });
  }
  for (const { iso2 } of COUNTRIES) {
    out.push({ pageType: "countryShopRoot", locale, countryIso: iso2 });
    for (const category of categories) {
      out.push({
        pageType: "countryCategory",
        locale,
        countryIso: iso2,
        entityKey: category.key,
      });
    }
    for (const occasion of occasions) {
      out.push({
        pageType: "countryOccasion",
        locale,
        countryIso: iso2,
        entityKey: occasion.key,
      });
    }
  }
  return out;
}

/** The crawl's target counts for one locale, by page type, as `listingExists()` answers them. */
async function derivedTargets(
  locale: ListingIdentity["locale"],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const identity of candidates(locale)) {
    if (isExcluded(locale, identity.pageType)) continue;
    if (!(await listingExists(identity))) continue;
    counts[identity.pageType] = (counts[identity.pageType] ?? 0) + 1;
  }
  return counts;
}

describe("the crawl's pinned targets equal an independent count (AC-21)", () => {
  it("asks a real catalogue and registry", () => {
    // A derivation over nothing would equal an empty pin, so the inputs are asserted non-empty.
    expect(categories.length).toBeGreaterThan(0);
    expect(occasions.length).toBeGreaterThan(0);
    expect(COUNTRIES.length).toBeGreaterThan(0);
    expect(EXCLUDED.length).toBeGreaterThan(0);
  });

  it("pins exactly the listing locales", () => {
    expect(Object.keys(TARGETS).sort()).toEqual([...listingLocales()].sort());
  });

  for (const locale of listingLocales()) {
    it(`${locale}: TARGETS equals listingExists() over catalogue × registry`, async () => {
      expect(await derivedTargets(locale)).toEqual(TARGETS[locale]);
    });
  }
});
