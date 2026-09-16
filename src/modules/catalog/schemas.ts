/**
 * The catalogue module's money schemas (spec 005 §5.2 "Zod schemas", AC-8; TASK-060).
 *
 * `MoneySchema` is **reused, not redefined** (spec 005 §5.2): it comes from spec 003's
 * `src/modules/i18n/format.ts` through the `i18n` barrel, which is also where the currency set is
 * closed (`src/config/currencies.ts`). One money type, one formatter (`formatMoney`), no second
 * definition of either — a second one is how "price shown = price charged" stops being checkable.
 *
 * Everything below is parsed at the boundary (`plan/12` §2). The dataset schemas — closed facet
 * enums, `ProductSchema`, `ProductTierSchema`, `AddonSchema` and their `to*Row()` projections —
 * belong to `src/config/catalogue/` and land with the dataset (TASK-061); `FacetSelectionSchema`
 * and the read API's other boundary schemas landed with the taxonomy read API (TASK-063),
 * `ProductTierSchema` and `AddonSchema` with the tier and add-on read API (TASK-064), and
 * `PriceProjectionSchema`, `PriceTableSchema`, `AvailabilitySchema` and `QuoteSchema` land with
 * the functions that produce them (TASK-065 … TASK-068). Nothing here computes a price.
 */
import { z } from "zod";

import {
  type FacetName,
  FxRateDataSchema,
  SkuSchema,
  SlugSchema,
  addonKeys,
  addonKinds,
  facetNames,
  facetValues,
  productStatuses,
  scopedFlagKey,
} from "@/config/catalogue/schemas";
import { type CountryIso2, isCountryIso2 } from "@/config/countries";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { LISTING_PAGE_TYPES, MoneySchema } from "@/modules/i18n";

import type { ListingSearchParams } from "./types";
import {
  catalogAvailabilityKeys,
  listingSorts,
  schemaAvailabilityValues,
  slugKinds,
  surchargeKinds,
} from "./types";

/**
 * Integer minor units, as a `number`.
 *
 * This deliberately narrows `MoneySchema`'s `number | bigint` (spec 003 widened it so that
 * 2^53 + 1 minor units can be *formatted* exactly): a `PricePoint` is decomposed by exact integer
 * addition — `netAmountMinor + vatAmountMinor === amountMinor` — and mixing `number` with `bigint`
 * in that sum is a TypeScript error, so allowing both here would make the refinement below
 * unwritable. A retail flower price is six orders of magnitude below `Number.MAX_SAFE_INTEGER`,
 * and `.int()` rejects a float, a numeric string and `NaN` (`fo/no-float-money`, `plan/12` §2).
 */
export const MinorUnitsSchema = z.number().int();

/** A `date` column of spec 002 §5.1: a calendar day, never a timestamp, never a locale string. */
export const IsoDateSchema = z.iso.date();

/** Basis points, 0–10 000: `country.vat_rate_bp`'s domain (spec 002 §5.1). */
export const BasisPointsSchema = z.number().int().min(0).max(10_000);

/** A message key, resolved through the catalogue at render time — never a label (spec 005 §7). */
export const MessageKeySchema = z.string().min(1);

/**
 * A `product_tier.tier_key`: `stems_12`, `size_m`, `single` (spec 005 §13 Q4).
 *
 * Non-empty and nothing more: the closed set is the *product's* authored ladder, so a key that
 * does not belong to a product is a missing-row error at resolution rather than a parse error
 * here — which is what keeps "this tier has no price in this destination" a legible failure.
 */
export const TierKeySchema = z.string().min(1);

/**
 * `MoneySchema` with the amount narrowed to an integer `number` (see `MinorUnitsSchema`). Built by
 * extending the spec 003 schema so the currency set stays defined in exactly one place: adding a
 * currency is a row in `src/config/currencies.ts` and nothing else.
 */
export const IntegerMoneySchema = MoneySchema.extend({
  amountMinor: MinorUnitsSchema,
});

/**
 * One dated surcharge row (spec 005 §5.2, §13 Q7). An amount and two dates: `dateSurcharges()`
 * (TASK-066) returns these so spec 009 can put the exact amount on the date chip **before**
 * selection, which `plan/07` §4 requires and a percentage could not do.
 */
export const SurchargeSchema = IntegerMoneySchema.extend({
  kind: z.enum(surchargeKinds),
  amountMinor: MinorUnitsSchema.nonnegative(),
  appliesFrom: IsoDateSchema,
  appliesTo: IsoDateSchema,
  labelKey: MessageKeySchema,
}).strict();

/**
 * The all-in gross price of one tier in one destination country, with its own decomposition
 * (spec 005 §5.2, AC-8).
 *
 * Two refinements are the whole point of the schema, and together they mean a `PricePoint` that
 * omits VAT or delivery **cannot be constructed** at all:
 *
 *  - `deliveryIncluded` is the literal `true`, so `false` is a parse error and a type error;
 *  - `netAmountMinor + vatAmountMinor === amountMinor`, exact integer arithmetic, so the invoice
 *    decomposition (spec 018) and the displayed price (spec 009) cannot drift apart by a cent.
 *
 * `resolvePrice()` (TASK-066) is the only producer; it parses through here.
 */
