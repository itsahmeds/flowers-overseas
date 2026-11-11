/**
 * `parseMinorInput(text, currency)`: a typed price as integer minor units (spec 012b §2.6, AC-18;
 * TASK-298).
 *
 * String arithmetic against the currency's exponent, never a float: `.` or `,` is the one decimal
 * separator, there is no grouping, no sign and no exponent. `"229.00"`, `"229,00"` and `"229"` PLN
 * are `22900`; `"229.5"` is `22950`; `"229.001"`, `"1,229.00"`, `"1 229"`, `"-5"`, `""` and
 * `"2.29e2"` are refused. Each digit becomes a number through its character code, so no numeric
 * conversion of the text exists here (T-18's source scan holds the file to that).
 */
import { type CurrencyCode, currencyConfig } from "@/config/currencies";

export type MinorInput =
  | { readonly ok: true; readonly amountMinor: number }
  | { readonly ok: false; readonly reason: "format" | "precision" | "range" };

/** Digits, then optionally one separator and at least one digit. Nothing else. */
const SHAPE = /^(?<whole>\d+)(?:[.,](?<fraction>\d+))?$/u;

const ZERO = "0".charCodeAt(0);

/** `digits` as an integer, accumulated one character code at a time. */
function digitsValue(digits: string): number {
  let value = 0;
  for (const character of digits) {
    value = value * 10 + (character.charCodeAt(0) - ZERO);
  }
  return value;
}

export function parseMinorInput(
  text: string,
  currency: CurrencyCode,
): MinorInput {
  const match = SHAPE.exec(text.trim());
  const whole = match?.groups?.["whole"];
  if (whole === undefined) return { ok: false, reason: "format" };
  const fraction = match?.groups?.["fraction"] ?? "";
  const { minorUnitExponent } = currencyConfig(currency);
  if (fraction.length > minorUnitExponent) {
    return { ok: false, reason: "precision" };
  }
  const minorDigits = `${whole}${fraction.padEnd(minorUnitExponent, "0")}`;
  const significant = minorDigits.replace(/^0+(?=\d)/u, "");
  // Past fifteen digits the accumulator could leave the safe-integer range.
  if (significant.length > 15) return { ok: false, reason: "range" };
  const amountMinor = digitsValue(significant);
  if (!Number.isSafeInteger(amountMinor)) return { ok: false, reason: "range" };
  return { ok: true, amountMinor };
}
