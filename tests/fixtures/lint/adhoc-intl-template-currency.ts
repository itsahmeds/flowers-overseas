// Invalid fixture: a hand-built price string. Symbol position, separator and spacing are all
// locale decisions `formatMoney` already makes (spec 003 AC-21, TASK-037). One violation.
export function priceTag(amount: string): string {
  return `${amount} zł`;
}