export const PricePointSchema = IntegerMoneySchema.extend({
  amountMinor: MinorUnitsSchema.nonnegative(),
  vatRateBp: BasisPointsSchema,
  vatAmountMinor: MinorUnitsSchema.nonnegative(),
  netAmountMinor: MinorUnitsSchema.nonnegative(),
  deliveryIncluded: z.literal(true),
  surcharges: z.array(SurchargeSchema).readonly(),
  activeFrom: IsoDateSchema,
  activeTo: IsoDateSchema.nullable(),
  priceVersion: z.string().min(1),
})
  .strict()
  .refine(
    (point) =>
      point.netAmountMinor + point.vatAmountMinor === point.amountMinor,
    {
      error:
        "netAmountMinor + vatAmountMinor must equal amountMinor (spec 005 AC-8)",
      path: ["amountMinor"],
    },
  );

/* -------------------------------------------------------------------------- */
/* Read-API boundary schemas (spec 005 §5.2, `plan/12` §2; TASK-063).          */
/* -------------------------------------------------------------------------- */

/**
 * A destination country code, built from `src/config/countries.ts` rather than re-listing the
 * seven codes: taking a country live is a data flip, so the read API's domain has to move with
 * the registry (`CLAUDE.md`, `plan/10` §4).
 *
 * It is a **destination**, and it is the only geography any function in this module accepts:
 * there is no buyer country, no IP and no visitor location anywhere in the signature set
 * (EU 2018/302, ADR-0006, AC-18).
 */
export const DestinationIsoSchema = z.custom<CountryIso2>(
  (value) => typeof value === "string" && isCountryIso2(value),
  { error: "must be a destination configured in src/config/countries.ts" },
);

/** A configured locale code, from `src/config/locales.ts` — same reason as the destination. */
export const LocaleCodeSchema = z.custom<LocaleCode>(
  (value) => typeof value === "string" && isLocaleCode(value),
  { error: "must be a locale configured in src/config/locales.ts" },
);

/** A `product.sku`, reused from the dataset's own schema so the key rule lives in one place. */
export const ProductSkuSchema = SkuSchema;

/**
 * A canonical facet selection (spec 005 §5.2 `FacetSelectionSchema`).
 *
 * The refinements are what "canonical" means, and they are checked rather than assumed because
 * `listProducts()` accepts a selection from a caller as well as from `resolveFacets()`: every
 * value belongs to its facet's closed set (`plan/10` §1.1), no facet repeats a value, values are
 * in taxonomy order, and an empty value list is not a facet — it is the absence of one, so
 * `{ colour: [] }` cannot masquerade as "filter on no colour".
 */
export const FacetSelectionSchema = z
  .partialRecord(z.enum(facetNames), z.array(z.string()).readonly())
  .superRefine((selection, ctx) => {
    for (const [facet, values] of Object.entries(selection) as [
      FacetName,
      readonly string[],
    ][]) {
      if (values.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: [facet],
          message: `\`${facet}\` selects no value; omit the facet instead (spec 005 §5.2)`,
        });
        continue;
      }
      const allowed = facetValues[facet];
      const canonical = allowed.filter((value) => values.includes(value));
      for (const value of values) {
        if (!allowed.includes(value)) {
          ctx.addIssue({
            code: "custom",
            path: [facet],
            message: `\`${value}\` is not a \`${facet}\` facet value of plan/10 §1.1`,
          });
        }
      }
      if (
        canonical.length === values.length &&
        canonical.some((value, index) => value !== values[index])
      ) {
        ctx.addIssue({
          code: "custom",
          path: [facet],
          message: `\`${facet}\` values must be in taxonomy order (${canonical.join(", ")}); a selection is canonical or it is not comparable`,
        });
      }
      if (new Set(values).size !== values.length) {
        ctx.addIssue({
          code: "custom",
          path: [facet],
          message: `\`${facet}\` repeats a value`,
        });
      }
    }
  });

/**
 * The `searchParams` shape a Next.js page hands to `resolveFacets()`: the awaited object, or a
 * `URLSearchParams`, which the function normalises before parsing. Unknown parameters are not a
 * parse error — a buyer can put anything in a query string and a page must still render — they
 * are reported in `ignored` (`plan/02` §7: facets are `noindex`, not rejected).
 */
export const FacetSearchParamsSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()), z.undefined()]),
);

/**
 * `listProducts()`'s query. Every field is optional and every default is stated in `read.ts`;
 * `.strict()` so a misspelt filter is a parse error rather than a silently wider list.
 *
 * There is no `sort`, no `q` and no relevance parameter: search and ranking are spec 008's (§3),
 * and this module exposes one deterministic default order so 008's "sorted by bestsellers"
 * disclosure has something true to describe (`plan/07`, Omnibus ranking transparency).
 */
