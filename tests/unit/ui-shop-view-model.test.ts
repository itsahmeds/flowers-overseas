/**
 * **T-06 (schema half) / AC-6** — the honesty rules of spec 008 §8 enforced by the type
 * (spec 008 §5.2, §9 L261, §10 L309; TASK-108).
 *
 * The criterion has two halves: a DOM scan (`tests/unit/ui-shop-components.test.tsx` and
 * `tests/e2e/dev-components.spec.ts`, both through `tests/support/listing-honesty.ts`) and "the
 * absence of those fields from `ProductCardViewSchema`". This file is the second half, and it
 * asserts the absence the only way an absence can be asserted: a projection that grows one of the
 * forbidden fields must **fail to parse**.
 */
import { describe, expect, it } from "vitest";

import { mediaSources } from "../../seed/schema/media.ts";
import {
  CategoryTileViewSchema,
  ChipLinkViewSchema,
  LISTING_SORTS,
  PRICE_LABEL_KEYS,
  PRODUCT_PROVENANCE,
  ProductCardViewSchema,
  SORT_LABEL_KEYS,
} from "../../src/modules/ui/shop/viewModel.ts";

const CARD = {
  productId: "fo-bouquet-amber-hour",
  name: "Amber Hour",
  photo: {
    kind: "asset",
    assetId: "fo-asset-amber-hour",
    alt: "A hand-tied bouquet of amber roses in brown paper",
    slot: "grid",
  },
  price: { amountMinor: 4690, currency: "GBP" },
  priceLabelKey: "catalog.price.inclusive",
  provenance: "ai",
} as const;

describe("ProductCardViewSchema: what a card may say", () => {
  it("accepts the seven fields spec 008 §5.2 lists, and the tile has no href", () => {
    expect(ProductCardViewSchema.parse(CARD)).toEqual(CARD);
    expect(
      ProductCardViewSchema.parse({
        ...CARD,
        href: "/en/poland/flowers/roses/amber-hour",
      }).href,
    ).toBe("/en/poland/flowers/roses/amber-hour");
  });

  it("accepts the placeholder branch, which carries no alt at all", () => {
    const placeholder = {
      ...CARD,
      photo: { kind: "placeholder", slot: "grid" },
    } as const;
    expect(ProductCardViewSchema.parse(placeholder).photo.kind).toBe(
      "placeholder",
    );
    expect(
      ProductCardViewSchema.safeParse({
        ...placeholder,
        photo: { kind: "placeholder", slot: "grid", alt: "invented at render" },
      }).success,
    ).toBe(false);
  });

  // AC-6, in the form the criterion itself names: `badge`, `rating`, `oldPrice` and `countdown`
  // are not "unused" — they are **rejected**, so no projection can carry one to a renderer.
  it.each([
    ["badge", { badge: "Bestseller" }],
    ["rating", { rating: 4.8 }],
    ["reviewCount", { reviewCount: 214 }],
    ["oldPrice", { oldPrice: { amountMinor: 5990, currency: "GBP" } }],
    ["countdown", { countdown: "2026-10-16T12:00:00Z" }],
    ["ctaAddToBasket", { ctaAddToBasket: true }],
    ["deliveryBadge", { deliveryBadge: "Tomorrow" }],
  ])("rejects a `%s` field", (_name, extra) => {
    const result = ProductCardViewSchema.safeParse({ ...CARD, ...extra });
    expect(result.success).toBe(false);
  });

  it("takes a Money, never a number: a price that is not integer minor units is refused", () => {
    expect(
      ProductCardViewSchema.safeParse({ ...CARD, price: 46.9 }).success,
    ).toBe(false);
    expect(
      ProductCardViewSchema.safeParse({
        ...CARD,
        price: { amountMinor: 46.9, currency: "GBP" },
      }).success,
    ).toBe(false);
  });

  it("admits exactly one price label: the all-in wording of §2", () => {
    expect(PRICE_LABEL_KEYS).toEqual(["catalog.price.inclusive"]);
    expect(
      ProductCardViewSchema.safeParse({
        ...CARD,
        priceLabelKey: "catalog.price.from",
      }).success,
    ).toBe(false);
  });

  it("keeps its provenance vocabulary equal to the seed dataset's", () => {
    expect([...PRODUCT_PROVENANCE]).toEqual([...mediaSources]);
  });
});

describe("the other listing view models", () => {
  it("lets a category tile carry a from-price and a hub tile carry none", () => {
    const tile = {
      key: "roses",
      name: "Roses",
      href: "/en/poland/flowers/roses",
      count: 12,
    } as const;
    expect(CategoryTileViewSchema.parse(tile).fromPrice).toBeUndefined();
    expect(
      CategoryTileViewSchema.parse({
        ...tile,
        fromPrice: { amountMinor: 3090, currency: "GBP" },
      }).fromPrice?.amountMinor,
    ).toBe(3090);
    expect(
      CategoryTileViewSchema.safeParse({ ...tile, rating: 4.5 }).success,
    ).toBe(false);
  });

  it("names three sorts and labels each one through a message key", () => {
    expect([...LISTING_SORTS]).toEqual(["default", "price-asc", "price-desc"]);
    expect(Object.keys(SORT_LABEL_KEYS)).toEqual([...LISTING_SORTS]);
    // §13 Q3: no label key is named after a claim we cannot evidence.
    for (const key of Object.values(SORT_LABEL_KEYS)) {
      expect(key).not.toMatch(/best|popular|recommend|trending/iu);
    }
  });

  it("requires a chip link to have somewhere to go", () => {
    expect(
      ChipLinkViewSchema.safeParse({ key: "roses", name: "Roses", href: "" })
        .success,
    ).toBe(false);
  });
});
