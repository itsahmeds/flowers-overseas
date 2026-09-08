// Invalid fixture: a second money formatter, built outside `src/modules/i18n/format.ts`
// (spec 003 AC-21, TASK-037). One violation: the `Intl.NumberFormat` construction.
export function priceLabel(amountMinor: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(amountMinor);
}
