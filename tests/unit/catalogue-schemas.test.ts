/**
 * What the dataset schemas **refuse** (spec 005 §5.2 "facet values as closed enums, so an unknown
 * `product_type` is a type error and a parse error", AC-6, AC-19; TASK-061).
 *
 * The dataset is parsed at module load, so every rule below is enforced before a page renders and
 * before `pnpm catalogue:check` (TASK-062) gets a chance to report it. This file is the failure
 * side: each `it` is a way of getting the catalogue wrong that the schemas make impossible, which
 * is the difference between a validated dataset and a typed one.
 */
import { describe, expect, it } from "vitest";

import {
  AddonDataSchema,
  AddonCountryPriceDataSchema,
  CategoryDataSchema,
  CountryPriceDataSchema,
  FxRateDataSchema,
  OccasionDataSchema,
  OccasionRegistrySchema,
  ProductDataSchema,
  ProductRegistrySchema,
  ProductTierGroupSchema,
  facetLabelKey,
} from "../../src/config/catalogue/schemas.ts";

const product = {
  sku: "FO-BQ-001",
  name: "Amber Hour",
  slug: "amber-hour",
  productType: "bouquet",
  primaryFlower: "roses",
  flowerTypes: ["roses", "mixed"],
  colourPrimary: "orange",
  colours: ["orange"],
  style: "classic",
  priceTier: "classic",
  occasions: ["birthday", "thank_you"],
  substitutionClass: "main_flower",
  vaseIncluded: false,
  stemCount: 18,
  freshnessDays: 7,
  allergenNote: false,
  partnerOnly: false,
  status: "active",
} as const;

const tierGroup = {
  sku: "FO-BQ-001",
  tiers: [
    {
      tierKey: "stems_12",
      labelKey: "catalog.tier.stems",
      stems: 12,
      sort: 0,
      isDefault: false,
    },
    {
      tierKey: "stems_18",
      labelKey: "catalog.tier.stems",
      stems: 18,
      sort: 1,
      isDefault: true,
    },
    {
      tierKey: "stems_24",
      labelKey: "catalog.tier.stems",
      stems: 24,
      sort: 2,
      isDefault: false,
    },
  ],
} as const;

const addon = {
  key: "chocolates",
  kind: "confectionery",
  allergenNoteRequired: true,
  partnerOnly: false,
  flagPrefix: null,
  nameKey: "catalog.addon.chocolates.name",
  descriptionKey: "catalog.addon.chocolates.description",
  sort: 0,
} as const;

const countryPrice = {
  sku: "FO-BQ-001",
  countryIso2: "PL",
  tierKey: "stems_18",
  retailMinor: 19_900,
  currency: "PLN",
  vatRateBp: 800,
  surchargeKind: null,
  activeFrom: "2026-09-01",
  activeTo: null,
} as const;