export const ListProductsQuerySchema = z
  .object({
    facets: FacetSelectionSchema.optional(),
    /** Keep only products with an active retail price for this **destination**. */
    countryIso: DestinationIsoSchema.optional(),
    /** Defaults to `["active"]`: a draft or retired product is not listed unless asked for. */
    statuses: z.array(z.enum(productStatuses)).min(1).readonly().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .strict();

/** The prebuild ordering's count (`plan/01` §3's "top 50 products per live locale"). */
export const PrebuildCountSchema = z.number().int().positive();

/* -------------------------------------------------------------------------- */
/* Tier and add-on boundary schemas (spec 005 §5.2, AC-19; TASK-064).          */
/* -------------------------------------------------------------------------- */

/**
 * One tier as the read API hands it over (`ProductTierSchema` of spec 005 §5.2).
 *
 * The dataset's own `ProductTierDataSchema` already refuses a tier key that disagrees with its
 * stem count and a label key that is not the one spec 005 §7 fixes; this is the *read* boundary,
 * so it re-states only what a caller can rely on and adds nothing a row could not satisfy. There
 * is no price field, because a tier is not priced — `resolvePrice()` is (TASK-065).
 */
/**
 * A dotted feature-flag key (`addon.wine.PL`, `currency.PLN`) — the shape spec 002's
 * `feature_flag` / `feature_flag_scope` pair keys on, parsed at the seam's boundary
 * (`plan/12` §2). Built by `scopedFlagKey()`, never string-concatenated at a call site.
 */
export const FlagKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(?:\.[A-Za-z0-9_]+)+$/,
    "must be a dotted feature-flag key, e.g. `addon.wine.PL` (spec 005 §12)",
  );

/**
 * The display-currency flag key of a currency code — `EUR` → `currency.EUR` (spec 005 §12,
 * §13 Q11; TASK-067).
 *
 * The **only** builder of a `currency.*` key, for `scopedFlagKey()`'s own reason: the key spec
 * 002's `feature_flag` seeds and the key `priceTable()` reads must be the same string, and a
 * concatenation at a call site is how they stop being.
 */
export function currencyFlagKey(code: string): string {
  return FlagKeySchema.parse(scopedFlagKey("currency", code));
}

export const ProductTierSchema = z
  .object({
    tierKey: z.string().min(1),
    labelKey: MessageKeySchema,
    stems: z.number().int().positive().nullable(),
    sort: z.number().int().min(0),
    isDefault: z.boolean(),
  })
  .strict();

/**
 * The keys no add-on shape may carry, in any casing (spec 005 §8, AC-19).
 *
 * CRD Art. 22's prohibition on pre-ticked extras is discharged **by absence**: this list is the
 * one place the forbidden names are written down, `AddonSchema` refuses them at the read boundary,
 * and `pnpm catalogue:check`'s `addon-preselection` mode refuses them in the authored dataset and
 * in the declared types. So there is no field to set rather than a rule to remember.
 */
export const FORBIDDEN_ADDON_FIELDS = [
  "defaultSelected",
  "preselected",
  "defaultOn",
  "selected",
  "checked",
] as const;

/**
 * One add-on as offerable in one destination, with **its own** VAT rate (`AddonSchema` of spec 005
 * §5.2, AC-19).
 *
 * `.strict()` is load-bearing twice over: it rejects an unknown field, so a `defaultSelected`
 * smuggled into a caller's object is a parse error (CRD Art. 22), and it rejects a stray amount,
 * so an add-on price can only ever arrive as a whole `PricePoint` (AC-8). `vatRateBp` is
 * **required** — every add-on carries its own rate (spec 005 §13 Q3, spec 002 §14 A1 (a)).
 */
export const AddonSchema = z
  .object({
    key: z.enum(addonKeys),
    kind: z.enum(addonKinds),
    nameKey: MessageKeySchema,
    descriptionKey: MessageKeySchema,
    allergenNoteRequired: z.boolean(),
    partnerOnly: z.boolean(),
    flagKey: z.string().min(1).nullable(),
    vatRateBp: BasisPointsSchema,
    sort: z.number().int().min(0),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Pricing-core boundary schemas (spec 005 §5.2, `plan/12` §2; TASK-065).      */
/* -------------------------------------------------------------------------- */

/**
 * `resolvePrice()`'s query — and, with `dateSurcharges()`'s range below, the whole geography this
 * module's pricing surface has (spec 005 §2 "Pricing", §8 "Geo-blocking", AC-18).
 *
 * **Four fields, and the absences are the specification.** There is no buyer country, no IP, no
 * `Accept-Language`, no header, no session, no customer, no order history and no locale: a price
 * is keyed on the **destination** and on the delivery date, so "a French buyer and a German buyer
 * sending to Warsaw see the same price" is a property of this shape rather than of a review
 * (EU 2018/302, ADR-0006, `plan/07` §3). Behavioural price discrimination is likewise not
 * expressible, which is a DMCC position as well as a GDPR one (spec 005 §8).
 *
 * `.strict()`, so a caller that adds one of those dimensions gets a parse error rather than a
 * silently ignored field.
 */
export const ResolvePriceQuerySchema = z
  .object({
    /** A `product.sku`; the spec's parameter name for it is `productId` (§5.2). */
    productId: ProductSkuSchema,
    tierKey: z.string().min(1),
    countryIso: DestinationIsoSchema,
    /**
     * The delivery date, which decides the **surcharge rows** that apply (spec 005 §13 Q7).
     * Omitted means "no dated surcharge": the base price of the tier in that destination.
     */
    deliveryDate: IsoDateSchema.optional(),
  })
  .strict();

/** `tierPrices()`'s query: the same fields without the tier, since it prices every tier. */
export const TierPricesQuerySchema = ResolvePriceQuerySchema.omit({
  tierKey: true,
});

/**
 * `fromPrice()`'s query. No date, because a "from" figure names the cheapest tier of a product in
 * a destination and a date-dependent surcharge would make it a price no configuration matches
 * (spec 005 §6 "AggregateOffer and from prices", §13 Q10).
 */
export const FromPriceQuerySchema = ResolvePriceQuerySchema.omit({
  tierKey: true,
  deliveryDate: true,
});

/**
 * The **maximum** span `dateSurcharges()` will enumerate, in days.
 *
 * A date picker asks about a few weeks (`plan/04` §16); a year and a day is far past any real
 * question and bounds the work a caller can ask for on an ISR miss. It is a guard, not a
 * calendar: 005 owns no date arithmetic beyond a calendar-day step (spec 005 §3 — cutoff,
 * holidays, occasion dates and time zones are spec 009's).
 */
export const MAX_SURCHARGE_RANGE_DAYS = 366;

/**
 * A closed, inclusive range of delivery dates (spec 005 §5.2 `dateSurcharges(countryIso,
 * dateRange)`).
 *
 * Both ends are calendar days, never timestamps and never locale strings, so the range carries no
 * time zone to disagree about; `from <= to` and the span cap are refinements rather than caller
 * conventions.
 */
export const SurchargeDateRangeSchema = z
  .object({
    from: IsoDateSchema,
    to: IsoDateSchema,
  })
  .strict()
  .superRefine((range, ctx) => {
    if (range.to < range.from) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "`to` must not be before `from`",
      });
      return;
    }
    if (daysBetween(range.from, range.to) + 1 > MAX_SURCHARGE_RANGE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `a surcharge range spans at most ${String(MAX_SURCHARGE_RANGE_DAYS)} days (spec 005 §5.2)`,
      });
    }
  });

