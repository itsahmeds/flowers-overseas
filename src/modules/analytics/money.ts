/**
 * Minor units to a GA4 `value` (spec 023 §5.2 "Money", AC-15; TASK-491).
 *
 * The one place in the analytics module that touches an amount. The decimal is built by spec
 * 003's `moneyDecimalString` (integer division and remainder at the currency's exponent in
 * `src/config/currencies.ts`), then read as a JSON number: no float is ever multiplied, divided
 * or rounded. A currency outside the registry throws (the money schema refuses it).
 */
import { type Money, moneyDecimalString } from "@/modules/i18n";

/** `4599` GBP minor units → `45.99`. Throws for a non-integer amount or an unknown currency. */
export function toGa4Value(money: Money): number {
  return Number(moneyDecimalString(money));
}
