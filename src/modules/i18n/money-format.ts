/**
 * @purpose The one money formatter, import-free: minor units to a currency string through `Intl` (TASK-522)
 * @spec 003
 *
 * `format.ts`'s `formatMoney` (registry and zod at its boundary) and `client.ts`'s (mirrored
 * tables, for a `"use client"` graph) both end here, so a price is rendered by exactly one piece
 * of code whichever entry a caller uses (spec 003 §4). This file has **no import**, so a client
 * island that formats money ships no zod and no locale registry (`tests/unit/
 * client-message-graph.test.ts`). `fo/no-adhoc-intl` allows `Intl` here as in `format.ts`.
 */

export interface FormatMoneyOptions {
  /**
   * Render the ISO code instead of the symbol (`45,00 EUR`), for the `title`/`aria-label` that
   * `plan/03` §7 asks for "for clarity across currencies". `Intl` places the code per locale, so
   * no caller concatenates one.
   */
  readonly withIsoCode?: boolean;
  /** `always` for an explicit `+`, e.g. a refund line or an FX delta. Default: `auto`. */
  readonly signDisplay?: "auto" | "always" | "exceptZero" | "never";
}

const currencyFormats = new Map<string, Intl.NumberFormat>();

/**
 * Shift `minorUnits` right by `exponent` digits, as text. This is the whole of the minor→major
 * conversion in the codebase (§5.3 "behavioural contracts"): string slicing on the decimal
 * digits of an integer, so the result is exact for every integer `bigint` can hold and for every
 * exponent, including 0 (HUF renders no fraction part at all).
 */
export function decimalString(
  minorUnits: number | bigint,
  exponent: number,
): Intl.StringNumericLiteral {
  const units = BigInt(minorUnits);
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString();
  const sign = negative ? "-" : "";
  if (exponent === 0) {
    return `${sign}${digits}` as Intl.StringNumericLiteral;
  }
  const padded = digits.padStart(exponent + 1, "0");
  const split = padded.length - exponent;
  const whole = padded.slice(0, split);
  const fraction = padded.slice(split);
  // The cast is the one place a built string meets `Intl`'s `${number}` template type; the
  // string is a decimal literal by construction (sign, digits, `.`, digits).
  return `${sign}${whole}.${fraction}` as Intl.StringNumericLiteral;
}

/**
 * `amountMinor` of `currency` at `exponent` fraction digits, in the BCP 47 `tag`'s format. The
 * callers validate: `format.ts` by `MoneySchema` and the registry, `client.ts` by its mirrors.
 */
export function formatMinorMoney(
  tag: string,
  currency: string,
  amountMinor: number | bigint,
  exponent: number,
  opts: FormatMoneyOptions = {},
): string {
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    currencyDisplay: opts.withIsoCode === true ? "code" : "symbol",
    signDisplay: opts.signDisplay ?? "auto",
  };
  const key = `${tag}|${JSON.stringify(options)}`;
  let format = currencyFormats.get(key);
  if (format === undefined) {
    format = new Intl.NumberFormat(tag, options);
    currencyFormats.set(key, format);
  }
  return format.format(decimalString(amountMinor, exponent));
}
