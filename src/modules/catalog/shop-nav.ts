/**
 * The header in a destination's context (spec 043 §2 A, §5.2, §5.3 A, AC-1, AC-2; TASK-288).
 *
 * On a page whose URL names a destination with a shop, the header's shop items (Our selection,
 * Bouquets, Roses, Plants, Birthday, Sympathy) link to that destination's own priced pages, so a
 * buyer on `/en/poland/flowers` who clicks Roses stays in Poland. Two functions, both pure reads of
 * the committed catalogue, no request, no clock:
 *
 *  - `pageDestination()` — which destination a page is in the context of, from its URL segments
 *    and nothing else (`resolveLocalePath()`, the router's own resolver): the shop root, a country
 *    category, a country occasion, a product page and the destination's guide. Every other page
 *    (home, hubs, the occasions index, the destinations hub, info pages) has none.
 *  - `destinationShopLinks()` — for each header shop item, its href in that destination. The rule
 *    is one source of truth with the hubs: a header item whose out-of-context target is a category
 *    or occasion hub (`src/config/site-links.ts`) links where **that hub's own destination list**
 *    links this destination (`hubDestinationHref()`), and the destination's shop root where the
 *    hub has no such link (AC-2). Our selection is the shop root. Occasions and Destinations are
 *    not in the result: they link the same page everywhere.
 *
 * `undefined` when the destination has no shop root in the locale: the header then keeps its
 * out-of-context hrefs (§5.3 A "Out of context, or no shop root").
 */
import { CATEGORIES, type CategoryId } from "@/config/categories";
import { isCountryIso2 } from "@/config/countries";
import { isLocaleCode } from "@/config/locales";
import { categoryRowLinkId, siteLink } from "@/config/site-links";

import { hubDestinationHref } from "./listing";
import { resolveLocalePath } from "./routes";
import { corridorShopEntry } from "./shop-entry";

/** For each header shop item, by its `src/config/categories.ts` row id, the href in one destination. */
export type ShopNavLinks = Readonly<Partial<Record<CategoryId, string>>>;

/**
 * The destination a page is in the context of, or `undefined` (spec 043 §5.3 A "Country context").
 * `segments` are the path's segments after the locale, as the route's params spell them.
 */
export async function pageDestination(
  locale: string,
  segments: readonly string[],
): Promise<string | undefined> {
  if (segments.length === 0) return undefined;
  const match = await resolveLocalePath(locale, segments);
  switch (match.kind) {
    case "corridor":
    case "countryShopRoot":
    case "countryCategory":
    case "countryOccasion":
    case "product":
      return match.iso2;
    case "notFound":
    case "destinationsHub":
    case "occasionsIndex":
    case "categoryHub":
    case "occasionHub":
    case "infoPage":
      return undefined;
  }
}

export async function destinationShopLinks(
  locale: string,
  iso2: string,
): Promise<ShopNavLinks | undefined> {
  if (!isLocaleCode(locale) || !isCountryIso2(iso2)) return undefined;
  const { shopEntryHref: shopRoot } = await corridorShopEntry(locale, iso2);
  if (shopRoot === undefined) return undefined;
  const links: Partial<Record<CategoryId, string>> = {};
  for (const category of CATEGORIES) {
    const { target } = siteLink(categoryRowLinkId(category.id));
    if (target.kind !== "listingPage") continue;
    if (target.pageType === "countryShopRoot") {
      links[category.id] = shopRoot;
      continue;
    }
    if (
      (target.pageType !== "categoryHub" &&
        target.pageType !== "occasionHub") ||
      target.entityKey === undefined
    ) {
      continue;
    }
    const href = await hubDestinationHref(
      locale,
      {
        kind: target.pageType === "categoryHub" ? "category" : "occasion",
        entityKey: target.entityKey,
      },
      iso2,
    );
    links[category.id] = href ?? shopRoot;
  }
  return links;
}
