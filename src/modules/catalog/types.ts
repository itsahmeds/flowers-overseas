/**
 * The catalogue module's money types (spec 005 §5.2 `types.ts`; TASK-060).
 *
 * This file carries the types spec 005 fixes for money — a `PricePoint` (the all-in gross price of
 * one tier in one destination country, with its own decomposition) and the `Surcharge` rows that
 * are part of it — and, since TASK-063, the **taxonomy read models** the read API hands over:
 * `Product`, `Category`, `Occasion`, `FacetSelection`, `FacetResolution` and `ProductIndexability`,
 * plus — since TASK-064 — the **tier and add-on read models** `Tier` and `Addon`.
 * The rest of spec §5.2's list — `PriceProjection`, `PriceTable`, `Availability`,
 * `Quote` — arrives with the tasks that own its data and its arithmetic (TASK-065 … TASK-068);
 * guessing their fields here would put a second, unauthored definition of the dataset in the
 * repository.
 *
 * Two properties of `PricePoint` are the reason it exists at all, and both are enforced by
 * `PricePointSchema` rather than reviewed for (spec 005 §2 "Pricing", AC-8):
 *
 *  1. **The all-in amount is the only amount the type can carry.** `amountMinor` is VAT- *and*
 *     delivery-inclusive, `deliveryIncluded` is the literal `true`, and there is no field for a
 *     price without either. `plan/07` §4's drip-pricing prohibition is therefore not expressible,
 *     which is a stronger guarantee than a code review.
 *  2. **Money is integer minor units.** Every amount here is a whole number of minor units
 *     (`fo/no-float-money`, enabled for `src/` by this task, `plan/12` §2). The one formatter is
 *     spec 003's `formatMoney`; this module adds none.
 */
import type {
  AddonKey,
  AddonKind,
  CategoryKind,
  Colour,
  FacetName,
  FlowerType,
  FxRateData,
  OccasionKey,
  OccasionKind,
  PriceTier,
  ProductStatus,
  ProductType,
  Style,
  SubstitutionClass,
} from "@/config/catalogue/schemas";
import type { CountryIso2 } from "@/config/countries";
import type { CurrencyCode } from "@/config/currencies";
import type { LocaleCode } from "@/config/locales";

/**
 * The `country_price.surcharge_kind` CHECK values of spec 002 §5.1, verbatim. Surcharges are
 * **dated rows**, never a multiplier applied at render (spec 005 §13 Q7): a percentage is a float
 * and a number that cannot be shown on a date chip before the date is picked (`plan/07` §4).
 */
export const surchargeKinds = ["sunday", "peak_day"] as const;
export type SurchargeKind = (typeof surchargeKinds)[number];

/** A calendar day, `YYYY-MM-DD` — the `date` columns of spec 002 §5.1, not a timestamp. */
export type IsoDate = string;

/**
 * One dated surcharge row, in the destination country's own currency (spec 005 §5.2
 * `SurchargeSchema`). `labelKey` is a message key, never a label: the text resolves through the
 * message catalogue (spec 005 §7).
 */
export interface Surcharge {
  readonly kind: SurchargeKind;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly appliesFrom: IsoDate;
  readonly appliesTo: IsoDate;
  readonly labelKey: string;
}

/**
 * The price of one (product, tier, destination country) on one date: gross, all-in, with its own
 * VAT decomposition and the surcharge rows that are already inside `amountMinor`.
 *
 * `netAmountMinor + vatAmountMinor === amountMinor` holds by construction (`PricePointSchema`),
 * so the invoice's decomposition and the displayed price cannot disagree.
 */
export interface PricePoint {
  /** Gross, VAT- and delivery-inclusive, surcharges included. The price shown and charged. */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  /** VAT rate in basis points (PL flowers 800, PL chocolates 2300 — spec 005 §2 "Pricing"). */
  readonly vatRateBp: number;
  readonly vatAmountMinor: number;
  readonly netAmountMinor: number;
  /** Always `true`: delivery is inside `amountMinor` by definition (`CLAUDE.md`, `plan/07` §4). */
  readonly deliveryIncluded: true;
  readonly surcharges: readonly Surcharge[];
  readonly activeFrom: IsoDate;
  /** `null` while the row is the active one; a date once it has been superseded. */
  readonly activeTo: IsoDate | null;
  /**
   * Opaque identifier of the priced row version, carried into a quote and into the `Offer` so a
   * charge can be traced to the row the buyer saw. Minted by the task that resolves prices
   * (TASK-066) from spec 002 §5.1's `country_price` identity; no caller parses it.
   */
  readonly priceVersion: string;
}

