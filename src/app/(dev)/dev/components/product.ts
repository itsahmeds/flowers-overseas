/**
 * The gallery's fixtures for spec 009's six product-page primitives (TASK-126), in the states
 * `docs/design/system/components.dc.html` draws them ("Product and date-picker blocks").
 *
 * **View-model pieces, not a catalogue read** — TASK-108's rule for the listing cards, for the same
 * reason: a gallery that needed a real product would couple the design surface to the dataset, and
 * the `live` state is reachable from the dataset only by swapping `ActivePartnersProvider`, which
 * mutates module state and so may not happen inside a request. Each piece is typed against
 * `productView()`'s own types and is parsed by the schemas `productView()` is held to
 * (`tests/unit/product-page.test.tsx`, "the gallery's fixtures"), so a fixture cannot drift into a
 * shape the page could never receive.
 *
 * The figures are the artboards' own (18 stems at £46.90, Women's Day at +£5.00, a vase at 35 zł)
 * as integer minor units. Every picker uses its own week, so no two chips on the gallery share an
 * id. Nothing here is read by a page.
 */
import {
  type AddonLine,
  AddonLineSchema,
  IntegerMoneySchema,
  PriceProjectionSchema,
  type ProductGallery,
  ProductGallerySchema,
  type ProductView,
  type TierOption,
  TierOptionSchema,
} from "@/modules/catalog";

import { GALLERY_AI_ASSET, GALLERY_MEDIA_MANIFEST } from "./catalog";

type Delivery = ProductView["delivery"];
type DeliveryDate = Delivery["dates"][number];
type Projection = ProductView["price"];

/** The destination every fixture is for, as the gallery's locale names it. */
export const PRODUCT_COUNTRY = "Poland";
const ZONE = "Europe/Warsaw";
const CUTOFF = "14:00";

// Every amount enters through the schema that brands it, so the gallery is held to the integer
// minor-unit rule exactly as a boundary is (spec 001 §14 A20), and a drifted fixture throws here.
const gbp = (amountMinor: number) =>
  IntegerMoneySchema.parse({ amountMinor, currency: "GBP" });
const pln = (amountMinor: number) =>
  IntegerMoneySchema.parse({ amountMinor, currency: "PLN" });

/** The artboard's three tiers: stem counts, the middle one preselected by data. */
export const PRODUCT_TIERS: readonly TierOption[] =
  TierOptionSchema.array().parse([
    {
      tierKey: "stems_12",
      labelKey: "catalog.tier.stems",
      stems: 12,
      isDefault: false,
      price: gbp(3990),
    },
    {
      tierKey: "stems_18",
      labelKey: "catalog.tier.stems",
      stems: 18,
      isDefault: true,
      price: gbp(4690),
    },
    {
      tierKey: "stems_24",
      labelKey: "catalog.tier.stems",
      stems: 24,
      isDefault: false,
      price: gbp(5490),
    },
  ]);

/** A product sold in one size: printed as text, never as a one-radio control. */
export const PRODUCT_SINGLE_TIER: readonly TierOption[] =
  TierOptionSchema.array().parse([
    {
      tierKey: "single",
      labelKey: "catalog.tier.single",
      stems: null,
      isDefault: true,
      price: gbp(3490),
    },
  ]);

/** Women's Day's fee, as `dateSurcharges()` would carry it: the chip and the summary line. */
const WOMENS_DAY_FEE = gbp(500);

/** `live`: a week of selectable dates, Sunday closed, and Women's Day with its fee. */
export const PRODUCT_DELIVERY_LIVE: Delivery = {
  state: "live",
  timeZone: ZONE,
  cutoffLocal: CUTOFF,
  noticeKey: "delivery.picker.live",
  dates: [
    { date: "2027-03-01", selectable: true, occasionKeys: [] },
    { date: "2027-03-02", selectable: true, occasionKeys: [] },
    { date: "2027-03-03", selectable: true, occasionKeys: [] },
    { date: "2027-03-04", selectable: true, occasionKeys: [] },
    { date: "2027-03-05", selectable: true, occasionKeys: [] },
    { date: "2027-03-06", selectable: true, occasionKeys: [] },
    {
      date: "2027-03-07",
      selectable: false,
      reasonKey: "delivery.reason.sundayClosed",
      occasionKeys: [],
    },
    {
      date: "2027-03-08",
      selectable: true,
      surcharge: WOMENS_DAY_FEE,
      occasionKeys: ["womens_day"],
    },
  ],
};

/** The live picker's preselected date: the earliest selectable one, as `productView()` picks it. */
export const PRODUCT_LIVE_DATE = "2027-03-01";
/** The surcharged date, chosen. */
export const PRODUCT_SURCHARGE_DATE = "2027-03-08";

/**
 * `preview`: the full computed week with every chip off. The ones closed only because no order is
 * taken share the notice's sentence (§13 design round Q6); a holiday and a Sunday keep their own.
 */
export const PRODUCT_DELIVERY_PREVIEW: Delivery = {
  state: "preview",
  timeZone: ZONE,
  cutoffLocal: CUTOFF,
  noticeKey: "delivery.picker.preview",
  dates: [
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
    "2026-11-15",
  ].map((date): DeliveryDate => ({
    date,
    selectable: false,
    reasonKey:
      date === "2026-11-11"
        ? "delivery.reason.publicHoliday"
        : date === "2026-11-15"
          ? "delivery.reason.sundayClosed"
          : "delivery.reason.notOrderable",
    occasionKeys: [],
  })),
};

/** `unavailable`: no `operations` block, so no date at all and one honest sentence. */
export const PRODUCT_DELIVERY_UNAVAILABLE: Delivery = {
  state: "unavailable",
  noticeKey: "delivery.picker.unavailable",
  dates: [],
};

