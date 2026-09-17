/**
 * The listing view models the shop components render from (spec 008 §5.2 "Zod schemas", **AC-6**,
 * T-06; TASK-108).
 *
 * **Why the schema is the honesty rule.** Spec 008 §8 forbids a rating, a star, a review count, a
 * "bestseller" badge, a delivery-timing claim, a countdown, a strike-through, an old price and an
 * add-to-basket control on every page the spec ships. A review can miss one of those; a type
 * cannot. `ProductCardViewSchema` is `.strict()` and its field list is closed, so a projection that
 * grows a `badge` or a `rating` fails at the boundary before a component ever sees it — which is
 * exactly what AC-6 asks for ("asserted by DOM scan **and** by the absence of those fields from
 * `ProductCardViewSchema`").
 *
 * **Why every price is a `Money`.** §5.2: "Every price in a `ProductCardView` comes from
 * `priceProjection()`; no component receives a number and no component calls `Intl`." The card and
 * the chip take `Money` — integer minor units plus a currency, spec 003's one money type — and
 * render it through `formatMoney`, so "price shown = price charged" is a data-flow fact rather
 * than a convention.
 *
 * **Where this lives, and why not in `modules/catalog`.** §5.2 lists `productCardView` and
 * `categoryTileView` as functions of `catalog/listing.ts` (TASK-107) but names no file for the
 * schemas. They are the **prop contract of the components in this directory**, they depend on
 * nothing in the catalogue but `MoneySchema` (which is spec 003's, in `modules/i18n`), and putting
 * them here lets TASK-107's projection import one barrel and parse its output against the same
 * shape the renderer accepts. No import goes the other way: nothing in `modules/ui` knows what a
 * `priceProjection()` is.
 */
import { z } from "zod";

import { MoneySchema } from "@/modules/i18n";

import { MEDIA_SLOTS } from "../media/slots.ts";

/** The named media slots of spec 004 §2, as a schema. A card's photo is the `grid` slot. */
export const MediaSlotSchema = z.enum(MEDIA_SLOTS);

/**
 * The provenance of the photograph a card displays, mirroring `seed/schema/media.ts`'s
 * `mediaSources`. `ai` is the one value that owes the honesty label of spec 006 §2.5, and
 * `tests/unit/ui-shop-view-model.test.ts` pins this tuple against the seed schema's so the two
 * cannot drift (a `src/` file does not import `seed/`).
 */
export const PRODUCT_PROVENANCE = ["ai", "photo", "partner"] as const;
export type ProductProvenance = (typeof PRODUCT_PROVENANCE)[number];
export const ProductProvenanceSchema = z.enum(PRODUCT_PROVENANCE);

/**
 * The wording that stands beside a card price. There is exactly one legal value: spec 008 §2's
 * "one all-in price … with the `catalog.price.inclusive` wording beside it". It is an enum rather
 * than a `string` so a projection cannot quietly point the card at a different sentence.
 */
export const PRICE_LABEL_KEYS = ["catalog.price.inclusive"] as const;
export type PriceLabelKey = (typeof PRICE_LABEL_KEYS)[number];
export const PriceLabelKeySchema = z.enum(PRICE_LABEL_KEYS);

/**
 * The note under a `from` price. `catalog.availability.fxUnavailable` is the stale-FX sentence of
 * spec 005 §14 A3 — "We are showing this price in the currency of the delivery country" — which
 * the drawing puts under the chip in its second state.
 */
export const PRICE_NOTE_KEYS = ["catalog.availability.fxUnavailable"] as const;
export type PriceNoteKey = (typeof PRICE_NOTE_KEYS)[number];
export const PriceNoteKeySchema = z.enum(PRICE_NOTE_KEYS);

const NonEmpty = z.string().min(1);

/**
 * The card's photo: an asset from spec 006's manifest, or the placeholder box.
 *
 * `alt` rides along on the asset branch because §5.2 puts it there and because the `ItemList`
 * builder and the tests read the view model rather than the manifest — but it is **not** a render
 * input: `MediaAsset` has no `alt` prop by design (spec 006 AC-18, "`alt` is data, never generated
 * at render"), so a call site cannot override the dataset through this field. The placeholder
 * branch carries no `alt` at all: a placeholder renders no `<img>`, and "no alt text in this
 * locale" is itself one of the reasons a card lands on that branch.
 */
export const ProductCardPhotoSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("asset"),
      assetId: NonEmpty,
      alt: NonEmpty,
      slot: MediaSlotSchema,
    })
    .strict(),
  z.object({ kind: z.literal("placeholder"), slot: MediaSlotSchema }).strict(),
]);
export type ProductCardPhotoView = z.infer<typeof ProductCardPhotoSchema>;

/**
 * One product card (spec 008 §5.2). **Closed, strict and deliberately short.**
 *
 * `href` is optional because §13 Q8 makes the card a *tile* until spec 009 publishes the `product`
 * link id: absent → no `<a>`, present → the same markup wrapped in one. Nothing else in the shape
 * changes across that flip, which is why it costs zero layout shift.
 */
export const ProductCardViewSchema = z
  .object({
    productId: NonEmpty,
    name: NonEmpty,
    href: NonEmpty.optional(),
    photo: ProductCardPhotoSchema,
    price: MoneySchema,
    priceLabelKey: PriceLabelKeySchema,
    provenance: ProductProvenanceSchema,
  })
  .strict();
export type ProductCardView = z.infer<typeof ProductCardViewSchema>;

/**
 * A category tile (spec 008 §5.2). The **only** place a "from" price is allowed: a tile stands for
 * a set, so its lowest default-tier price is a payable number that has to be labelled as a floor.
 * `fromPrice` is absent on a destination-less hub, where §2 permits no money at all.
 */
export const CategoryTileViewSchema = z
  .object({
    key: NonEmpty,
    name: NonEmpty,
    href: NonEmpty,
    count: z.int().nonnegative(),
    fromPrice: MoneySchema.optional(),
  })
  .strict();
export type CategoryTileView = z.infer<typeof CategoryTileViewSchema>;

/** The sort orders of §2. Three, and the default one is never called a ranking by sales. */
export const LISTING_SORTS = ["default", "price-asc", "price-desc"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];
export const ListingSortSchema = z.enum(LISTING_SORTS);

/**
 * The `shop.sort.*` message key each order is labelled by. §13 Q3: the default order is the
 * founder's curation, labelled plainly — never "bestsellers", "popular" or "recommended", which we
 * cannot evidence and which `plan/07` §2.1's ranking-transparency duty would make us describe
 * truthfully anyway.
 */
export const SORT_LABEL_KEYS: Readonly<Record<ListingSort, string>> = {
  default: "sort.default",
  "price-asc": "sort.priceAsc",
  "price-desc": "sort.priceDesc",
};

/** One chip in the category/occasion row: a link to a page that exists (§2, `plan/02` §7). */
export const ChipLinkViewSchema = z
  .object({
    key: NonEmpty,
    name: NonEmpty,
    href: NonEmpty,
    current: z.boolean().optional(),
  })
  .strict();
export type ChipLinkView = z.infer<typeof ChipLinkViewSchema>;