/* -------------------------------------------------------------------------- */
/* Taxonomy read models (spec 005 §2 "Taxonomy", §5.2 `types.ts`; TASK-063).   */
/* -------------------------------------------------------------------------- */

/**
 * One product as the read API hands it over: the six facets of `plan/10` §1.1 as **keys** plus
 * that section's product attributes, and nothing else.
 *
 * This is a view model, not the authored record: `read.ts` maps `ProductRecord` onto it field by
 * field, so the dataset can grow an authoring-only field (or spec 006 can add a description) with
 * one mapping edit rather than a silent change to what every page reads. Three absences are
 * deliberate and load-bearing:
 *
 *  - **no money.** A price is per destination country and comes from `resolvePrice()`
 *    (TASK-065); a product that could carry an amount is how "prices differ by destination and
 *    never by buyer" (EU 2018/302, `plan/07` §3) would stop being a property of the shape.
 *  - **no label.** Every facet value is a key resolved through the message catalogue
 *    (spec 005 §7); `name` is the one string here that is content rather than a key
 *    (`plan/10` §2.2, registered in `content/i18n/glossary.en.md`).
 *  - **no description, no imagery.** Those are spec 006's (spec 005 §3), and their absence is
 *    exactly why nothing is indexable yet (see `hasIndexableProducts`).
 */
export interface Product {
  /** `FO-XX-NNN`, the natural key `plan/10` §4 upserts on. */
  readonly sku: string;
  /** The English product name; it travels across locales untranslated (`plan/10` §2.2). */
  readonly name: string;
  /** The `en` slug. Per-locale slugs are `product_translation`'s and arrive with spec 006. */
  readonly slug: string;
  readonly productType: ProductType;
  readonly primaryFlower: FlowerType;
  readonly flowerTypes: readonly FlowerType[];
  readonly colourPrimary: Colour;
  readonly colours: readonly Colour[];
  readonly style: Style;
  readonly priceTier: PriceTier;
  readonly occasions: readonly OccasionKey[];
  readonly substitutionClass: SubstitutionClass;
  readonly vaseIncluded: boolean;
  /** Nominal stem count of the default tier, or `null` where a stem count is meaningless. */
  readonly stemCount: number | null;
  readonly freshnessDays: number;
  readonly allergenNote: boolean;
  readonly partnerOnly: boolean;
  readonly status: ProductStatus;
}

/** One category: which facet its key is drawn from, its label key and its listing order. */
export interface Category {
  readonly key: string;
  readonly kind: CategoryKind;
  readonly labelKey: string;
  readonly sort: number;
}

/** One occasion. The per-country calendar is `occasion_country`'s and spec 009's (§3). */
export interface Occasion {
  readonly key: OccasionKey;
  readonly kind: OccasionKind;
  readonly labelKey: string;
  readonly sort: number;
}

/**
 * A canonical facet selection: for each facet the buyer filtered on, the values they chose, in
 * the taxonomy's own order and without duplicates. Absent facets carry no key at all, so two
 * selections are equal exactly when they filter the same way — which is what makes
 * `resolveFacets()` order-independent (spec 005 §2 "Taxonomy", `plan/02` §7).
 */
export type FacetSelection = Readonly<
  Partial<Record<FacetName, readonly string[]>>
>;

/**
 * What `resolveFacets()` returns.
 *
 * `indexable` is the literal `false`, not a `boolean`: every parameterised facet combination is
 * `noindex,follow` with its canonical pointing at the unparameterised page (`plan/02` §7), and a
 * type that cannot hold `true` is how a colour or price facet URL cannot become indexable by
 * accident. Only an **authored** path may ever be indexable, and `isAuthoredFacetPath()` returns
 * `false` for everything in Phase 0.
 */
