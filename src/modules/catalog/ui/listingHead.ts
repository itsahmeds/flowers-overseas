/**
 * What the country listings' head says, computed once for the three page types (spec 043 §14
 * A-founder-10-22 items 1 and 3, revised by design PR 347, and §5.3 E; TASK-289). Pure functions
 * over the view and the page's translators: no clock, no request, no copy written here.
 */
import type { useTranslations } from "next-intl";

import { CATEGORIES } from "@/config/catalogue/categories.data";

import type { ListingView } from "../listing";

import {
  type ListingChip,
  type ListingChipGroup,
  type ListingStatusPart,
  NOT_OPEN_STATE_KEY,
} from "./ListingChrome";
import { registryLabel } from "./labels";

type Translator = ReturnType<typeof useTranslations>;
type ShopTranslator = ReturnType<typeof useTranslations<"shop">>;

/**
 * The quiet line's count (item 1): `shop.toolbar.count` on page 1, and from page 2
 * `shop.toolbar.summary`, the count with "page N of M". "page N of M" never renders on page 1.
 */
export function listingCount(shop: ShopTranslator, view: ListingView): string {
  return view.page > 1
    ? shop("toolbar.summary", {
        count: view.resultCount,
        page: view.page,
        pageCount: view.pageCount,
      })
    : shop("toolbar.count", { count: view.resultCount });
}

/**
 * The quiet line's parts after the count (item 1; AC-36). Page 1 only: while ordering is not open
 * in the destination (`deliveryDatesOpen()`, carried as `country.orderingOpen`), the not-open state
 * text; then `nav.utility.pricesInclude` (Q-22d), in both states. From page 2, nothing.
 */
export function listingStatusParts(
  t: Translator,
  view: ListingView,
): readonly ListingStatusPart[] {
  if (view.page > 1) return [];
  const prices: ListingStatusPart = {
    key: "prices",
    text: registryLabel(t, "nav.utility.pricesInclude"),
  };
  return view.country === undefined || view.country.orderingOpen
    ? [prices]
    : [{ key: "state", text: registryLabel(t, NOT_OPEN_STATE_KEY) }, prices];
}

/** The category keys of kind `occasion`, from the authored taxonomy (`plan/10` §2.1). */
const OCCASION_KINDS: ReadonlySet<string> = new Set(
  CATEGORIES.filter((category) => category.kind === "occasion").map(
    (category) => category.key,
  ),
);

/**
 * The Categories panel's two groups (§5.3 E): the categories of kind `productType` and
 * `flowerType` under "By what it is", then those of kind `occasion` under "Shop by occasion";
 * within a group the order the caller gave. A group with no chip is dropped by the panel.
 */
export function chipGroups(
  chips: readonly ListingChip[],
  headings: { readonly what: string; readonly occasion: string },
): readonly ListingChipGroup[] {
  return [
    {
      id: "listing-categories-what",
      heading: headings.what,
      chips: chips.filter((chip) => !OCCASION_KINDS.has(chip.key)),
    },
    {
      id: "listing-categories-occasion",
      heading: headings.occasion,
      chips: chips.filter((chip) => OCCASION_KINDS.has(chip.key)),
    },
  ];
}
