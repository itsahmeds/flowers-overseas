// Valid fixture: the same five constructs as the `adhoc-intl-*.ts` fixtures, in a path that
// simulates `src/modules/i18n/format.ts` — the one file (with `collate.ts`) allowed to construct
// an `Intl.*` formatter, call a `toLocale*` method or assemble a currency string
// (spec 003 AC-21 "passes for the identical code in a fixture path simulating
// src/modules/i18n/format.ts", TASK-037). Zero violations.
export function priceLabel(amountMinor: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(amountMinor);
}

export const grouped = (1234.5).toLocaleString("de");

export function deliveryLabel(date: Date): string {
  return date.toLocaleDateString();
}

export function share(ratio: number): string {
  return ratio.toFixed(2);
}

export function priceTag(amount: string): string {
  return `${amount} zł`;
}