/**
 * Whole calendar days between two `YYYY-MM-DD` days, `to - from`.
 *
 * `Date.UTC` on the parsed parts, so no local time zone and no DST enter the count: a calendar day
 * has no zone, which is the only date fact this module knows (spec 005 §3).
 */
export function daysBetween(from: string, to: string): number {
  const asUtc = (day: string): number => {
    const [year, month, date] = day.split("-").map(Number);
    return Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1);
  };
  return Math.round((asUtc(to) - asUtc(from)) / 86_400_000);
}

/**
 * A gross amount and the rate it carries, with no currency: `netFromGross()`'s boundary.
 *
 * A rate applies to an amount, not to a currency — a VAT split is the same arithmetic in every
 * currency — so asking for one here would be a field the function does not use and a caller could
 * get wrong. The currency *is* checked where it means something: `vatBreakdown()` asserts one
 * currency across the basket (spec 005 §5.2).
 */
export const GrossAtRateSchema = z
  .object({
    rateBp: BasisPointsSchema,
    grossMinor: MinorUnitsSchema.nonnegative(),
  })
  .strict();

/**
 * One line of a basket for `vatBreakdown()`: a gross amount and its own rate (AC-13).
 *
 * `.strict()` and gross-only — there is no net field to hand in, so a caller cannot present a
 * VAT-exclusive amount to the function that produces the invoice's rate lines (`plan/07` §4).
 */
export const VatLineSchema = z
  .object({
    rateBp: BasisPointsSchema,
    grossMinor: MinorUnitsSchema.nonnegative(),
    currency: MoneySchema.shape.currency,
  })
  .strict();

/** One rate's integer split. `netMinor + vatMinor === grossMinor` is refined, not documented. */
export const VatSplitSchema = z
  .object({
    rateBp: BasisPointsSchema,
    netMinor: MinorUnitsSchema.nonnegative(),
    vatMinor: MinorUnitsSchema.nonnegative(),
    grossMinor: MinorUnitsSchema.nonnegative(),
  })
  .strict()
  .refine((split) => split.netMinor + split.vatMinor === split.grossMinor, {
    error: "netMinor + vatMinor must equal grossMinor (spec 005 AC-13)",
    path: ["grossMinor"],
  });

