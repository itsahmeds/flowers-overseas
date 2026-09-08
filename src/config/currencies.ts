/**
 * Currency configuration (spec 003 §2, §5.1/§5.2; TASK-033).
 *
 * The Phase 0 source of truth for the ten currencies spec 002 §5.1 seeds into
 * `currency(code PK, minor_unit_exponent smallint, rounding_style)`. No database is read here and
 * none may be: spec 003 §1 "the no-database seam" is what makes this spec implementable while
 * spec 002's provisioning is parked, and `pnpm check:no-db` enforces it (AC-2).
 *
 * `minorUnitExponent` is the number of fraction digits the currency displays, and it must agree
 * with `Intl` for that currency (unit-tested): `formatMoney` (TASK-036) turns integer minor units
 * into a **decimal string** using this exponent before handing it to `Intl.NumberFormat`, so no
 * float ever holds money (`plan/12` §2, spec 003 §8 "Price display"). HUF is the one
 * zero-exponent currency in the set.
 *
 * `roundingStyle` is the psychological price ending `plan/06` §"FX policy" requires ("rounded to
 * psychological endings", `plan/03` §1's worked example rounds to `€x.90`): two-decimal
 * currencies round to `x90`, and HUF, having no minor part, rounds to `x9`. The pricing engine
 * that applies it is spec 005; this module only carries the data spec 002's seed projects.
 *
 * `toCurrencyRow()` projects exactly spec 002 §5.1's column set so TASK-026's seed reads the
 * projection instead of restating the currency list; `CURRENCY_ROW_COLUMNS` is pinned by a unit
 * test (AC-4) and fails if either side is edited alone.
 */
import { z } from "zod";

/** ISO-4217 alphabetic code: three uppercase ASCII letters. */
const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be a three-letter uppercase ISO-4217 code");

/** `currency.rounding_style` CHECK constraint of spec 002 §5.1, verbatim. */
export const roundingStyles = ["x99", "x90", "x9", "none"] as const;
export type RoundingStyle = (typeof roundingStyles)[number];

export const CurrencyConfigSchema = z
  .object({
    code: CurrencyCodeSchema,
    /** Fraction digits the currency displays; 0–3 covers JPY-style through KWD-style currencies. */
    minorUnitExponent: z.number().int().min(0).max(3),
    roundingStyle: z.enum(roundingStyles),
  })
  .strict();

export type CurrencyConfig = z.infer<typeof CurrencyConfigSchema>;

export const CurrencyRegistrySchema = z
  .array(CurrencyConfigSchema)
  .min(1)
  .superRefine((currencies, ctx) => {
    const seen = new Set<string>();
    currencies.forEach((currency, index) => {
      if (seen.has(currency.code)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "code"],
          message: `duplicate currency code \`${currency.code}\``,
        });
      }
      seen.add(currency.code);
    });
  });

/**
 * The ten currencies of spec 002 §5.1, in the order that spec seeds them. `plan/03` §1's
 * buyer-selectable display set (which adds CHF, TRY and USD) is a superset reached in Phase 4+;
 * adding one is a row here plus a seed row, never a code change elsewhere.
 */
const currencies = [
  { code: "EUR", minorUnitExponent: 2, roundingStyle: "x90" },
  { code: "GBP", minorUnitExponent: 2, roundingStyle: "x90" },
  { code: "PLN", minorUnitExponent: 2, roundingStyle: "x90" },
  { code: "RON", minorUnitExponent: 2, roundingStyle: "x90" },
  { code: "CZK", minorUnitExponent: 2, roundingStyle: "x90" },
  { code: "HUF", minorUnitExponent: 0, roundingStyle: "x9" },
  { code: "SEK", minorUnitExponent: 2, roundingStyle: "x90" },
  { code: "NOK", minorUnitExponent: 2, roundingStyle: "x90" },
  { code: "DKK", minorUnitExponent: 2, roundingStyle: "x90" },
  { code: "CHF", minorUnitExponent: 2, roundingStyle: "x90" },
] as const satisfies readonly CurrencyConfig[];

/** Parsed at module load: an invalid registry throws on first import, never at request time. */
export const CURRENCIES: readonly CurrencyConfig[] =
  CurrencyRegistrySchema.parse(currencies);

export const CURRENCY_CODES = CURRENCIES.map(
  (currency) => currency.code,
) as readonly string[];

/** The closed set of configured codes, as a literal union: an unknown code is a type error. */
export type CurrencyCode = (typeof currencies)[number]["code"];

const byCode = new Map<string, CurrencyConfig>(
  CURRENCIES.map((currency) => [currency.code, currency]),
);

/** Look a currency up by code. Throws on an unknown code: the code set is closed data. */
export function currencyConfig(code: CurrencyCode): CurrencyConfig {
  const currency = byCode.get(code);
  if (currency === undefined) {
    throw new Error(`unknown currency code: ${code}`);
  }
  return currency;
}

/** True when the string is one of the configured currency codes (boundary parsing helper). */
export function isCurrencyCode(code: string): code is CurrencyCode {
  return byCode.has(code);
}

/** Spec 002 §5.1 `currency` columns, in declaration order. Pinned by a unit test (AC-4). */
export const CURRENCY_ROW_COLUMNS = [
  "code",
  "minor_unit_exponent",
  "rounding_style",
] as const;

export interface CurrencyRow {
  code: string;
  minor_unit_exponent: number;
  rounding_style: RoundingStyle;
}

/**
 * Project a currency onto spec 002 §5.1's `currency` row. TASK-026's seed reads this rather than
 * restating the currency set, so the two cannot drift (AC-4).
 */
export function toCurrencyRow(currency: CurrencyConfig): CurrencyRow {
  return {
    code: currency.code,
    minor_unit_exponent: currency.minorUnitExponent,
    rounding_style: currency.roundingStyle,
  };
}
