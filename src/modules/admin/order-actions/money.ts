/**
 * Money for the admin refund dialog (spec 020a §5.2 "Money input", AC-16, AC-17; TASK-359).
 *
 * `parseMinorUnits` turns what the admin typed into integer minor units of the order's currency
 * by working on the **digit strings**: the integer part followed by the fraction padded to the
 * currency's exponent, read as one `bigint`. It never goes through a binary float, `Number` on a
 * decimal string, or rounding: a value with more fraction digits than the currency has is refused,
 * not rounded. Accepted shape: `^\d{1,9}([.,]\d{1,E})?$`, E the currency's minor-unit exponent
 * (`src/config/currencies.ts`, the projection of spec 002's `currency` table). Either "." or ","
 * separates the decimals, whatever the admin's browser locale; nothing else is allowed (no sign,
 * no exponent, no grouping, no symbol, no spaces), and zero is refused.
 *
 * `remainingRefundable` is spec 020a's "remaining": captured minus every refund that is
 * `requested`, `pending` or `succeeded`. A refund that `failed` or was `cancelled` gives its amount
 * back; one still in flight does not, so two refunds cannot both spend the same balance.
 */
import { type CurrencyCode, currencyConfig } from "@/config/currencies";

export type ParsedMinorUnits =
  | { readonly ok: true; readonly amountMinor: bigint }
  | { readonly ok: false; readonly code: "AMOUNT_INVALID" };

const INVALID: ParsedMinorUnits = Object.freeze({
  ok: false,
  code: "AMOUNT_INVALID",
});

/**
 * One to nine integer digits (spec 020a §5.2: "999999999999" is refused, not truncated), then
 * optionally "." or "," and one or more fraction digits; the fraction's length is checked against
 * the currency's exponent below, so "12.505" in EUR is refused rather than rounded.
 */
const AMOUNT_SHAPE = /^(\d{1,9})(?:[.,](\d+))?$/;

export function parseMinorUnits(
  text: string,
  currency: CurrencyCode,
): ParsedMinorUnits {
  const exponent = currencyConfig(currency).minorUnitExponent;
  const match = AMOUNT_SHAPE.exec(text);
  if (match === null) return INVALID;
  const integerDigits = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) return INVALID;
  const amountMinor = BigInt(
    `${integerDigits}${fraction.padEnd(exponent, "0")}`,
  );
  if (amountMinor < 1n) return INVALID;
  return { ok: true, amountMinor };
}

/** `refund.status` values that hold part of the captured amount (spec 020a §5.2, AC-17). */
export const REFUND_STATUSES_HOLDING_BALANCE = [
  "requested",
  "pending",
  "succeeded",
] as const;

export interface RefundBalanceRow {
  readonly status: string;
  readonly amountMinor: bigint;
}

/** Captured minus requested, pending and succeeded refunds; never below zero. */
export function remainingRefundable(
  capturedMinor: bigint,
  refunds: readonly RefundBalanceRow[],
): bigint {
  const holding: readonly string[] = REFUND_STATUSES_HOLDING_BALANCE;
  const heldMinor = refunds
    .filter((row) => holding.includes(row.status))
    .reduce((sum, row) => sum + row.amountMinor, 0n);
  const remainingMinor = capturedMinor - heldMinor;
  return remainingMinor > 0n ? remainingMinor : 0n;
}