/**
 * One exchange rate at the module's boundary (spec 005 §5.2 `FxRateSchema`; TASK-066).
 *
 * Deliberately **the dataset's schema itself**, not a copy of it: `FxRateDataSchema` already
 * states every rule a rate has to satisfy — a positive parts-per-million integer, a calendar
 * `asOf`, a non-empty `source`, `.strict()`, and no rate from a currency to itself — and a second
 * definition here could drift from the one `pnpm catalogue:check` gates the snapshot with. The
 * rates `pricing/fx.ts` *derives* (an inverse, a euro cross) are parsed through it too, so a
 * derived rate cannot be looser than a published one.
 */
export const FxRateSchema = FxRateDataSchema;

/* -------------------------------------------------------------------------- */
/* Availability boundary schemas (spec 005 §5.2, §5.3, AC-20; TASK-068).       */
/* -------------------------------------------------------------------------- */

/**
 * `availability()`'s query (spec 005 §2 "Availability").
 *
 * A product, a **destination** and, optionally, a delivery date — and `.strict()`, so a buyer
 * country, an IP, a header or a locale is a parse error rather than a review comment (EU
 * 2018/302, ADR-0006, AC-18). The date is parsed and interpreted by nobody here: the calendar is
 * spec 009's (`plan/03` §9/§10).
 */
export const AvailabilityQuerySchema = z
  .object({
    productId: ProductSkuSchema,
    countryIso: DestinationIsoSchema,
    date: IsoDateSchema.optional(),
  })
  .strict();

/**
 * One availability verdict (spec 005 §5.2 `AvailabilitySchema`, AC-20, AC-22).
 *
 * Two refinements keep the three fields from drifting apart, because each pair of them is read by
 * a different consumer — the visible line by spec 009, the schema.org value by spec 007, the buy
 * path by both:
 *
 *  - an `InStock` verdict is saleable and carries the `inStock` key; an `OutOfStock` one is not
 *    saleable. A page that showed "Available to order" beside a disabled button, or an `Offer`
 *    with `InStock` for a destination we do not serve, is `plan/02` §9's misleading structured
 *    data — and now unrepresentable;
 *  - the reason key is one of the five `catalog.availability.*` keys spec 005 §7 enumerates and
 *    `messages/en.json` carries, so no availability state can render untranslated (AC-22).
 */
export const AvailabilitySchema = z
  .object({
    schemaAvailability: z.enum(schemaAvailabilityValues),
    reasonKey: z.enum([
      catalogAvailabilityKeys.inStock,
      catalogAvailabilityKeys.outOfStock,
      catalogAvailabilityKeys.countryDemo,
      catalogAvailabilityKeys.noPartner,
      catalogAvailabilityKeys.fxUnavailable,
    ]),
    saleable: z.boolean(),
  })
  .strict()
  .refine(
    (state) =>
      state.schemaAvailability !== "InStock" ||
      (state.saleable && state.reasonKey === catalogAvailabilityKeys.inStock),
    {
      error:
        "an `InStock` verdict is saleable and carries the `inStock` key (spec 005 §5.3, plan/02 §9)",
      path: ["schemaAvailability"],
    },
  )
  .refine(
    (state) => state.schemaAvailability !== "OutOfStock" || !state.saleable,
    {
      error:
        "an `OutOfStock` verdict is never saleable: a buy path over it is a price nobody can pay (spec 005 §5.3)",
      path: ["saleable"],
    },
  );

/* -------------------------------------------------------------------------- */
/* Projection boundary schemas (spec 005 §5.2, §6, AC-9/AC-11; TASK-067).      */
/* -------------------------------------------------------------------------- */

/**
 * `priceProjection()`'s query (spec 005 §7, AC-9).
 *
 * **There is no currency field, and there may not be one.** The display currency is the locale's
 * `currencyDefault` and nothing else: a `currency` parameter here is how a well-meaning caller
 * would read the `fo_currency` cookie server-side, and cached HTML would then differ per visitor
 * with no `Vary` (`plan/02` §3, `plan/03` §1). `.strict()` turns that into a parse error rather
 * than a review comment, and `priceTable()` — which enumerates *every* display currency instead
 * of choosing one — is the single sanctioned way to serve a currency switch.
 *
 * `now` is the instant the projection is evaluated at, and it is here for `pricing/fx.ts`'s
 * reason: the rate's age decides whether the amount is converted at all, so a test must be able
 * to move the clock without waiting two days.
 */
export const PriceProjectionQuerySchema = z
  .object({
    productId: ProductSkuSchema,
    tierKey: z.string().min(1),
    countryIso: DestinationIsoSchema,
    deliveryDate: IsoDateSchema.optional(),
    now: z.date().optional(),
  })
  .strict();

/** `fromPriceProjection()`'s query: no tier (it names the cheapest) and no date (§13 Q10). */
export const FromPriceProjectionQuerySchema = PriceProjectionQuerySchema.omit({
  tierKey: true,
  deliveryDate: true,
});

/** `priceTable()`'s query: a product and a destination; every display currency is enumerated. */
export const PriceTableQuerySchema = PriceProjectionQuerySchema.omit({
  tierKey: true,
  deliveryDate: true,
});