describe("ProductDataSchema accepts the authored shape and nothing else", () => {
  it("accepts a well-formed product", () => {
    expect(ProductDataSchema.parse(product).sku).toBe("FO-BQ-001");
  });

  it("rejects an unknown facet value on every facet (closed enums)", () => {
    for (const invalid of [
      { ...product, productType: "subscription" },
      { ...product, primaryFlower: "dahlias" },
      { ...product, colourPrimary: "teal" },
      { ...product, style: "brutalist" },
      { ...product, priceTier: "budget" },
      { ...product, occasions: ["black_friday"] },
      { ...product, substitutionClass: "anything_goes" },
      { ...product, status: "published" },
    ]) {
      expect(
        ProductDataSchema.safeParse(invalid).success,
        JSON.stringify(invalid).slice(0, 80),
      ).toBe(false);
    }
  });

  it("rejects a description, an image, a price or any other unknown field (`.strict()`)", () => {
    for (const extra of [
      { descriptionMd: "60–90 words" },
      { imageUrl: "/img/amber-hour.avif" },
      { mediaAssetId: "abc" },
      { retailMinor: 4590 },
      { priceMinor: 4590 },
      { reviewCount: 12 },
      { localeCode: "de" },
    ]) {
      expect(
        ProductDataSchema.safeParse({ ...product, ...extra }).success,
        Object.keys(extra)[0],
      ).toBe(false);
    }
  });

  it("rejects a facet list whose primary value is not first", () => {
    expect(
      ProductDataSchema.safeParse({
        ...product,
        flowerTypes: ["mixed", "roses"],
      }).success,
    ).toBe(false);
    expect(
      ProductDataSchema.safeParse({
        ...product,
        colours: ["pink", "orange"],
        colourPrimary: "orange",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty occasion set, a bad SKU shape and a non-slug slug", () => {
    for (const invalid of [
      { ...product, occasions: [] },
      { ...product, sku: "AMBER-HOUR" },
      { ...product, sku: "FO-XX-001" },
      { ...product, slug: "Amber Hour" },
      { ...product, slug: "amber/hour" },
      { ...product, stemCount: 18.5 },
      { ...product, freshnessDays: 0 },
    ]) {
      expect(
        ProductDataSchema.safeParse(invalid).success,
        JSON.stringify(invalid).slice(0, 80),
      ).toBe(false);
    }
  });

  it("rejects a duplicate SKU and a duplicate slug in the registry", () => {
    expect(ProductRegistrySchema.safeParse([product, product]).success).toBe(
      false,
    );
    expect(
      ProductRegistrySchema.safeParse([
        product,
        { ...product, sku: "FO-BQ-002" },
      ]).success,
    ).toBe(false);
    expect(
      ProductRegistrySchema.safeParse([
        product,
        { ...product, sku: "FO-BQ-002", slug: "vistula-red" },
      ]).success,
    ).toBe(true);
  });
});

describe("ProductTierGroupSchema enforces the one-default rule at parse time", () => {
  it("accepts three stem tiers with the middle one preselected", () => {
    expect(ProductTierGroupSchema.parse(tierGroup).tiers).toHaveLength(3);
  });

  it("rejects zero default tiers and two default tiers (spec 002 §14 A1 (b))", () => {
    const tiers = tierGroup.tiers.map((tier) => ({ ...tier }));
    const none = tiers.map((tier) => ({ ...tier, isDefault: false }));
    const two = tiers.map((tier) => ({ ...tier, isDefault: true }));
    expect(
      ProductTierGroupSchema.safeParse({ ...tierGroup, tiers: none }).success,
    ).toBe(false);
    expect(
      ProductTierGroupSchema.safeParse({ ...tierGroup, tiers: two }).success,
    ).toBe(false);
  });

  it("rejects a default that is not the middle tier (spec 005 §13 Q6)", () => {
    const tiers = tierGroup.tiers.map((tier, index) => ({
      ...tier,
      isDefault: index === 0,
    }));
    expect(
      ProductTierGroupSchema.safeParse({ ...tierGroup, tiers }).success,
    ).toBe(false);
  });

  it("rejects a stem count that disagrees with the tier key", () => {
    const tiers = tierGroup.tiers.map((tier, index) =>
      index === 0 ? { ...tier, stems: 13 } : { ...tier },
    );
    expect(
      ProductTierGroupSchema.safeParse({ ...tierGroup, tiers }).success,
    ).toBe(false);
  });

  it("rejects a stem count on an S/M/L tier and a missing one on a stem tier", () => {
    for (const tier of [
      { tierKey: "size_m", labelKey: "catalog.tier.size.m", stems: 12 },
      { tierKey: "stems_18", labelKey: "catalog.tier.stems", stems: null },
    ]) {
      expect(
        ProductTierGroupSchema.safeParse({
          sku: "FO-AR-001",
          tiers: [{ ...tier, sort: 0, isDefault: true }],
        }).success,
        tier.tierKey,
      ).toBe(false);
    }
  });

  it("rejects a label key that does not match the tier shape (spec 005 §7)", () => {
    const tiers = tierGroup.tiers.map((tier, index) =>
      index === 1 ? { ...tier, labelKey: "catalog.tier.classic" } : { ...tier },
    );
    expect(
      ProductTierGroupSchema.safeParse({ ...tierGroup, tiers }).success,
    ).toBe(false);
  });

  it("rejects an invented tier key, a gap in `sort` and a repeated tier key", () => {
    expect(
      ProductTierGroupSchema.safeParse({
        sku: "FO-BQ-001",
        tiers: [
          {
            tierKey: "deluxe",
            labelKey: "catalog.tier.stems",
            stems: 18,
            sort: 0,
            isDefault: true,
          },
        ],
      }).success,
    ).toBe(false);
    const gapped = tierGroup.tiers.map((tier, index) => ({
      ...tier,
      sort: index === 2 ? 5 : tier.sort,
    }));
    expect(
      ProductTierGroupSchema.safeParse({ ...tierGroup, tiers: gapped }).success,
    ).toBe(false);
    const repeated = tierGroup.tiers.map((tier) => ({
      ...tier,
      tierKey: "stems_18",
      stems: 18,
    }));
    expect(
      ProductTierGroupSchema.safeParse({ ...tierGroup, tiers: repeated })
        .success,
    ).toBe(false);
  });

  it("rejects a price on a tier: the steps are country_price rows (spec 005 §5.2)", () => {
    const tiers = [
      { ...tierGroup.tiers[1], retailMinor: 19_900 },
      { ...tierGroup.tiers[1], stepPercent: 30 },
    ];
    for (const tier of tiers) {
      expect(
        ProductTierGroupSchema.safeParse({ sku: "FO-BQ-001", tiers: [tier] })
          .success,
        JSON.stringify(tier).slice(0, 60),
      ).toBe(false);
    }
  });
});

describe("AddonDataSchema makes a pre-ticked extra unexpressible (AC-19)", () => {
  it("accepts the authored shape", () => {
    expect(AddonDataSchema.parse(addon).key).toBe("chocolates");
  });

  it("rejects `defaultSelected`, `preselected` and `checked` (CRD Art. 22)", () => {
    for (const field of ["defaultSelected", "preselected", "checked"]) {
      expect(
        AddonDataSchema.safeParse({ ...addon, [field]: true }).success,
        field,
      ).toBe(false);
    }
  });

  it("rejects a price on the add-on itself and an unknown add-on key", () => {
    expect(
      AddonDataSchema.safeParse({ ...addon, retailMinor: 600 }).success,
    ).toBe(false);
    expect(AddonDataSchema.safeParse({ ...addon, key: "candle" }).success).toBe(
      false,
    );
    expect(AddonDataSchema.safeParse({ ...addon, kind: "food" }).success).toBe(
      false,
    );
  });

  it("rejects a name key that does not name the add-on", () => {
    expect(
      AddonDataSchema.safeParse({
        ...addon,
        nameKey: "catalog.addon.vase.name",
      }).success,
    ).toBe(false);
  });

  it("rejects a flag prefix that does not name the add-on", () => {
    expect(
      AddonDataSchema.safeParse({ ...addon, flagPrefix: "addon.wine" }).success,
    ).toBe(false);
  });
});

describe("CategoryDataSchema and OccasionDataSchema keep the taxonomy closed", () => {
  it("rejects a category key that is not a facet value of its kind", () => {
    expect(
      CategoryDataSchema.safeParse({
        key: "letterbox",
        kind: "productType",
        labelKey: "catalog.facet.productType.letterbox",
        sort: 0,
      }).success,
    ).toBe(false);
    expect(
      CategoryDataSchema.safeParse({
        key: "roses",
        kind: "occasion",
        labelKey: facetLabelKey("occasion", "roses"),
        sort: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a category label key that disagrees with the facet key", () => {
    expect(
      CategoryDataSchema.safeParse({
        key: "roses",
        kind: "flowerType",
        labelKey: "nav.category.roses",
        sort: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a slug or a name on a category (spec 006 owns category_translation)", () => {
    expect(
      CategoryDataSchema.safeParse({
        key: "roses",
        kind: "flowerType",
        labelKey: facetLabelKey("flowerType", "roses"),
        sort: 0,
        slug: "roses",
      }).success,
    ).toBe(false);
  });

  it("rejects a seasonal occasion marked evergreen, and the reverse", () => {
    expect(
      OccasionDataSchema.safeParse({
        key: "valentines",
        kind: "evergreen",
        labelKey: facetLabelKey("occasion", "valentines"),
        sort: 0,
      }).success,
    ).toBe(false);
    expect(
      OccasionDataSchema.safeParse({
        key: "birthday",
        kind: "seasonal",
        labelKey: facetLabelKey("occasion", "birthday"),
        sort: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a date or a rule on an occasion (spec 009 owns the evaluator)", () => {
    expect(
      OccasionDataSchema.safeParse({
        key: "valentines",
        kind: "seasonal",
        labelKey: facetLabelKey("occasion", "valentines"),
        sort: 0,
        rule: { month: 2, day: 14 },
      }).success,
    ).toBe(false);
  });

  it("rejects an occasion registry that does not cover the facet", () => {
    expect(
      OccasionRegistrySchema.safeParse([
        {
          key: "birthday",
          kind: "evergreen",
          labelKey: facetLabelKey("occasion", "birthday"),
          sort: 0,
        },
      ]).success,
    ).toBe(false);
  });
});

describe("the price and FX record shapes TASK-062 authors against", () => {
  it("accepts an all-in integer price row keyed on the destination", () => {
    expect(CountryPriceDataSchema.parse(countryPrice).retailMinor).toBe(19_900);
  });

  it("rejects a float amount, an unknown currency and an out-of-range VAT rate", () => {
    for (const invalid of [
      { ...countryPrice, retailMinor: 199.9 },
      { ...countryPrice, retailMinor: 0 },
      { ...countryPrice, currency: "XXX" },
      { ...countryPrice, vatRateBp: 10_001 },
      { ...countryPrice, countryIso2: "pl" },
      { ...countryPrice, surchargeKind: "valentines" },
      { ...countryPrice, activeFrom: "01/09/2026" },
    ]) {
      expect(
        CountryPriceDataSchema.safeParse(invalid).success,
        JSON.stringify(invalid).slice(0, 80),
      ).toBe(false);
    }
  });

  it("rejects a buyer-keyed dimension on a price (EU 2018/302, AC-18)", () => {
    for (const field of ["buyerCountry", "buyerIso2", "ipAddress", "geo"]) {
      expect(
        CountryPriceDataSchema.safeParse({ ...countryPrice, [field]: "DE" })
          .success,
        field,
      ).toBe(false);
    }
  });

  it("rejects a superseded window that ends before it starts", () => {
    expect(
      CountryPriceDataSchema.safeParse({
        ...countryPrice,
        activeFrom: "2026-09-01",
        activeTo: "2026-08-01",
      }).success,
    ).toBe(false);
    expect(
      CountryPriceDataSchema.safeParse({
        ...countryPrice,
        activeTo: "2026-12-01",
      }).success,
    ).toBe(true);
  });

  it("requires an add-on price to carry its own VAT rate (spec 005 §13 Q3)", () => {
    const addonPrice = {
      addonKey: "chocolates",
      countryIso2: "PL",
      retailMinor: 2500,
      currency: "PLN",
      vatRateBp: 2300,
      activeFrom: "2026-09-01",
      activeTo: null,
    };
    expect(AddonCountryPriceDataSchema.parse(addonPrice).vatRateBp).toBe(2300);
    const withoutVat: Record<string, unknown> = { ...addonPrice };
    delete withoutVat.vatRateBp;
    expect(AddonCountryPriceDataSchema.safeParse(withoutVat).success).toBe(
      false,
    );
    // `card` is priced 0 and is still a line, so zero must parse.
    expect(
      AddonCountryPriceDataSchema.safeParse({
        ...addonPrice,
        addonKey: "card",
        retailMinor: 0,
        vatRateBp: 2300,
      }).success,
    ).toBe(true);
  });

  it("requires an integer parts-per-million FX rate with a date and a source", () => {
    const rate = {
      base: "EUR",
      quote: "PLN",
      ratePpm: 4_310_000,
      asOf: "2026-09-08",
      source: "ecb",
    };
    expect(FxRateDataSchema.parse(rate).ratePpm).toBe(4_310_000);
    for (const invalid of [
      { ...rate, ratePpm: 4.31 },
      { ...rate, ratePpm: 0 },
      { ...rate, quote: "EUR" },
      { ...rate, asOf: "2026-09-08T06:00:00Z" },
      { ...rate, source: "" },
      { ...rate, rate: 4.31 },
    ]) {
      expect(
        FxRateDataSchema.safeParse(invalid).success,
        JSON.stringify(invalid).slice(0, 80),
      ).toBe(false);
    }
  });
});
