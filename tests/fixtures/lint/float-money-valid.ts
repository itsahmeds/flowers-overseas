// Valid fixture: money in integer minor units, formatted through Intl.
export const listPriceMinor = 1250;

export function quote(delivery_fee_minor: number, locale: string): string {
  const totalMinor = listPriceMinor + delivery_fee_minor;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(totalMinor / 100);
}
