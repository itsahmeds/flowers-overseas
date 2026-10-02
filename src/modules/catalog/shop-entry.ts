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
import { isPublished, listingLinkId } from "@/config/site-links";
import { corridorSlug } from "@/modules/geo";
import { listingPath } from "@/modules/i18n";

import { listingExists } from "./listing";

/**
 * The corridor page's shop-entry href for one destination, or `undefined` while the site may not
 * link into the shop or this destination has no shop root in this locale.
 *
 * Returned as `CorridorLiveSlots`-shaped data rather than a bare string so the route's one
 * composition line stays one line as spec 005's `fromPrice` joins it in Phase 1.
 */
export async function corridorShopEntry(
  locale: string,
  iso2: CountryIso2 | string,
): Promise<{ readonly shopEntryHref?: string }> {
  if (!isCountryIso2(iso2)) return {};
  if (!isPublished(listingLinkId("countryShopRoot"))) return {};
  const exists = await listingExists({
    pageType: "countryShopRoot",
    locale,
    countryIso: iso2,
  });
  if (!exists) return {};
  return {
    shopEntryHref: listingPath(locale, {
      pageType: "countryShopRoot",
      country: corridorSlug(iso2, locale),
    }),
  };
}
