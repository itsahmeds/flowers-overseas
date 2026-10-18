/**
 * **The corridor page's shop entry** — spec 007 §2 "Internal links", spec 008 §2 "Links", AC-20;
 * TASK-113.
 *
 * Spec 007 built the slot and left it empty: `CorridorLiveSlots.shopEntryHref` is "the shop
 * entry's target, when its link id is published **and** the target exists", supplied by the
 * caller because `src/modules/geo` may not read the catalogue (spec 007 §5.2, `plan/01` §5 — the
 * dependency runs catalog → geo, and reversing it would be a cycle). Nothing supplied it, so
 * until now every corridor page rendered no shop entry at all: on 2026-09-22 production's
 * `/en/send-flowers-to/poland` carried four internal links and **not one** of them reached
 * `/en/poland/flowers`, a page that had been live since PR #89. 294 shop URLs were orphans.
 *
 * This is the one function that closes that. It is deliberately **not** in `listing.ts`: it
 * composes two answers that already exist and invents no third rule.
 *
 *  1. `isPublished(listingLinkId("countryShopRoot"))` — *may* the site point at a country shop
 *     root at all? The AC-20 data flip, asked the one way spec 004 §5.1 allows.
 *  2. `listingExists({ pageType: "countryShopRoot", … })` — *does* this destination's shop root
 *     exist in this locale? The same predicate `generateStaticParams`, the sitemap builders and
 *     the AC-21 crawl read, so a link can never point at a URL the router will not serve.
 *
 * Both must hold. Either failing returns `undefined`, and `CorridorPage` renders the section not
 * at all — no heading, no disabled button, no "coming soon" (spec 004 AC-14, spec 007 AC-17).
 *
 * The URL is `listingPath()`'s, the one builder, so the href and the route agree about where the
 * destination slug goes (`plan/02` §4.1's country-first shop URL).
 *
 * Nothing here reads a cookie, a header, the clock or a database.
 */
import { type CountryIso2, isCountryIso2 } from "@/config/countries";
import { isLocaleCode } from "@/config/locales";
import { isPublished, listingLinkId } from "@/config/site-links";
import { type CorridorShopChip, corridorSlug } from "@/modules/geo";
import { listingPath, sortBy } from "@/modules/i18n";

import { copyRow, copyRows } from "./copy";
import { listingExists } from "./listing";
import { countProductsIn } from "./read";
import { slugFor } from "./slugs";

/**
 * How many country categories the state-B chip row carries (spec 007 §2 "up to 6 country
 * categories", §14 A10). The shop has twenty; the six are the ones with the most products in the
 * destination, ties broken by the corpus's own order, so the row names the shelves a buyer is most
 * likely to want and is the same on every build. The occasions are not capped: spec 007 says "the
 * indexable country occasions", and the existence rule already keeps that set short.
 */
export const CORRIDOR_CHIP_CATEGORY_LIMIT = 6;

/** The chip row's two families, as `site-links.ts` ids and as `listingExists()` page types. */
const FAMILIES = [
  { family: "category", pageType: "countryCategory" },
  { family: "occasion", pageType: "countryOccasion" },
] as const;

/**
 * The state-B chip row for one destination: each family asked of its own link id
 * (`isPublished(listingLinkId(…))`, the gate `listingView()` puts on the same links) **and** of
 * `listingExists()`, the predicate the router, the sitemap and the crawl read. Either failing
 * drops the chip, and a family with no chip left leaves no trace. Categories come first, then
 * occasions, each family in the locale's collation.
 */
async function corridorShopChips(
  locale: string,
  iso2: CountryIso2,
): Promise<readonly CorridorShopChip[]> {
  if (!isLocaleCode(locale)) return [];
  const chips: CorridorShopChip[] = [];
  for (const { family, pageType } of FAMILIES) {
    if (!isPublished(listingLinkId(pageType))) continue;
    const found: { chip: CorridorShopChip; count: number }[] = [];
    for (const row of copyRows(family, locale)) {
      const slug = slugFor(family, row.key, locale);
      if (slug === undefined) continue;
      const exists = await listingExists({
        pageType,
        locale,
        countryIso: iso2,
        entityKey: row.key,
      });
      if (!exists) continue;
      found.push({
        count: family === "category" ? await countProductsIn(row.key, iso2) : 0,
        chip: {
          family,
          key: row.key,
          name: copyRow(family, row.key, locale)?.name ?? row.key,
          href: listingPath(locale, {
            pageType,
            country: corridorSlug(iso2, locale),
            slug,
          }),
        },
      });
    }
    // `Array.prototype.sort` is stable, so equal counts keep the corpus's order.
    const kept =
      family === "category"
        ? [...found]
            .sort((a, b) => b.count - a.count)
            .slice(0, CORRIDOR_CHIP_CATEGORY_LIMIT)
        : found;
    chips.push(
      ...sortBy(
        kept.map((entry) => entry.chip),
        locale,
        (chip) => chip.name,
      ),
    );
  }
  return chips;
}

/**
 * The corridor page's shop-entry href for one destination, or `undefined` while the site may not
 * link into the shop or this destination has no shop root in this locale.
 *
 * Returned as `CorridorLiveSlots`-shaped data rather than a bare string so the route's one
 * composition line stays one line as spec 005's `fromPrice` joins it in Phase 1.
 *
 * `{ chips: true }` adds the state-B chip row (`shopChips`): up to six country categories and the
 * country occasions that exist, each family behind its own link id (spec 007 §14 A10; TASK-147).
 * It never returns chips without the shop-root link: the row lives in that link's section.
 */
export async function corridorShopEntry(
  locale: string,
  iso2: CountryIso2 | string,
  options: { readonly chips?: boolean } = {},
): Promise<{
  readonly shopEntryHref?: string;
  readonly shopChips?: readonly CorridorShopChip[];
}> {
  if (!isCountryIso2(iso2)) return {};
  if (!isPublished(listingLinkId("countryShopRoot"))) return {};
  const exists = await listingExists({
    pageType: "countryShopRoot",
    locale,
    countryIso: iso2,
  });
  if (!exists) return {};
  const shopEntryHref = listingPath(locale, {
    pageType: "countryShopRoot",
    country: corridorSlug(iso2, locale),
  });
  if (options.chips !== true) return { shopEntryHref };
  // The state-B chip row (spec 007 §14 A10; TASK-147) is asked for by the one caller that renders
  // it. The home grid and the send route read the href alone and pay for nothing else.
  const shopChips = await corridorShopChips(locale, iso2);
  return shopChips.length === 0
    ? { shopEntryHref }
    : { shopEntryHref, shopChips };
}
