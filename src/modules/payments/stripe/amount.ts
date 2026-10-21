/**
 * `toStripeAmount` (spec 013 §5.2, AC-9, T-09; TASK-255): the integer Stripe charges, from
 * integer minor units.
 *
 * An explicit table, one row per currency we charge in: **GBP, EUR and PLN**, each with Stripe's
 * exponent 2, which is ours too (`src/config/currencies.ts`), so the amount passes through
 * unchanged. Every other configured currency throws `UnsupportedCurrency`: adding one is a
 * reviewed row here with a test, never a fallthrough, because a currency whose Stripe exponent
 * differs from ours (Stripe treats HUF as two-decimal) would charge a hundred times the price.
 */
import type { Money } from "@/modules/i18n";

import { UnsupportedCurrency, minorUnitsForProvider } from "../provider.ts";

/** Currency → the multiplier from our minor units to Stripe's. Identity for all three. */
const STRIPE_AMOUNT_TABLE: Readonly<Record<string, 1>> = {
  GBP: 1,
  EUR: 1,
  PLN: 1,
};

/** The currencies an intent may be created in. */
export const STRIPE_CHARGE_CURRENCIES = Object.freeze(
  Object.keys(STRIPE_AMOUNT_TABLE),
) as readonly string[];

export function toStripeAmount(money: Money): number {
  const multiplier = STRIPE_AMOUNT_TABLE[money.currency];
  if (multiplier === undefined) throw new UnsupportedCurrency(money.currency);
  return minorUnitsForProvider(money.amountMinor) * multiplier;
}

/** Stripe's lowercase currency code back to ours, for the three charge currencies only. */
export function fromStripeCurrency(code: string): "GBP" | "EUR" | "PLN" {
  const upper = code.toUpperCase();
  if (upper === "GBP" || upper === "EUR" || upper === "PLN") return upper;
  throw new UnsupportedCurrency(upper);
}
