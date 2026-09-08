// Valid fixture: the second allowed file. `Intl.Collator` is the only correct answer to "sort
// these city names" (spec 003 AC-18, AC-21, TASK-037). Zero violations.
export function compare(locale: string): (a: string, b: string) => number {
  return new Intl.Collator(locale, { usage: "sort", numeric: true }).compare;
}