/**
 * The single price view model (spec 005 §5.2 `PriceProjectionSchema`).
 *
 * The refinements pin the two invariants that make the model safe to render *and* to publish as
 * structured data:
 *
 *  - a **converted** amount always carries its provenance — `fxAsOf` and `ratePpm` are present
 *    together or not at all, and never alongside `fxReasonKey` (§5.4, AC-15);
 *  - when the display currency is not the destination's, the amount was either converted (rate
 *    present) or the projection fell back to the destination currency (reason key present). There
 *    is no third state, so an unstamped conversion cannot be represented.
 */
export const PriceProjectionSchema = z
  .object({
    displayPrice: IntegerMoneySchema,
    displayLocale: LocaleCodeSchema,
    destinationCountry: DestinationIsoSchema,
    destinationCurrencyPrice: IntegerMoneySchema,
    vatRateBp: BasisPointsSchema,
    vatRateText: z.string().min(1),
    vatLabelKey: z.literal("catalog.price.inclusive"),
    deliveryIncluded: z.literal(true),
    surcharges: z.array(SurchargeSchema).readonly(),
    fxAsOf: IsoDateSchema.optional(),
    ratePpm: z.number().int().positive().optional(),
    fxReasonKey: z.literal("catalog.availability.fxUnavailable").optional(),
    priceVersion: z.string().min(1),
    priceValidUntil: IsoDateSchema.nullable(),
    availability: AvailabilitySchema,
  })
  .strict()
  .refine(
    (projection) =>
      (projection.fxAsOf === undefined) === (projection.ratePpm === undefined),
    {
      error:
        "a converted amount carries both `fxAsOf` and `ratePpm`, or neither (spec 005 §5.4)",
      path: ["fxAsOf"],
    },
  )
  .refine(
    (projection) =>
      projection.fxReasonKey === undefined || projection.ratePpm === undefined,
    {
      error:
        "`fxReasonKey` means no rate was usable, so no rate may be stamped (spec 005 AC-15)",
      path: ["fxReasonKey"],
    },
  )
  .refine(
    (projection) =>
      projection.displayPrice.currency ===
        projection.destinationCurrencyPrice.currency ||
      projection.ratePpm !== undefined ||
      projection.fxReasonKey !== undefined,
    {
      error:
        "a display currency other than the destination's is either converted (rate stamped) or a fallback (reason key) — never an unstamped amount (spec 005 §5.4)",
      path: ["displayPrice"],
    },
  );

/**
 * The maximum number of currencies one embedded price table may carry (spec 005 §5.2, §6).
 *
 * Six is the ceiling the spec sets, and Phase 0 uses four at most: the destination's own currency
 * plus the three `currency.{code}` display currencies of §13 Q11. It is a *budget*, not a
 * taxonomy — the cost of a currency switch with no client fetch is HTML bytes, and the bytes are
 * paid on every price-bearing document.
 */
export const MAX_PRICE_TABLE_CURRENCIES = 6;

/**
 * The maximum serialised size of one tier's price table, in bytes (spec 005 §5.2, §6).
 *
 * "Serialised" is `JSON.stringify()` of the table, measured in **UTF-8 bytes** — the form and the
 * unit in which it is actually embedded in the document — so the refinement measures the thing
 * the budget is about rather than a proxy for it. ~1.5 KB for a three-tier PDP before
 * compression, against spec 004 §14 A1's 131 072 B document budget.
 */
export const MAX_PRICE_TABLE_BYTES = 512;

/** UTF-8 byte length of a value's JSON form — the unit `MAX_PRICE_TABLE_BYTES` is stated in. */
export function serialisedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * The embedded per-tier price table, with the size refinement spec 005 §5.2 requires.
 *
 * Both bounds are *refusals*, not truncations: a table that would exceed either is a defect in
 * how many currencies we chose to embed, and silently dropping one would give spec 008's repaint
 * island a currency with no amount — a price switch that shows nothing is worse than no switch.
 */
export const PriceTableSchema = z
  .object({
    productId: ProductSkuSchema,
    tierKey: z.string().min(1),
    fxAsOf: IsoDateSchema.nullable(),
    entries: z.partialRecord(
      MoneySchema.shape.currency,
      MinorUnitsSchema.positive(),
    ),
  })
  .strict()
  .refine(
    (table) => Object.keys(table.entries).length <= MAX_PRICE_TABLE_CURRENCIES,
    {
      error: `a price table carries at most ${String(MAX_PRICE_TABLE_CURRENCIES)} currencies (spec 005 §5.2)`,
      path: ["entries"],
    },
  )
  .refine((table) => Object.keys(table.entries).length > 0, {
    error:
      "a price table with no currency is not a table: the destination's own currency is always in it (spec 005 §5.2)",
    path: ["entries"],
  })
  .refine((table) => serialisedByteLength(table) <= MAX_PRICE_TABLE_BYTES, {
    error: `a price table serialises to at most ${String(MAX_PRICE_TABLE_BYTES)} bytes per tier (spec 005 §6 "CWV budget")`,
    path: ["entries"],
  });

