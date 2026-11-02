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
 * The category hubs the header links in each listing locale, as literal paths: the hubs the crawl
 * now **must** reach. TASK-173's category row linked three (spec 008 §14 A14 (a)); the mega menu
 * that replaced it (spec 004 §14 A-founder-2026-10-24a item 5; TASK-383) links those three and ten
 * more out of context, under By type, By flower and Plants & gifts. The other ten are
 * occasion-kind category hubs item 5's table does not list. Literal rather than derived from the
 * menu's model, so a header that stops linking one is red here, not absorbed.
 */
export const HEADER_CATEGORY_HUBS: Readonly<Record<string, readonly string[]>> =
  {
    en: [
      "/en/flowers/hand-tied-bouquets",
      "/en/flowers/roses",
      "/en/flowers/plants",
      "/en/flowers/arrangements",
      "/en/flowers/flowers-and-gift-sets",
      "/en/flowers/funeral-and-sympathy-flowers",
      "/en/flowers/gerberas",
      "/en/flowers/lilies",
      "/en/flowers/mixed-flowers",
      "/en/flowers/orchids",
      "/en/flowers/peonies",
      "/en/flowers/sunflowers",
      "/en/flowers/tulips",
    ],
    "en-gb": [
      "/en-gb/flowers/hand-tied-bouquets",
      "/en-gb/flowers/roses",
      "/en-gb/flowers/plants",
      "/en-gb/flowers/arrangements",
      "/en-gb/flowers/flowers-and-gift-sets",
      "/en-gb/flowers/funeral-and-sympathy-flowers",
      "/en-gb/flowers/gerberas",
      "/en-gb/flowers/lilies",
      "/en-gb/flowers/mixed-flowers",
      "/en-gb/flowers/orchids",
      "/en-gb/flowers/peonies",
      "/en-gb/flowers/sunflowers",
      "/en-gb/flowers/tulips",
    ],
    de: [
      "/de/blumen/blumenstraeusse",
      "/de/blumen/rosen",
      "/de/blumen/pflanzen",
      "/de/blumen/blumen-mit-geschenk",
      "/de/blumen/blumengestecke",
      "/de/blumen/gemischte-blumen",
      "/de/blumen/gerbera",
      "/de/blumen/lilien",
      "/de/blumen/orchideen",
      "/de/blumen/pfingstrosen",
      "/de/blumen/sonnenblumen",
      "/de/blumen/trauerfloristik",
      "/de/blumen/tulpen",
    ],
    pl: [
      "/pl/kwiaty/bukiety",
      "/pl/kwiaty/roze",
      "/pl/kwiaty/rosliny",
      "/pl/kwiaty/bukiety-mieszane",
      "/pl/kwiaty/gerbery",
      "/pl/kwiaty/kompozycje-kwiatowe",
      "/pl/kwiaty/kwiaty-pogrzebowe",
      "/pl/kwiaty/kwiaty-z-prezentem",
      "/pl/kwiaty/lilie",
      "/pl/kwiaty/piwonie",
      "/pl/kwiaty/sloneczniki",
      "/pl/kwiaty/storczyki",
      "/pl/kwiaty/tulipany",
    ],
  };

/**
 * The orphans this crawl found and could not close inside AC-20's "exactly the five link ids".
 * Each was an open question in `docs/tasks/TASK-113.md` §Escalations with a reason, and each is
 * asserted by the crawl to be a non-empty set — a waiver that covered nothing would be a way of
 * making the gate pass by describing it. **TASK-173 (spec 008 §14 A14) closed two and narrowed the
 * third:** the header's category row now links the demo destination's shop root and three
 * category hubs from every document, so the crawl's reach grew and the waiver shrank.
 *
 *  1. **`categoryHub`, every locale, minus the thirteen the header links**
 *     (`HEADER_CATEGORY_HUBS`). Spec 008 §2 reserves five link ids and none publishes a
 *     country-less category hub; TASK-173's category row was the first publisher, for three of
 *     the twenty-three, and TASK-383's mega menu links thirteen. The other ten, occasion-kind
 *     category hubs, still have no inbound edge.
 *  2. **Closed by TASK-173.** `countryShopRoot` in `de` and `pl`. The shop root's only inbound link in §2's plan is
 *     the **corridor page**, and neither locale has one: their guides are machine drafts, so
 *     `corridorPageExists()` is false for every destination there. Seven URLs each, all
 *     `noindex,follow` and in no sitemap (the locale is not indexable), so the cost today is
 *     reachability and not ranking — but it is a hole, and it is named rather than hidden.
 *     The header's "Our selection" now links `/de/polen/blumen` and `/pl/polska/kwiaty` from
 *     every document, and the shop root's destination picker reaches the other six.
 *  3. **Closed by TASK-173.** `countryCategory` in `de` and `pl` (TASK-106, the same hole one
 *     level down; reached through the shop roots of escalation 2). Once
 *     TASK-106 authored their category slugs, 140 country categories per locale exist, and their
 *     inbound links are the shop root (escalation 2) and sibling-category chips on other country
 *     categories. The crawl of PR #150 (run 37115230193) reached 38 documents from `/de` and none
 *     of these. They close with escalation 2: the day a `de`/`pl` shop root gains an inbound
 *     edge, both rules expire together (`waivedButReached` goes red). Recorded in
 *     `docs/tasks/TASK-106.md` §Escalations.
 *
 * Everything else — non-200, a link into an unpublished id, a malformed `href` — applies to every
 * page in every locale with no exception at all.
 */
