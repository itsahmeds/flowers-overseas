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
  addonKeys,
  addonKinds,
  facetNames,
  facetValues,
  productStatuses,
} from "@/config/catalogue/schemas";
import { type CountryIso2, isCountryIso2 } from "@/config/countries";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { MoneySchema } from "@/modules/i18n";

import { surchargeKinds } from "./types";

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
