/**
 * `Product` with exactly one `Offer` (spec 009 §6 "Schema types", §13 Q8, AC-18, AC-31, AC-36;
 * `plan/02` §9 "Product (country-scoped)"; TASK-130).
 *
 * The builder is a **projection**, like every other one in this directory: it is handed the offer
 * the page already priced (spec 005's `offerProjection()` of the page's own `PriceProjection`) and
 * the product's name as the page prints it, and it turns them into schema.org nodes. It computes
 * no price, converts no currency and reads no clock, so `Offer.price` can only be the number the
 * buy section shows (spec 005 AC-11, spec 009 AC-31).
 *
 * **Whether it emits is not decided here.** The gate (an indexable page with a live destination and
 * a live picker, spec 009 §2) belongs to the caller that holds the view model
 * (`src/modules/catalog/productSchema.ts`); in Phase 0 that gate is shut on every product page and
 * this function is reached only by its tests. Keeping the gate out of the builder keeps the builder
 * testable on a live fixture without a live country.
 *
 * Refusals, each a throw rather than a quietly wrong node (the `breadcrumbList()` precedent: a
 * wrong document in a prerendered route should fail the build, not ship):
 *
 *  - **a name carrying U+2014, a spaced hyphen or a spaced U+2013** (spec 009 §14
 *    A-founder-2026-10-15a clause 3, AC-36);
 *  - **a non-zero `shippingRate`**: delivery is inside the price, so the structured data says 0
 *    (spec 009 §6, `plan/07` §4). A rate above zero would announce a second charge the buyer never
 *    pays;
 *  - **an empty price, currency or availability**: `plan/02` §9's required properties, which
 *    `scripts/seo/validate-schema.ts` also enforces on the committed fixtures.
 *
 * Nothing about add-ons, equivalents or a reference price reaches this node (spec 009 §14 A12
 * invariants, A-founder-2026-10-14c clause 4): the input type has no field for them.
 */
import { absoluteUrl, type CanonicalOptions } from "../canonical.ts";

import type { JsonLdNode } from "./JsonLd.tsx";

/** The one offer, in the shape spec 005's `OfferProjection` carries it (structurally). */
export interface ProductOfferOffer {
  /** A plain decimal string with a `.` separator, at the currency's exponent. */
  readonly price: string;
  /** ISO 4217: the currency the page prints the price in. */
  readonly priceCurrency: string;
  /** A schema.org `ItemAvailability` URL. */
  readonly availability: string;
  /** ISO 3166-1 alpha-2 of the destination. */
  readonly eligibleRegion: string;
  readonly priceValidUntil: string | null;
  /** Always zero: delivery is in the price. A decimal string, like `price`. */
  readonly shippingRate: { readonly value: string; readonly currency: string };
  /** `https://schema.org/MerchantReturnNotPermitted` for cut flowers (CRD Art. 16(d)). */
  readonly returnPolicyCategory: string;
}

export interface ProductOfferInput {
  /** The product's name as the page prints it in `<h1>` and in the breadcrumb's last item. */
  readonly name: string;
  readonly sku: string;
  /** The page's own path; made absolute here. */
  readonly path: string;
  readonly offer: ProductOfferOffer;
  /**
   * The same-day cutoff exactly as the page renders it (`HH:MM` in the destination's zone), or
   * absent where the page renders none.
   */
  readonly cutoffTime?: string | undefined;
}

/** U+2014 anywhere, or a hyphen / U+2013 with a space on either side (AC-36). */
const DASH_IN_NAME = /—|\s[-–]|[-–]\s/u;

/** `0`, `0.0`, `0.00`…: the only shipping rate a price with delivery included may carry. */
const ZERO_DECIMAL = /^0+(?:\.0+)?$/u;

function required(value: string, what: string): string {
  if (value.trim() === "") {
    throw new TypeError(
      `${what} is empty: an Offer without it describes no purchase (plan/02 §9)`,
    );
  }
  return value;
}

/** The `Product` node with its single `Offer`. */
export function productOffer(
  input: ProductOfferInput,
  options: CanonicalOptions,
): JsonLdNode {
  const name = required(input.name, "Product.name");
  if (DASH_IN_NAME.test(name)) {
    throw new TypeError(
      `Product.name ${JSON.stringify(name)} carries an em dash, a spaced hyphen or a spaced en dash (spec 009 AC-36)`,
    );
  }
  const { offer } = input;
  if (!ZERO_DECIMAL.test(offer.shippingRate.value)) {
    throw new TypeError(
      `shippingRate ${offer.shippingRate.value} ${offer.shippingRate.currency} is not zero: delivery is inside the price (spec 009 §6, AC-18)`,
    );
  }
  if (offer.shippingRate.currency !== offer.priceCurrency) {
    throw new TypeError(
      `shippingRate is in ${offer.shippingRate.currency} on an Offer priced in ${offer.priceCurrency}: one page, one currency`,
    );
  }
  const url = absoluteUrl(input.path, options);

  return {
    "@type": "Product",
    name,
    sku: required(input.sku, "Product.sku"),
    url,
    offers: {
      "@type": "Offer",
      price: required(offer.price, "Offer.price"),
      priceCurrency: required(offer.priceCurrency, "Offer.priceCurrency"),
      availability: required(offer.availability, "Offer.availability"),
      eligibleRegion: required(offer.eligibleRegion, "Offer.eligibleRegion"),
      url,
      ...(offer.priceValidUntil === null
        ? {}
        : { priceValidUntil: offer.priceValidUntil }),
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: offer.shippingRate.value,
          currency: offer.shippingRate.currency,
        },
        ...(input.cutoffTime === undefined
          ? {}
          : {
              deliveryTime: {
                "@type": "ShippingDeliveryTime",
                cutoffTime: input.cutoffTime,
              },
            }),
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        returnPolicyCategory: required(
          offer.returnPolicyCategory,
          "MerchantReturnPolicy.returnPolicyCategory",
        ),
      },
    },
  };
}
