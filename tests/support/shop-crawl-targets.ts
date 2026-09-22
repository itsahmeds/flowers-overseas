/**
 * The shop crawl's waivers and its pinned target set (spec 008 AC-21; TASK-113), shared by
 * `tests/e2e/shop-reachability.spec.ts`, which crawls against them, and
 * `tests/unit/shop-crawl-targets.test.ts`, which derives the same counts from `listingExists()`.
 *
 * It is a module of its own because the two runners cannot share a file any other way: the crawl
 * cannot import `modules/catalog` (Playwright's ESM loader stops at its `next/dynamic` import),
 * and Vitest cannot import a Playwright spec. So this file imports nothing but the country
 * registry, which both can load.
 */
import { COUNTRIES } from "../../src/config/countries.ts";

/**
 * The **two** orphans this crawl found and could not close inside AC-20's "exactly the five link
 * ids". Each is an open question in `docs/tasks/TASK-113.md` §Escalations with a reason, and each
 * is asserted by the crawl to be a non-empty set — a waiver that covered nothing would be a way of
 * making the gate pass by describing it.
 *
 *  1. **`categoryHub`, every locale.** Spec 008 §2 reserves five link ids and none publishes a
 *     country-less category hub; no page type in the spec links to one either. The rows that
 *     could are the header's category row in `src/config/categories.ts` — spec 004's registry,
 *     owned by no task in spec 008.
 *  2. **`countryShopRoot` in `de` and `pl`.** The shop root's only inbound link in §2's plan is
 *     the **corridor page**, and neither locale has one: their guides are machine drafts, so
 *     `corridorPageExists()` is false for every destination there. Seven URLs each, all
 *     `noindex,follow` and in no sitemap (the locale is not indexable), so the cost today is
 *     reachability and not ranking — but it is a hole, and it is named rather than hidden.
 *
 * Everything else — non-200, a link into an unpublished id, a malformed `href` — applies to every
 * page in every locale with no exception at all.
 */
export const EXCLUDED: readonly {
  readonly locale?: string;
  readonly pageType: string;
}[] = [
  { pageType: "categoryHub" },
  { locale: "de", pageType: "countryShopRoot" },
  { locale: "pl", pageType: "countryShopRoot" },
];

export function isExcluded(locale: string, pageType: string): boolean {
  return EXCLUDED.some(
    (rule) =>
      rule.pageType === pageType &&
      (rule.locale === undefined || rule.locale === locale),
  );
}

/**
 * How many destinations the registry publishes (`status === "live" || guidePublished`, spec 008
 * §2's rule, restated from the one source it reads). The shop-root count is **derived** from it:
 * every published destination has a shop root in a locale with a shop, so the day an eighth
 * country is published this number moves with it and nothing here needs re-typing.
 */
export const PUBLISHED_DESTINATIONS = COUNTRIES.filter(
  (country) => country.status === "live" || country.guidePublished,
).length;

/**
 * The crawl's target set, **exactly**, per locale and per page type (`/review 98` round 1,
 * required change 5).
 *
 * It used to be a floor (`>= 180`), and a floor let three deleted `en` country categories pass:
 * 180 ≥ 180, green, while three pages had dropped out of the criterion unseen. So each count is
 * the one value it has today. The shop root is derived from the registry above. The other four
 * are literals, and they are **not** taken from the existence set, which is the crawl's subject:
 * `tests/unit/shop-crawl-targets.test.ts` derives every count a second way, asking
 * `listingExists()` about every catalogue category and occasion × every registry country (not
 * `listingPages()`'s enumeration and not the fixture), and requires this table to equal it after
 * `EXCLUDED` is applied (`/review 98` round 2, nit). A wrong pin is red there and red in the
 * crawl. When the catalogue grows, both go red, the fixture is regenerated, and this table is
 * re-pinned in the same commit, which is the diff a reviewer should see.
 *
 * `de` and `pl` are empty: every URL they have is a shop root, and both are escalated.
 */
export const TARGETS: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = {
  en: {
    countryShopRoot: PUBLISHED_DESTINATIONS,
    countryCategory: 140,
    countryOccasion: 7,
    occasionHub: 28,
    occasionsIndex: 1,
  },
  "en-gb": {
    countryShopRoot: PUBLISHED_DESTINATIONS,
    countryCategory: 140,
    countryOccasion: 7,
    occasionHub: 28,
    occasionsIndex: 1,
  },
  de: {},
  pl: {},
};
