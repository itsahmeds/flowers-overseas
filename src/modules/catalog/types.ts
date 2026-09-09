/**
 * The catalogue module's money types (spec 005 §5.2 `types.ts`; TASK-060).
 *
 * This file carries the types spec 005 fixes for money — a `PricePoint` (the all-in gross price of
 * one tier in one destination country, with its own decomposition) and the `Surcharge` rows that
 * are part of it — and, since TASK-063, the **taxonomy read models** the read API hands over:
 * `Product`, `Category`, `Occasion`, `FacetSelection`, `FacetResolution` and `ProductIndexability`.
 * The rest of spec §5.2's list — `Tier`, `Addon`, `PriceProjection`, `PriceTable`, `Availability`,
 * `Quote` — arrives with the tasks that own its data and its arithmetic (TASK-064 … TASK-068);
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
  CategoryKind,
  Colour,
  FacetName,
  FlowerType,
  OccasionKey,
  OccasionKind,
  PriceTier,
  ProductStatus,
  ProductType,
  Style,
  SubstitutionClass,
} from "@/config/catalogue/schemas";
import type { CurrencyCode } from "@/config/currencies";

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
 * `reviewedCopy` is the term Phase 0 cannot satisfy: the dataset ships **no** description and no
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
  readonly reviewedCopy: boolean;
  readonly localeIndexable: boolean;
  /** The conjunction of the five terms above, and nothing else (spec 005 §6). */
  readonly indexable: boolean;
}
