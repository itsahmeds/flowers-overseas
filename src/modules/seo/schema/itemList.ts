/**
 * `ItemList`, built from **the same cards the listing renders, in the order it renders them**
 * (spec 008 §2 "Schema", §6 "Schema types", §13 Q5, AC-17; T-17; TASK-115).
 *
 * An `ItemList` describes an order, not an offer. Each `ListItem` therefore carries exactly three
 * things, the three spec 008 §2 names: its `position` (1..n in rendered order), the `name` the
 * card prints, and the `url` the card links to. The input type has **no field** for a price, an
 * image, a rating or a review, so the node cannot grow one by a caller's mistake: "no price, no
 * image, no rating inside it" is a fact about the signature, as the absence of a `SearchAction`
 * parameter is in `webSite.ts`.
 *
 * Two rules follow `breadcrumbList.ts`'s precedent:
 *
 *  - **A card that is not a link announces no `url`.** A destination-less hub's card and a country
 *    card before spec 009 published the `product` link id render as tiles with no `<a>`; a `url`
 *    in the markup would name a page the listing refuses to link. So `url` is emitted exactly
 *    where the card renders an `<a href>`, and made absolute here (a relative URL in JSON-LD names
 *    nothing).
 *  - **A list with no entries emits nothing**, and a nameless entry is refused with a throw: a
 *    `ListItem` without a name is a silent defect in a prerendered route, and a build failure is
 *    where a wrong list should be caught.
 */
import { absoluteUrl, type CanonicalOptions } from "../canonical.ts";

import type { JsonLdNode } from "./JsonLd.tsx";

/** One rendered card, as the list describes it: its printed name and its link, if it has one. */
export interface ItemListEntry {
  /** The name the card prints (authored copy, never a key). */
  readonly name: string;
  /** The path the card links to, or `undefined` when the card renders as a tile with no `<a>`. */
  readonly href?: string | undefined;
}

export function itemList(
  entries: readonly ItemListEntry[],
  options: CanonicalOptions,
): JsonLdNode | undefined {
  if (entries.length === 0) return undefined;

  return {
    "@type": "ItemList",
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => {
      if (entry.name.trim() === "") {
        throw new TypeError(
          `ItemList entry ${String(index + 1)} has no name: a ListItem without one describes no card the page shows (spec 008 AC-17)`,
        );
      }
      return {
        "@type": "ListItem",
        position: index + 1,
        name: entry.name,
        ...(entry.href === undefined
          ? {}
          : { url: absoluteUrl(entry.href, options) }),
      };
    }),
  };
}
