/**
 * Which destination a page is in the context of (spec 043 §5.3 A "Country context", AC-1; TASK-288,
 * TASK-383).
 *
 * The header's mega menu reads it: on a page whose URL names a destination with a shop, the menu's
 * shop entries go to that destination's own pages (`megaMenuModel(locale, iso2)`). A pure read of
 * the page's URL segments through `resolveLocalePath()`, the router's own resolver: the shop root,
 * a country category, a country occasion, a product page and the destination's guide. Every other
 * page (home, hubs, the occasions index, the destinations hub, info pages) has none. No request,
 * no clock.
 */
import { resolveLocalePath } from "./routes";

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
