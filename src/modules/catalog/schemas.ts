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
 * belong to `src/config/catalogue/` and land with the dataset (TASK-061); `PriceProjectionSchema`,
 * `PriceTableSchema`, `AvailabilitySchema`, `FacetSelectionSchema` and `QuoteSchema` land with the
 * functions that produce them (TASK-064 … TASK-068). Nothing here computes a price.
 */
import { z } from "zod";

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