export interface FacetResolution {
  readonly facets: FacetSelection;
  /**
   * The selection as one stable string — facets in `plan/10` §1.1 order, values in taxonomy
   * order, `facet=a,b` joined by `&`. A cache and comparison key, **never a published URL**:
   * facet URLs are `noindex` and canonicalise to the page without parameters.
   */
  readonly canonicalQuery: string;
  /**
   * Parameters and values that were dropped, as `name` or `name=value`, sorted. A search box, a
   * `page`, a `sort` or a typo lands here instead of silently widening a filter.
   */
  readonly ignored: readonly string[];
  readonly indexable: false;
}

/**
 * Why a product is, or is not, indexable in one (locale, destination) — spec 005 §6's predicate
 * term by term, so the answer is legible rather than a bare `false`.
 *
 * `descriptionPresent` and `translationReviewed` are the two terms Phase 0 cannot satisfy: the
 * dataset ships **no** description and no
 * `product_translation` row at all (spec 005 §2 "Deliberately absent", AC-6), and spec 005 §6 is
 * explicit that a non-null, reviewed description in the locale is required. So every product is
 * non-indexable today, which is the intended outcome — "a product with no description is
 * non-indexable rather than filled with generated copy" (spec 005 §3) — and it flips to `true`
 * as **data** when spec 006's importer lands the copy behind the provider seam.
 */
export interface ProductIndexability {
  readonly countryLive: boolean;
  readonly productActive: boolean;
  readonly activePrice: boolean;
  /** A non-null description exists in this locale (spec 006's importer lands it). */
  readonly descriptionPresent: boolean;
  /** That translation is `reviewed`, not a machine draft (spec 003 §6, `plan/13` B12). */
  readonly translationReviewed: boolean;
  readonly localeIndexable: boolean;
  /** The conjunction of the six terms above, and nothing else (spec 005 §6, AC-21). */
  readonly indexable: boolean;
}

/* -------------------------------------------------------------------------- */
/* Tiers and add-ons (spec 005 §2 "Tiers and add-ons", §5.2 `types.ts`;        */
/* TASK-064).                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One size step of a product as the read API hands it over — `plan/10` §2.2's ladder, with the
 * preselection as **data**.
 *
 * `isDefault` is the field this type exists for. `plan/04` §16's A/B test #2 is "12 vs 18 stems",
 * so which tier a PDP preselects has to be an authored row (`product_tier.is_default`, spec 002
 * §14 A1 (b), spec 005 §13 Q6): a tier preselected in code could not be varied per product and
 * could not be tested at all.
 *
 * Two absences carry as much weight as the fields:
 *
 *  - **no name.** `labelKey` is a message key — `catalog.tier.stems` (an ICU plural, so Polish
 *    gets *łodyga / łodygi / łodyg*), `catalog.tier.size.{s,m,l}` or `catalog.tier.single`. Tier
 *    *names* do not exist in this codebase (spec 005 §7, §13 Q4: plain stem counts, no marketing
 *    adjective), so there is nothing here to translate and nothing to concatenate.
 *  - **no money.** The stepped amounts are authored `country_price` rows read by `resolvePrice()`
 *    (TASK-065). A percentage applied at render would be a float and a rounding bug (spec 005
 *    §5.2), and an amount on this type would be a price without VAT, delivery or its
 *    decomposition — which `PricePoint` exists to make unrepresentable (AC-8).
 */
export interface Tier {
  /** `stems_{n}`, `size_{s|m|l}` or `single` (spec 005 §13 Q4). */
  readonly tierKey: string;
  /** A `catalog.tier.*` message key, never a label (spec 005 §7). */
  readonly labelKey: string;
  /** The nominal stem count, or `null` for an S/M/L arrangement or a single plant. */
  readonly stems: number | null;
  /** Listing order inside the product, contiguous from 0. */
  readonly sort: number;
  /** The tier the PDP preselects. Exactly one tier of a product carries `true`. */
  readonly isDefault: boolean;
}

