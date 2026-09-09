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
 * and the read API's other boundary schemas landed with the taxonomy read API (TASK-063), and
 * `PriceProjectionSchema`, `PriceTableSchema`, `AvailabilitySchema` and `QuoteSchema` land with
 * the functions that produce them (TASK-064 … TASK-068). Nothing here computes a price.
 */
import { z } from "zod";

import {
  type FacetName,
  SkuSchema,
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
const IntegerMoneySchema = MoneySchema.extend({
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
