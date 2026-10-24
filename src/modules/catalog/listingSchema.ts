/**
 * The listing pages' structured data (spec 008 §2 "Schema", §6 "Schema types", §13 Q5, **AC-17**,
 * **AC-18**; T-17, T-18, T-31; `plan/02` §9; TASK-115).
 *
 * **One input.** Everything here reads one `ListingView`, the view the page renders and the
 * sitemap row reads (§5.2: "`listingView()` is the only source for the page, the JSON-LD builders
 * and the sitemap row"), and nothing else: no second catalogue read, no second sort, no second
 * trail. That is what makes AC-17's equalities true by construction rather than by agreement.
 *
 *  - **`BreadcrumbList`** is `view.breadcrumb`, the very array `ListingBreadcrumb` renders, through
 *    spec 007's `breadcrumbList()` with each crumb's authored value passed as `{name}` exactly as
 *    the visible trail passes it. All six page types carry a trail of at least two crumbs (Home and
 *    the page), so all six emit one.
 *  - **`ItemList`** is the page's cards **in the order the page renders them** (§2: "one entry per
 *    rendered card, no price, no image, no rating"):
 *      - on a country-scoped listing, `view.items`, the page's own slice in its own sort (the lead
 *        `items[0]` is the grid's first card and position 1: §14 A15 (c), A16 (b));
 *      - on a hub, `view.hubItems`, the grid. The hub's lead figure (`view.hubLead`) repeats one
 *        of them and is not an element (the view model's own rule), so no product is listed twice;
 *      - on the occasions index, the hub entries in the order the page shows them: the dated table,
 *        then the observed-but-undated chips, then the everyday chips. The "next six" cards at the
 *        top repeat six of those entries and are not elements, for the hub lead's reason.
 *    A `url` is present exactly where the card renders an `<a href>` (`itemList()`'s rule).
 *
 * **Nothing else is emitted** (§13 Q5, AC-18): no `Product`, no `Offer`, no `AggregateOffer`, no
 * rating, no review, no `Event` for an occasion date, no `LocalBusiness`. Listings advertise no
 * transaction, and the node types above have no field that could carry one.
 */
import {
  type BreadcrumbLabel,
  type CanonicalOptions,
  type ItemListEntry,
  type JsonLdNode,
  breadcrumbList,
  itemList,
} from "@/modules/seo";

import type { ListingOccasionEntry, ListingView } from "./listing";

/** The occasions index's three groups, as the page renders them (§14 design round Q3, Q4). */
export interface OccasionsIndexGroups {
  /** Seasonal, with a next date in the date country: the table. */
  readonly dated: readonly ListingOccasionEntry[];
  /** Seasonal, observed, with no computable date: named, linked and explained. */
  readonly undated: readonly ListingOccasionEntry[];
  /** Evergreen: no date because it has none. */
  readonly everyday: readonly ListingOccasionEntry[];
}

/**
 * The occasions index's groups, read off `kind` and `nextDate` — one function for the page and its
 * `ItemList`, so the list cannot describe an order the page does not show. The dated table renders
 * only where the view names the country its dates were computed in (`occasionsDateCountryKey`), so
 * without one the dated group is empty here too.
 */
export function occasionsIndexGroups(view: ListingView): OccasionsIndexGroups {
  const entries = view.occasions ?? [];
  return {
    dated:
      view.occasionsDateCountryKey === undefined
        ? []
        : entries.filter(
            (entry) => entry.kind === "seasonal" && entry.nextDate !== null,
          ),
    undated: entries.filter(
      (entry) => entry.kind === "seasonal" && entry.nextDate === null,
    ),
    everyday: entries.filter((entry) => entry.kind === "evergreen"),
  };
}

/** The cards the page renders, in its order: what the `ItemList` lists, one entry each. */
export function listingItemListEntries(
  view: ListingView,
): readonly ItemListEntry[] {
  if (view.pageType === "occasionsIndex") {
    const { dated, undated, everyday } = occasionsIndexGroups(view);
    return [...dated, ...undated, ...everyday].map((entry) => ({
      name: entry.name,
      href: entry.href,
    }));
  }
  // `ListingViewSchema` refuses a view with both arrays filled (§14 A3), so one of them is empty.
  const cards = view.items.length > 0 ? view.items : view.hubItems;
  return cards.map((card) => ({ name: card.name, href: card.href }));
}

/** Every node a listing page serves, in document order; absent ones are dropped by `<JsonLd>`. */
export function listingJsonLd(
  view: ListingView,
  label: BreadcrumbLabel,
  options: CanonicalOptions,
): readonly (JsonLdNode | undefined)[] {
  return [
    breadcrumbList(view.breadcrumb, label, options),
    itemList(listingItemListEntries(view), options),
  ];
}