/**
 * The typed input spec 007's `Offer` builder consumes (spec 005 §6, AC-11).
 *
 * Every constant AC-11 names is a **literal type** here rather than a value a caller supplies:
 * the shipping rate is zero, the return policy is `MerchantReturnNotPermitted`, and the price is
 * a plain decimal string with a dot — `45,90` is a mis-priced offer to a schema.org consumer that
 * may read the comma as a thousands separator, which is why spec 001's `validate-schema` rejects
 * it even when the digits are right.
 */
export const OfferProjectionSchema = z
  .object({
    price: z
      .string()
      .regex(
        /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/,
        "must be a plain decimal string with a `.` separator (schema.org; spec 001 `validate-schema`)",
      ),
    priceCurrency: MoneySchema.shape.currency,
    priceValidUntil: IsoDateSchema.nullable(),
    availability: z.enum([
      "https://schema.org/InStock",
      "https://schema.org/OutOfStock",
    ]),
    availabilityKey: z.enum([
      catalogAvailabilityKeys.inStock,
      catalogAvailabilityKeys.outOfStock,
    ]),
    eligibleRegion: DestinationIsoSchema,
    shippingRate: IntegerMoneySchema.extend({
      amountMinor: z.literal(0),
    }).strict(),
    hasMerchantReturnPolicy: z.literal(
      "https://schema.org/MerchantReturnNotPermitted",
    ),
    priceVersion: z.string().min(1),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Quote boundary schemas (spec 005 §5.2 `QuoteSchema`, §8, §13 Q5, AC-17;     */
/* TASK-068).                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The lifetime of a signed quote, in minutes (spec 005 §13 Q5).
 *
 * Thirty: long enough for a buyer to finish a checkout they started, short enough that the FX
 * buffer still covers the movement the rate can make inside the window (`plan/06` §2.2). It is a
 * named constant rather than a literal because spec 010's checkout and spec 013's charge both
 * reason about the same window and neither may restate it.
 */
export const QUOTE_TTL_MINUTES = 30;

/** A hex SHA-256 digest: 64 lowercase hex characters, and nothing that is not one. */
export const QuoteDigestSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "must be a lowercase hex SHA-256 digest");

/**
 * One quoted line: **product id, tier key, integer amount** (spec 005 §8, AC-17).
 *
 * `.strict()` is the data-minimisation guarantee, not a style choice: a quote is carried in a
 * form field and in a payment intent's metadata, so a `recipientName` or a `deliveryNote` added
 * "just for convenience" would put personal data somewhere we do not control (`plan/07` §2.2,
 * `CLAUDE.md`). AC-17's key-set equality test asserts the same rule from the outside.
 */
export const QuoteLineSchema = z
  .object({
    productId: ProductSkuSchema,
    tierKey: z.string().min(1),
    amountMinor: MinorUnitsSchema.positive(),
  })
  .strict();

/**
 * A signed quote (spec 005 §5.2, §13 Q5).
 *
 * `.strict()` plus the refinement below: the field set is exactly §5.2's list, and the total is
 * the sum of the lines — computed at construction and re-checked at parse, so a quote whose total
 * disagrees with its own lines cannot be verified into existence even if the digest matches.
 */
export const QuoteSchema = z
  .object({
    quoteId: z
      .string()
      .regex(/^[0-9a-f]{32}$/, "must be a 32-character hex id"),
    lines: z.array(QuoteLineSchema).min(1).readonly(),
    totalMinor: MinorUnitsSchema.positive(),
    currency: MoneySchema.shape.currency,
    fxAsOf: IsoDateSchema.nullable(),
    ratePpm: z.number().int().positive().nullable(),
    priceVersion: z.string().min(1),
    expiresAt: z.iso.datetime(),
    digest: QuoteDigestSchema,
  })
  .strict()
  .refine(
    (quote) =>
      quote.lines.reduce((sum, line) => sum + line.amountMinor, 0) ===
      quote.totalMinor,
    {
      error:
        "a quote's total is the sum of its lines (spec 005 §5.2): the amount charged is the amount quoted",
      path: ["totalMinor"],
    },
  )
  .refine((quote) => (quote.fxAsOf === null) === (quote.ratePpm === null), {
    error:
      "a converted quote carries both `fxAsOf` and `ratePpm`, or neither (spec 005 §5.4)",
    path: ["fxAsOf"],
  })
  .refine(
    (quote) => quote.priceVersion.split("|").length === quote.lines.length,
    {
      error:
        "a quote names the priced row behind every line, in line order (spec 005 §5.2): a line with no version could not be re-resolved and so could never be refused",
      path: ["priceVersion"],
    },
  );

/* -------------------------------------------------------------------------- */
/* Slugs and listing parameters (spec 008 §5.1 amendment 1, §5.2; TASK-105).   */
/* -------------------------------------------------------------------------- */

/** Which namespace a slug belongs to — the first argument of `slugFor()` / `resolveSlug()`. */
export const SlugKindSchema = z.enum(slugKinds);

/**
 * A slug as it may appear in a URL: lowercase ASCII, hyphen-separated, no slash — reused from the
 * dataset's own `SlugSchema` so the rule lives in one place (`plan/02` §4). An uppercase or
 * trailing-slash variant therefore never resolves, which is spec 008 AC-1's 404 rather than a
 * case-fixing rewrite (ADR-0006: no redirect, ever).
 */
export const CatalogueSlugSchema = SlugSchema;

/**
 * A catalogue entity's natural key — `category.key`, `occasion.key`, `product.sku` — in exactly
 * the shape spec 006's `SeedCopySchema.key` accepts, because the copy rows are what this map is
 * built from.
 */
export const EntityKeySchema = z.string().min(2);

/** One of the six listing page types of spec 008 §2, as `localePath()`'s builder names them. */
export const ListingPageTypeSchema = z.enum(LISTING_PAGE_TYPES);

/** The three orders a listing offers (spec 008 §13 Q3). Nothing personalised, nothing claimed. */
export const ListingSortSchema = z.enum(listingSorts);

/**
 * The route parameters of a listing URL (spec 008 §5.2 `ListingParamsSchema`).
 *
 * `.strict()` and shape-checked, because this is the boundary where an unvalidated path segment
 * arrives: an unknown locale, a segment belonging to another locale, an uppercase or
 * trailing-slash variant and a page type carrying the wrong number of segments are all parse
 * failures, and a parse failure is `notFound()` — never a redirect and never a case-fixing
 * rewrite (spec 008 §5.2, AC-1; ADR-0006). Whether the *entity* behind a well-formed slug exists
 * is a different question, answered by `resolveSlug()` and by spec 008's existence rules
 * (TASK-107).
 */
export const ListingParamsSchema = z
  .object({
    locale: LocaleCodeSchema,
    pageType: ListingPageTypeSchema,
    /** The destination's slug in this locale — the three country-scoped types only. */
    country: CatalogueSlugSchema.optional(),
    /** The category or occasion slug — the four entity-scoped types only. */
    entity: CatalogueSlugSchema.optional(),
  })
  .strict()
  .superRefine((params, ctx) => {
    const needsCountry = [
      "countryShopRoot",
      "countryCategory",
      "countryOccasion",
    ].includes(params.pageType);
    const needsEntity = [
      "countryCategory",
      "countryOccasion",
      "categoryHub",
      "occasionHub",
    ].includes(params.pageType);

    for (const [field, needed, value] of [
      ["country", needsCountry, params.country],
      ["entity", needsEntity, params.entity],
    ] as const) {
      if (needed && value === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `\`${params.pageType}\` is scoped by a \`${field}\` slug (spec 008 §2)`,
        });
      }
      if (!needed && value !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `\`${params.pageType}\` carries no \`${field}\` segment; the URL with one is a different URL and 404s (spec 008 AC-1)`,
        });
      }
    }
  });