/**
 * One add-on as offerable in one destination country (spec 005 §2 "Tiers and add-ons", AC-19).
 *
 * **There is no `defaultSelected` and no `preselected` field, and there may not be one.** CRD
 * Art. 22 forbids a pre-ticked extra (`plan/07` §2.1), and the prohibition is discharged *by
 * absence*: there is no field to set, `AddonSchema` is `.strict()`, and `pnpm catalogue:check`'s
 * `addon-preselection` mode fails if one is ever declared or authored. That is a stronger
 * guarantee than a review comment, and AC-19 pins both halves of it.
 *
 * **`vatRateBp` is per (add-on, destination) and is its own rate**, read from the one active
 * `addon_country_price` row (spec 002 §14 A1 (a), spec 005 §13 Q3): in Poland chocolates are 23%
 * while flowers are 8% (`plan/06` §4 item 4), so an add-on that inherited the country's flower
 * rate would invoice the first mixed basket wrong. The rate travels with the add-on; the *amount*
 * does not, for the same reason `Tier` carries none — a price is a `PricePoint` and comes from
 * `pricing/*` (TASK-065), whole or not at all.
 */
export interface Addon {
  readonly key: AddonKey;
  readonly kind: AddonKind;
  /** `catalog.addon.{key}.name`; the copy is the message catalogue's (spec 005 §7). */
  readonly nameKey: string;
  readonly descriptionKey: string;
  /** A food add-on needs the allergen line (`plan/10` §1.1). */
  readonly allergenNoteRequired: boolean;
  /**
   * The add-on is sourced by the florist rather than by us — `cake`'s property (`plan/10` §1.1
   * "partner-sourced only", spec 005 §2). A caller shows it only where a partner can supply it;
   * spec 016's routing owns which partner that is.
   */
  readonly partnerOnly: boolean;
  /**
   * The feature-flag key that licences this add-on in this destination
   * (`addon.wine.{country}` — `plan/10` §1.1, `plan/07` §6's alcohol row), or `null` for an
   * unflagged add-on. Present so a caller can say *why* an add-on is offered; whether it is
   * offered has already been decided, because a disabled add-on is not in the list at all.
   */
  readonly flagKey: string | null;
  /** This add-on's own VAT rate in the destination, in basis points (PL: 2 300 vs flowers 800). */
  readonly vatRateBp: number;
  readonly sort: number;
}

/* -------------------------------------------------------------------------- */
/* Pricing core (spec 005 §2 "Pricing", §5.2 `pricing/*`, AC-8/13/16;          */
/* TASK-065).                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Money in integer minor units: spec 003's `Money` with the amount narrowed to a `number`
 * (`MinorUnitsSchema`), which is what makes exact integer addition — and therefore
 * `netAmountMinor + vatAmountMinor === amountMinor` — expressible at all (spec 005 §5.2).
 *
 * It stays **assignable to** spec 003's `Money`, so `formatMoney` remains the only formatter and
 * this module defines no second money type and no second renderer (a type-level assertion in
 * `tests/unit/catalog-pricing-money.test.ts` pins that).
 *
 * An `IntegerMoney` is an *amount* — a VAT figure, a surcharge, a subtotal — and never the
 * **price of something a buyer can buy**: a price is a whole `PricePoint` or it is not in this
 * module's vocabulary (AC-8). That distinction is why `money.ts` is arithmetic only and why no
 * function returns an amount where a page would render a price.
 */
