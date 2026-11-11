/**
 * The details form's field names, ids and answer shape (spec 018 §14 C.7.2; TASK-352), apart from
 * the parser so the form island imports nothing server-side (no phone metadata, no catalogue).
 */

/** The posted fields, in the board's order. */
export const DETAILS_FIELDS = [
  "buyerName",
  "buyerPhone",
  "residenceCountry",
  "preferredLocale",
  "preferredCurrency",
] as const;
export type DetailsField = (typeof DETAILS_FIELDS)[number];

export type DetailsValues = Readonly<Record<DetailsField, string>>;

/** The field's id on the page: the error summary's link target. */
export function detailsFieldId(field: DetailsField): string {
  return `details-${field}`;
}

export interface DetailsFormError {
  readonly field: DetailsField;
  readonly fieldId: string;
  /** The field's own message (`checkout.error.*`). */
  readonly message: string;
  /** "Your phone: …" (`checkout.error.summaryItem`). */
  readonly summary: string;
}

export interface DetailsFormState {
  readonly status: "idle" | "saved" | "invalid";
  /** A new number per answer, so the form remounts with its values and the summary takes focus. */
  readonly attempt: number;
  /** The posted values, kept in the fields after a refusal or a save; `null` before the first. */
  readonly values: DetailsValues | null;
  readonly errors: readonly DetailsFormError[];
}