export type ListingParams = z.output<typeof ListingParamsSchema>;

/** `page` as it arrives in a query string: digits, no sign, no leading zero, ≥ 1. */
const PAGE_PARAMETER_PATTERN = /^[1-9][0-9]*$/;

/**
 * A listing's query string (spec 008 §5.2 `ListingSearchParamsSchema`, AC-15).
 *
 * It **cannot fail**: a `GET` form's query is whatever a visitor or a crawler typed, and a page
 * that 500s on `?sort=banana` would be a page a crawler can break. Every parameter is therefore
 * either honoured (`page`, `sort`, when present *and* valid) or neutralised — an invalid value
 * reads as absent and a facet-shaped parameter is only reported, so the page renders its base
 * content and the caller passes `ignored` to spec 005's `resolveFacets()`, whose whole
 * contribution is `indexable: false` (`plan/02` §7).
 *
 * No decision is taken here. `?page=1`'s 301 to the bare URL, `?page=N`'s self-canonical, the
 * canonical-to-base on a sorted URL and the 404 past the last page all need the item count as
 * well, and they are TASK-114's with spec 007's `indexability()`.
 */
export const ListingSearchParamsSchema = FacetSearchParamsSchema.transform(
  (raw): ListingSearchParams => {
    const first = (value: string | readonly string[] | undefined): string | undefined =>
      Array.isArray(value) ? value[0] : (value as string | undefined);

    const honoured: ("page" | "sort")[] = [];

    const rawPage = first(raw["page"]);
    const pageValid =
      rawPage !== undefined && PAGE_PARAMETER_PATTERN.test(rawPage);
    if (pageValid) honoured.push("page");

    const rawSort = first(raw["sort"]);
    const sort = ListingSortSchema.safeParse(rawSort);
    if (sort.success) honoured.push("sort");

    const ignored = Object.entries(raw)
      .filter(
        ([name, value]) =>
          value !== undefined &&
          !(name === "page" && pageValid) &&
          !(name === "sort" && sort.success),
      )
      .map(([name]) => name)
      .sort();

    return {
      page: pageValid ? Number(rawPage) : 1,
      sort: sort.success ? sort.data : "default",
      honoured,
      ignored,
    };
  },
);