export interface IntegerMoney {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

/**
 * One surcharge as it applies to **one delivery date** (spec 005 §2 "Pricing", AC-16).
 *
 * `dateSurcharges()` returns these over a date range so spec 009 can put the exact amount on the
 * date chip **before** the date is selected, which `plan/07` §4 requires: the row carries the
 * amount and its label key, so nothing has to be computed, guessed or multiplied at render.
 */
export interface DatedSurcharge extends Surcharge {
  /** The delivery date this surcharge applies to, inside the row's own window. */
  readonly date: IsoDate;
}

/**
 * One tier of a product with its whole price in the destination's own currency (spec 005 §5.2
 * `tierPrices`).
 *
 * The price is a `PricePoint`, so a tier ladder cannot be rendered as a set of amounts that omit
 * VAT, delivery or the date's surcharges (AC-8), and `isDefault` travels with it so the PDP's
 * preselected tier and its price come from one call (`product_tier.is_default`, §13 Q6).
 */
export interface TierPrice {
  readonly tierKey: string;
  readonly isDefault: boolean;
  readonly price: PricePoint;
}

/**
 * One line of a basket as `vatBreakdown()` reads it: a **gross** amount and the rate it carries
 * (spec 005 §2 "Pricing", §8 "VAT", AC-13).
 *
 * Gross, because every amount in this codebase is gross (`plan/07` §4: the price shown is the
 * price charged, VAT and delivery included), and per line, because a mixed basket carries more
 * than one rate — PL flowers at 800 bp with chocolates at 2 300 bp (`plan/06` §4 item 4).
 */
export interface VatLine {
  readonly rateBp: number;
  readonly grossMinor: number;
  readonly currency: CurrencyCode;
}

/**
 * The integer VAT split of every line at one rate (spec 005 §5.2 `vatBreakdown`).
 *
 * `netMinor + vatMinor === grossMinor` per entry and the entries' `grossMinor` sum to the basket
 * total **exactly** (AC-13, 1 000 randomised property-test baskets), because the split is derived
 * from the gross rather than the gross from the split: this is the input to `order.vat_breakdown`
 * (spec 015) and to the invoice's per-rate lines (spec 018, `plan/07` §4), and spec 005 stores
 * none of it.
 */
export interface VatSplit {
  readonly rateBp: number;
  readonly netMinor: number;
  readonly vatMinor: number;
  readonly grossMinor: number;
}

/**
 * One exchange rate as this module uses it: euro-base and published, or **derived** here from one
 * or two published rows (spec 005 §5.2 `FxRateSchema`, §2 "FX and rounding"; TASK-066).
 *
 * The shape is the authored row's, `FxRateData` — parts-per-million integer, calendar `asOf`,
 * a named `source` — because a derived cross rate has to be describable in exactly the terms a
 * stored one is: the projection stamps `ratePpm` and `fxAsOf` into the HTML so spec 008's repaint
 * cannot invent a rate (§5.4), and it must not matter to that caller whether the pair was
 * published or crossed through the euro. `source` says which it was
 * (`ecb-reference`, `ecb-reference:inverse`, `ecb-reference:cross:EUR`), so a conversion is always
 * traceable to the rows it came from.
 *
 * `ratePpm` is the **unbuffered** rate, as the ECB published it. The 2.5% buffer is applied at
 * conversion time and never stored (`plan/06` §2.2): a buffered rate would disagree with the
 * published one and would hide how much movement the buffer is absorbing.
 */
export type FxRate = FxRateData;

/**
 * The result of asking for a price in a display currency (spec 005 §2 "FX and rounding", §7,
 * AC-15; TASK-066).
 *
 * Three variants, because each is a different thing to render, and a **discriminated union**
 * rather than an amount plus a nullable rate, because that is what makes AC-15 structural:
 *
 *  - `native` — the display currency *is* the destination currency, so nothing was converted and
 *    there is no rate to state. The display currency is a presentation choice made from the
 *    locale's default, never a second price row (§7);
 *  - `converted` — the display amount, buffered, rounded up onto the currency's ending, with the
 *    rate and its publication date attached;
 *  - `unavailable` — a `reasonKey` and **nothing else**. There is no amount field on this variant,
 *    so "no converted amount is produced anywhere in the output" when a rate is stale is a
 *    property of the type rather than a review of the caller (AC-15). The caller falls back to the
 *    destination currency's own price and says so.
 */
export type DisplayConversion =
  | { readonly status: "native"; readonly price: IntegerMoney }
  | {
      readonly status: "converted";
      readonly price: IntegerMoney;
      readonly rate: FxRate;
    }
  | {
      readonly status: "unavailable";
      readonly reasonKey: "catalog.availability.fxUnavailable";
    };

/* -------------------------------------------------------------------------- */
/* Projections (spec 005 §5.2 `pricing/project.ts`, §6 "the price identity",   */
/* §7, AC-9/AC-10/AC-11; TASK-067).                                            */
/* -------------------------------------------------------------------------- */

/**
 * The message keys every price- and availability-adjacent state of this module resolves through
 * (spec 005 §7, AC-22; WCAG 3.1.1).
 *
 * They are written out here, once, as literals, because three separate rules meet on them: every
 * `reasonKey` the module can emit must have a string in `messages/en.json` (AC-22), no state may
 * render untranslated or colour-only (§8), and `pnpm i18n:check` must be able to see the key as a
 * fully-qualified literal in `src/` or call it dead. `pricing/fx.ts` already emits
 * `fxUnavailable` on its own union; the other four are named here so that TASK-068's
 * `availability()` resolves *which* one applies rather than inventing a key at its call site.
 */
export const catalogAvailabilityKeys = {
  inStock: "catalog.availability.inStock",
  outOfStock: "catalog.availability.outOfStock",
  countryDemo: "catalog.availability.countryDemo",
  noPartner: "catalog.availability.noPartner",
  fxUnavailable: "catalog.availability.fxUnavailable",
} as const;

/** One of the five `catalog.availability.*` keys, as a literal union. */
export type CatalogAvailabilityKey =
  (typeof catalogAvailabilityKeys)[keyof typeof catalogAvailabilityKeys];

/**
 * The one view model a price-bearing page renders **and** spec 007's `Offer` builder reads
 * (spec 005 §5.2 `PriceProjectionSchema`, §6, §8).
 *
 * Three properties are the reason it is one type rather than two:
 *
 *  1. **The display currency comes from the locale, never from a cookie** (§7, AC-9). The
 *     projection is derived from `displayLocale`'s `currencyDefault`; the `fo_currency` cookie is
 *     read by spec 008's repaint island over identical cached HTML, which is what lets a
 *     price-bearing page be cached once per (locale, country) with no `Vary`.
 *  2. **The price is exposed as parts, never as a pre-built string** (§8): amount, currency, VAT
 *     rate, VAT label key and surcharge rows. `formatMoney` is the only renderer, spec 009
 *     composes the `aria-live` announcement `plan/04` §16 needs from these parts, and
 *     `offerProjection()` reads the same `displayPrice` the page prints — which is the whole of
 *     the price identity AC-11 pins.
 *  3. **A conversion carries its provenance or does not happen.** `fxAsOf`/`ratePpm` are present
 *     exactly when the amount was converted; when the newest rate is too old, `displayPrice` is
 *     the destination country's own price and `fxReasonKey` says so (§13 Q2, AC-15). There is no
 *     state in which a converted amount appears without the rate that produced it.
 */
export interface PriceProjection {
  /** What the page prints, through `formatMoney(displayPrice, displayLocale)` and nothing else. */
  readonly displayPrice: IntegerMoney;
  readonly displayLocale: LocaleCode;
  /** The destination the price is keyed on — the only geography this module has (ADR-0006). */
  readonly destinationCountry: CountryIso2;
  /** The authored price in the destination country's own currency (`plan/10` §2.3). */
  readonly destinationCurrencyPrice: IntegerMoney;
  readonly vatRateBp: number;
  /** `formatPercentFromBasisPoints(vatRateBp, displayLocale)` — the module builds no `Intl`. */
  readonly vatRateText: string;
  /** `catalog.price.inclusive`: a legal formula per locale, not a translation (`plan/07` §4). */
  readonly vatLabelKey: "catalog.price.inclusive";
  readonly deliveryIncluded: true;
  readonly surcharges: readonly Surcharge[];
  /** Publication date of the rate used, present exactly when the amount was converted. */
  readonly fxAsOf?: IsoDate | undefined;
  /** The unbuffered rate used, present exactly when the amount was converted. */
  readonly ratePpm?: number | undefined;
  /** Present exactly when no usable rate existed and the destination currency is being shown. */
  readonly fxReasonKey?: "catalog.availability.fxUnavailable" | undefined;
  readonly priceVersion: string;
  /**
   * The **earlier** of the active row's `active_to` and the FX snapshot's own validity where a
   * conversion is involved — `Offer.priceValidUntil` (spec 005 §6; §14 A3). `null` only when the
   * row is current *and* nothing was converted: a converted amount stops being the price the day
   * its rate stops being usable, whatever the price row says.
   */
  readonly priceValidUntil: IsoDate | null;
  /**
   * Whether this product can be sent to this destination at all, from `availability()` — the
   * seam TASK-067 left open and TASK-068 filled (spec 005 §5.2, AC-20). `offerProjection()` reads
   * it, so the visible availability line and the `Offer`'s schema.org value are one verdict.
   */
  readonly availability: Availability;
}

/**
 * The embedded per-tier price table spec 008's currency-repaint island reads (spec 005 §5.2
 * `PriceTableSchema`, §6 "CWV budget").
 *
 * It is the **one** function of this module that enumerates currencies, and therefore the one
 * exception to AC-9's "no display-currency override": it does not choose a currency, it lists
 * every one we may display (`currency.{code}`, §13 Q11), so a repaint needs no fetch and the HTML
 * still does not vary by visitor. The size refinement (≤6 currencies, ≤512 B serialised per tier)
 * is what keeps that trade honest against spec 004 §14 A1's document budget.
 */
export interface PriceTable {
  readonly productId: string;
  readonly tierKey: string;
  /**
   * The oldest publication date among the rates used, or `null` when no conversion was involved
   * (the destination currency alone) — so a repaint can never show an unstamped amount (§5.4).
   */
  readonly fxAsOf: IsoDate | null;
  /** Display amount per currency, integer minor units of that currency. */
  readonly entries: Readonly<Partial<Record<CurrencyCode, number>>>;
}

/**
 * Schema.org's two availability values, as the URLs Google reads. No other value is expressible:
 * `PreOrder`, `BackOrder` and `LimitedAvailability` describe stock states a relay does not have.
 */
export type OfferAvailability =
  "https://schema.org/InStock" | "https://schema.org/OutOfStock";

/**
 * The typed input spec 007's `Offer` builder consumes — and the manual-action guard of
 * `plan/02` §15 (spec 005 §6, AC-11).
 *
 * Every field is derived from the **same `PriceProjection` the page renders**, so "structured
 * data ≠ visible content" is discharged by construction rather than by a validator run after the
 * fact:
 *
 *  - `price` is `displayPrice.amountMinor` as a plain decimal string at the currency's exponent
 *    (`45.90`, never `45,90` — schema.org requires the dot, and spec 001's `validate-schema`
 *    rejects the comma even when the number is right);
 *  - `priceCurrency` is the **locale's** default currency, the same one in the HTML, because the
 *    cookie override is a client repaint over identical cached HTML (`plan/02` §3);
 *  - `shippingRate` is zero **by definition**: delivery is inside the price (`plan/07` §4);
 *  - `hasMerchantReturnPolicy` is `MerchantReturnNotPermitted`, the perishable-goods position the
 *    PDP and the pay page disclose in words (CRD Art. 16(d), `plan/07` §2.1), so the structured
 *    data and the disclosure agree;
 *  - `availabilityKey` is the message key for the *visible* availability line, so the words and
 *    the schema value cannot drift either.
 *
 * There is exactly one of these per PDP, and none at all for a country that is not `live`
 * (ADR-0007, AC-11): `offerProjection()` returns `null` there rather than an `Offer` describing a
 * purchase nobody can make.
 */
export interface OfferProjection {
  readonly price: string;
  readonly priceCurrency: CurrencyCode;
  readonly priceValidUntil: IsoDate | null;
  readonly availability: OfferAvailability;
  readonly availabilityKey: CatalogAvailabilityKey;
  /** ISO-3166-1 alpha-2 of the destination — `Offer.eligibleRegion` (spec 005 §6). */
  readonly eligibleRegion: CountryIso2;
  /** Always zero, in the offer's own currency: delivery is included in `price`. */
  readonly shippingRate: IntegerMoney;
  readonly hasMerchantReturnPolicy: "https://schema.org/MerchantReturnNotPermitted";
  readonly priceVersion: string;
}

/* -------------------------------------------------------------------------- */
/* Availability, price history and quotes (spec 005 §2, §5.2, §8, AC-14/17/20; */
/* TASK-068).                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Schema.org's three availability states, as the bare tokens `availability()` reports.
 *
 * `PreOrder` is expressible and is **not** produced in Phase 0: it is the value the calendar seam
 * will use for a product that can be ordered now for a later window, and that window is spec
 * 009's (`CutoffEvaluator`, `plan/03` §9/§10). `OfferProjection.availability` still carries only
 * the two URLs a relay can honestly publish, so a `PreOrder` verdict reaches structured data as
 * `OutOfStock` rather than as a promise about a date nobody has evaluated.
 */
export const schemaAvailabilityValues = [
  "InStock",
  "OutOfStock",
  "PreOrder",
] as const;
export type SchemaAvailability = (typeof schemaAvailabilityValues)[number];

/**
 * What `availability()` answers: the schema.org state, the message key for the visible line, and
 * whether a buy path may be rendered at all (spec 005 §2, §5.3, AC-20).
 *
 * `saleable` is separate from `schemaAvailability` because they answer different questions:
 * schema.org describes the offer to a crawler, `saleable` decides whether spec 009 renders an add
 * button and whether spec 007 emits an `Offer` node at all. A `demo` destination is
 * `saleable: false` with `catalog.availability.countryDemo` and no `Offer` (ADR-0007,
 * `plan/02` §9).
 */
export interface Availability {
  readonly schemaAvailability: SchemaAvailability;
  /** One of the five `catalog.availability.*` keys of spec 005 §7 — never a label. */
  readonly reasonKey: CatalogAvailabilityKey;
  readonly saleable: boolean;
}

/**
 * One line of a signed quote: **product id, tier key and the integer amount the buyer saw**, and
 * nothing else (spec 005 §5.2, §8, AC-17).
 *
 * There is no recipient, no address, no buyer, no email, no basket note and no free text here,
 * and there may not be: a quote travels through a form field and a payment intent's metadata, so
 * every field on it is a field we have chosen to expose (`plan/07` §2.2 data minimisation,
 * `CLAUDE.md` "no PII in logs, URLs, analytics"). The key-set equality test of AC-17 pins the
 * shape rather than trusting a review.
 */
export interface QuoteLine {
  readonly productId: string;
  readonly tierKey: string;
  /** The display amount of that line, integer minor units of the quote's own currency. */
  readonly amountMinor: number;
}

/**
 * A stateless, signed price quote (spec 005 §5.2 `QuoteSchema`, §8, §13 Q5, AC-17).
 *
 * Stateless is the design: the digest is an HMAC over the quote's own fields, so spec 013 can
 * verify a quote it did not issue without a table, a session or a lookup — and spec 005 stores
 * nothing and touches no order table (ADR-0009). It carries **no personal data at all**, which is
 * what makes it safe to put in a hidden field and in a payment intent.
 *
 * `expiresAt` is 30 minutes after issue (§13 Q5). On `expired`, the caller re-derives the price
 * and shows the new one for explicit re-confirmation: a silently higher charge is not reachable
 * through this API.
 */
export interface Quote {
  /** A deterministic, non-secret id of the quoted content: no counter, no random, no PII. */
  readonly quoteId: string;
  readonly lines: readonly QuoteLine[];
  /** The sum of the line amounts, in `currency` — refined, not assumed (`QuoteSchema`). */
  readonly totalMinor: number;
  readonly currency: CurrencyCode;
  /** The rate's publication date when the amounts were converted, `null` when they were not. */
  readonly fxAsOf: IsoDate | null;
  /** The unbuffered rate used, `null` when no conversion was involved. */
  readonly ratePpm: number | null;
  /** The priced rows behind the lines, in line order — this module's own opaque token. */
  readonly priceVersion: string;
  /** ISO-8601 instant, 30 minutes after issue (§13 Q5). */
  readonly expiresAt: string;
  /** Hex SHA-256 HMAC over every field above, in a canonical order. */
  readonly digest: string;
}

/**
 * `verifyQuote()`'s three answers (spec 005 §5.2, AC-17).
 *
 *  - `ok` — the signature holds, the clock is inside the window, and every priced row behind it
 *    still resolves to the same amount;
 *  - `expired` — nothing is wrong with the quote, it is simply no longer the price: the clock is
 *    past `expiresAt`, or a row moved under it. The caller re-derives and asks the buyer to
 *    confirm the new figure explicitly;
 *  - `tampered` — the digest does not match the content, so the quote was altered after issue.
 *    There is no fourth answer and no `ok`-with-a-warning.
 */
export type QuoteVerdict = "ok" | "expired" | "tampered";