/** The chip's three drawn states, plus the closed reasons a chip prints in its own words. */
export const PRODUCT_CHIPS: Readonly<Record<string, DeliveryDate>> = {
  included: { date: "2027-04-06", selectable: true, occasionKeys: [] },
  surcharge: {
    date: "2027-05-26",
    selectable: true,
    surcharge: gbp(500),
    occasionKeys: ["mothers_day"],
  },
  closedSunday: {
    date: "2027-04-04",
    selectable: false,
    reasonKey: "delivery.reason.sundayClosed",
    occasionKeys: [],
  },
  closedHoliday: {
    date: "2027-05-03",
    selectable: false,
    reasonKey: "delivery.reason.publicHoliday",
    occasionKeys: [],
  },
  closedCutoff: {
    date: "2027-04-05",
    selectable: false,
    reasonKey: "delivery.reason.pastCutoff",
    occasionKeys: [],
  },
  closedOccasion: {
    date: "2026-11-01",
    selectable: false,
    reasonKey: "delivery.reason.sundayClosed",
    occasionKeys: ["all_saints"],
  },
};

export const PRODUCT_CHIP_ZONE = ZONE;
export const PRODUCT_CHIP_CUTOFF = CUTOFF;

/** The add-on rows: prices in the destination's currency, each with its own VAT rate. */
export const PRODUCT_ADDONS: readonly AddonLine[] =
  AddonLineSchema.array().parse(
    (
      [
        { key: "chocolates", amountMinor: 2500 },
        { key: "vase", amountMinor: 3500 },
        { key: "balloon", amountMinor: 1800 },
        { key: "plush", amountMinor: 3900 },
        { key: "card", amountMinor: 0 },
      ] as const
    ).map(({ key, amountMinor }) => ({
      key,
      nameKey: `catalog.addon.${key}.name`,
      price: pln(amountMinor),
      vatRateBp: 2300,
      vatRateText: "23%",
    })),
  );

/** The two gallery states: the photographed hero (the gallery manifest's AI asset) and the box. */
export const PRODUCT_GALLERY_PHOTOS: ProductGallery =
  ProductGallerySchema.parse({
    kind: "photos",
    hero: {
      assetId: GALLERY_AI_ASSET,
      alt: GALLERY_MEDIA_MANIFEST.alt["en"]?.[GALLERY_AI_ASSET] ?? "",
    },
    thumbs: [],
  });
export const PRODUCT_GALLERY_PLACEHOLDER: ProductGallery = {
  kind: "placeholder",
};
export const PRODUCT_NAME = "Amber Hour";

/** One `priceProjection()` result, at the artboard's figures. */
function projection(
  displayMinor: number,
  fx: "converted" | "fallback",
): Projection {
  return PriceProjectionSchema.parse({
    displayPrice: fx === "fallback" ? pln(displayMinor) : gbp(displayMinor),
    displayLocale: "en",
    destinationCountry: "PL",
    destinationCurrencyPrice: pln(displayMinor * 5),
    vatRateBp: 800,
    vatRateText: "8%",
    vatLabelKey: "catalog.price.inclusive",
    deliveryIncluded: true,
    surcharges: [],
    ...(fx === "converted"
      ? { fxAsOf: "2026-09-01", ratePpm: 200_000 }
      : { fxReasonKey: "catalog.availability.fxUnavailable" }),
    priceVersion: "gallery",
    priceValidUntil: null,
    availability: {
      schemaAvailability: "InStock",
      reasonKey: "catalog.availability.inStock",
      saleable: true,
    },
  });
}

type SummaryView = Pick<
  ProductView,
  | "locale"
  | "tiers"
  | "selectedTierKey"
  | "selectedDate"
  | "price"
  | "fx"
  | "delivery"
  | "product"
  | "gallery"
>;

const SUMMARY_BASE = {
  locale: "en",
  tiers: PRODUCT_TIERS,
  selectedTierKey: "stems_18",
  fx: { state: "converted" },
  product: {
    sku: "FO-BQ-001",
    name: PRODUCT_NAME,
    slug: "amber-hour",
    vaseIncluded: false,
  },
  gallery: PRODUCT_GALLERY_PHOTOS,
} as const satisfies Partial<SummaryView>;

/** The price summary's drawn states. Each total is the configuration it names. */
export const PRODUCT_SUMMARIES: Readonly<Record<string, SummaryView>> = {
  // `live`, earliest date preselected, no fee: the tier's own price is the total.
  normal: {
    ...SUMMARY_BASE,
    selectedDate: PRODUCT_LIVE_DATE,
    price: projection(4690, "converted"),
    delivery: PRODUCT_DELIVERY_LIVE,
  },
  // Women's Day chosen: the fee is a line, and the one total moves by exactly it.
  surcharge: {
    ...SUMMARY_BASE,
    selectedDate: PRODUCT_SURCHARGE_DATE,
    price: projection(5190, "converted"),
    delivery: PRODUCT_DELIVERY_LIVE,
  },
  // The FX snapshot is stale: the destination's own currency, and the sentence that says so.
  staleFx: {
    ...SUMMARY_BASE,
    tiers: PRODUCT_TIERS.map((tier) => ({
      ...tier,
      price: pln(tier.price.amountMinor * 5),
    })),
    fx: {
      state: "fallback",
      noticeKey: "catalog.availability.fxUnavailable",
    },
    price: projection(23450, "fallback"),
    delivery: PRODUCT_DELIVERY_PREVIEW,
  },
  // Phase 0's default: no florist yet, so the demo sentence stands where a button would.
  demo: {
    ...SUMMARY_BASE,
    price: projection(4690, "converted"),
    delivery: PRODUCT_DELIVERY_PREVIEW,
  },
};
