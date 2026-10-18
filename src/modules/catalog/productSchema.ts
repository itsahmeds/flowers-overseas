/**
 * The product page's structured data (spec 009 §6 "Schema types", §13 Q8, AC-18, AC-31, AC-36;
 * §14 A12 invariants; `plan/02` §9; TASK-130).
 *
 * **One input.** Everything here reads one `ProductView` — the view the page renders and the
 * sitemap row reads (T-32) — and nothing else: no second price call, no second indexability call
 * (`catalog-product-view-source.test.ts` pins that for the view), no second trail.
 *
 *  - **`BreadcrumbList`** is `view.breadcrumb`, the very array `ListingBreadcrumb` renders, through
 *    spec 007's `breadcrumbList()` with the crumb's authored value passed as `{name}` exactly as the
 *    visible trail passes it. Order and label are therefore the visible trail's by construction.
 *  - **`Product` + one `Offer`** is built from spec 005's `offerProjection(view.price)` and emitted
 *    only behind **the gate**: the page is indexable (`view.indexability`, spec 007's one verdict),
 *    the destination is live (`view.country.state`, from `corridorState()`: an active florist, not
 *    a registry label) **and** the picker is live (`view.delivery.state`, from `pickerState()`): a
 *    purchase path exists. In Phase 0 the gate is shut on every PDP, so the page emits
 *    `BreadcrumbList` only (§13 Q8). The day a live country has a florist and spec 010 opens the
 *    path, it opens as a data flip with no edit here.
 *
 * **Price shown = price charged, or no Offer** (AC-31, A12: "the gated `Offer.price` equals the
 * buy section's price"). The buy section prints the selected tier's all-in amount; `view.price` is
 * that amount on the bare page unless the date preselected for the buyer carries a surcharge (a
 * peak day), when it is the dated total instead. An `Offer` that disagreed with the visible price
 * would be the "structured data ≠ visible content" defect of `plan/02` §15, so when the two
 * differ the `Product` and its `Offer` are **not emitted** (fail closed), and a test pins it.
 *
 * Every JSON-LD `name` is free of U+2014 and of spaced hyphens and en dashes (AC-36): the builders
 * refuse one, so a name that carried one would fail the build rather than ship.
 */
import { moneyDecimalString } from "@/modules/i18n";
import {
  type BreadcrumbLabel,
  type CanonicalOptions,
  type JsonLdNode,
  breadcrumbList,
  productOffer,
} from "@/modules/seo";

import { offerProjection } from "./pricing/project";
import type { ProductView } from "./product";

/**
 * **The gate** (spec 009 §2, §6, §13 Q8): an indexable page with a purchase path. Each term is
 * true only when it is literally the open value, so a missing field shuts it.
 */
export function productOfferGateOpen(view: ProductView): boolean {
  return (
    view.indexability.indexable === true &&
    view.country.state === "live" &&
    view.delivery.state === "live"
  );
}

/**
 * The `Product` + single `Offer` node of one PDP, or `undefined` when the gate is shut, the
 * destination has no offer (spec 005: not `live` in the registry) or the offer would not equal the
 * buy section's price.
 */
export function productOfferNode(
  view: ProductView,
  options: CanonicalOptions,
): JsonLdNode | undefined {
  if (!productOfferGateOpen(view)) return undefined;
  const offer = offerProjection(view.price);
  if (offer === null) return undefined;

  const selected = view.tiers.find(
    (tier) => tier.tierKey === view.selectedTierKey,
  );
  if (
    selected === undefined ||
    offer.priceCurrency !== selected.price.currency ||
    offer.price !== moneyDecimalString(selected.price)
  ) {
    return undefined;
  }

  return productOffer(
    {
      // The `<h1>`'s name and the trail's last item: one string (AC-36).
      name: view.product.name,
      sku: view.product.sku,
      path: view.path,
      offer: {
        price: offer.price,
        priceCurrency: offer.priceCurrency,
        availability: offer.availability,
        eligibleRegion: offer.eligibleRegion,
        priceValidUntil: offer.priceValidUntil,
        shippingRate: {
          value: moneyDecimalString(offer.shippingRate),
          currency: offer.shippingRate.currency,
        },
        returnPolicyCategory: offer.hasMerchantReturnPolicy,
      },
      // The cutoff the live picker renders, in the form it renders it (`DeliveryDatePicker`
      // prints `cutoffLocal` with its zone named, and only when both are present).
      ...(view.delivery.timeZone === undefined ||
      view.delivery.cutoffLocal === undefined
        ? {}
        : { cutoffTime: view.delivery.cutoffLocal }),
    },
    options,
  );
}

/** Every node the PDP serves, in document order; absent ones are dropped by `<JsonLd>`. */
export function productJsonLd(
  view: ProductView,
  label: BreadcrumbLabel,
  options: CanonicalOptions,
): readonly (JsonLdNode | undefined)[] {
  return [
    breadcrumbList(view.breadcrumb, label, options),
    productOfferNode(view, options),
  ];
}