export const EXCLUDED: readonly {
  readonly locale?: string;
  readonly pageType: string;
  /** Pages of this type the rule does **not** cover, per locale: they must be reached. */
  readonly exceptPaths?: Readonly<Record<string, readonly string[]>>;
}[] = [{ pageType: "categoryHub", exceptPaths: HEADER_CATEGORY_HUBS }];

export function isExcluded(
  locale: string,
  pageType: string,
  path: string,
): boolean {
  return EXCLUDED.some(
    (rule) =>
      rule.pageType === pageType &&
      (rule.locale === undefined || rule.locale === locale) &&
      !(rule.exceptPaths?.[locale] ?? []).includes(path),
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
 * `de` and `pl` carry `en`'s set since TASK-106 authored their category and occasion slugs
 * (spec 008 §13 Q10), and since TASK-173 the crawl must reach all of it there too: the header's
 * "Our selection" gave their shop roots and country categories an inbound edge. Spec 008
 * A-founder-2026-10-21c (TASK-316) moved `countryOccasion` from 7 to 59: its Appendix A tags put
 * every observed (occasion, destination) pair over the floor, and the shop root's date table and
 * the chip rows link each one.
 */
export const TARGETS: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = {
  // TASK-173: every locale carries the whole shop now; TASK-383: plus the mega menu's thirteen
  // category hubs.
  en: {
    countryShopRoot: PUBLISHED_DESTINATIONS,
    countryCategory: 140,
    countryOccasion: 59,
    categoryHub: 13,
    occasionHub: 28,
    occasionsIndex: 1,
  },
  "en-gb": {
    countryShopRoot: PUBLISHED_DESTINATIONS,
    countryCategory: 140,
    countryOccasion: 59,
    categoryHub: 13,
    occasionHub: 28,
    occasionsIndex: 1,
  },
  de: {
    countryShopRoot: PUBLISHED_DESTINATIONS,
    countryCategory: 140,
    countryOccasion: 59,
    categoryHub: 13,
    occasionHub: 28,
    occasionsIndex: 1,
  },
  pl: {
    countryShopRoot: PUBLISHED_DESTINATIONS,
    countryCategory: 140,
    countryOccasion: 59,
    categoryHub: 13,
    occasionHub: 28,
    occasionsIndex: 1,
  },
};

/**
 * The pages `EXCLUDED` waives, **exactly**, per locale and per page type (`/break 98` round 1,
 * hole 1).
 *
 * `EXCLUDED` is a rule, and a rule covers whatever matches it: a twenty-fourth category, or an
 * eighth published destination, would join the waiver with no diff anywhere. So the set it covers
 * is pinned here as the literal it is today, and a waiver that grows is red until someone types
 * the new number. Unlike `TARGETS`' shop roots, nothing is derived from the registry: a target set
 * that grows with the registry is the criterion keeping up, and a waiver that grows with it is the
 * criterion shrinking unseen.
 *
 * The crawl still reads the links **on** every one of these pages (they are fetched after the
 * walk), so a waiver excuses only the missing inbound edge, never a broken outbound one.
 * `tests/unit/shop-crawl-targets.test.ts` derives the same counts from `listingExists()`.
 */
export const WAIVED: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = {
  // TASK-173 shrank every locale's waiver to the twenty category hubs nothing linked then;
  // TASK-383's mega menu links ten more per locale, leaving the ten occasion-kind category hubs
  // item 5's table does not list.
  en: { categoryHub: 10 },
  "en-gb": { categoryHub: 10 },
  de: { categoryHub: 10 },
  pl: { categoryHub: 10 },
};
