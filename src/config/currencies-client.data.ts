/**
 * @purpose Each currency's minor-unit exponent, import-free, for a client graph (TASK-522)
 * @spec 003
 *
 * A **mirror** of `minorUnitExponent` in `src/config/currencies.ts`, which stays the one authored
 * source: that module parses its table with zod, and a `"use client"` file that formats money must
 * not ship zod (`tests/unit/client-message-graph.test.ts`). `tests/unit/i18n-client-money.test.ts`
 * fails, naming the code, when the two disagree. No import at all.
 */
export const CURRENCY_EXPONENTS_CLIENT: Readonly<Record<string, number>> = {
  EUR: 2,
  GBP: 2,
  PLN: 2,
  RON: 2,
  CZK: 2,
  HUF: 0,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  CHF: 2,
  USD: 2,
};
