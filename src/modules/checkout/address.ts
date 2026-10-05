/**
 * The recipient form of step 1, as a model (spec 010 §2 "Step 1", §5.3 "Form quality", §7
 * "Addresses and names", AC-8; `plan/03` §8; TASK-200).
 *
 * `addressFormModel(countryIso)` turns the destination's row in `src/config/address-formats.ts`
 * into what a form and its schema need: the fields **in the destination's order**, which are
 * required, each field's label key, the `autocomplete` token and `inputmode` the input carries,
 * the grapheme limit of each free-text field, and the postcode check — spec 003's
 * `normalisePostcode()` then its `postcodeRegex()`, so `00001` becomes `00-001` before it is
 * matched, and a buyer's spacing never fails a valid postcode.
 *
 * **A destination with only the generic format is `closed`** (AC-8, §7): the generic row exists
 * so an address can be *displayed* before a format is authored, never so one can be *collected*
 * for a florist who would not recognise it. Adding a destination to checkout is a row in
 * `address-formats.ts` plus its label keys, never a code change here: like spec 003's
 * `address.ts`, no country is named in this file.
 *
 * No database (`pnpm check:no-db`), no copy (labels are message keys from the config).
 */
import {
  ADDRESS_FORMATS,
  type AddressField,
  type AddressFormat,
  addressFormat,
} from "@/config/address-formats";
import { CHECKOUT_LIMITS } from "@/config/checkout";
import { normalisePostcode, type PostcodeResult } from "@/modules/i18n";

/** `open`: the destination has an authored format; `closed`: generic only (AC-8). */
export type AddressFormStatus = "open" | "closed";

/** The `inputmode` an input carries (§5.3 "Form quality"). */
export type AddressInputMode = "text" | "numeric" | "tel";

/** One input of the recipient form. */
export interface AddressFieldModel {
  readonly field: AddressField;
  readonly required: boolean;
  /** A message key such as `checkout.address.postcode`; never a literal label. */
  readonly labelKey: string;
  /** The HTML `autocomplete` token, or `null` where no standard token fits (a house number). */
  readonly autocomplete: string | null;
  readonly inputMode: AddressInputMode;
  /** The free-text limit in graphemes, or `null` where a pattern bounds the value instead. */
  readonly maxGraphemes: number | null;
}

/** The whole model of one destination's recipient form. */
export interface AddressFormModel {
  /** ISO 3166-1 alpha-2 of the destination. */
  readonly countryIso: string;
  readonly status: AddressFormStatus;
  /** In the destination's order (`plan/03` §8): DE puts the house number after the street. */
  readonly fields: readonly AddressFieldModel[];
  /** The example hint's message key (`checkout.address.placeholder.pl`). */
  readonly placeholderKey: string;
  /** The example values that hint interpolates. */
  readonly example: AddressFormat["examplePlaceholder"];
  /** Spec 003's `normalisePostcode()` for this destination: the normalised value, or why not. */
  readonly checkPostcode: (raw: string) => PostcodeResult;
}

/**
 * The `autocomplete` token per field (§5.3). `houseNumber` has none: HTML defines no house-number
 * token, and autofilling it with a street line would be worse than leaving it to the buyer.
 */
const AUTOCOMPLETE: Readonly<Record<AddressField, string | null>> = {
  fullName: "name",
  street: "address-line1",
  houseNumber: null,
  addressLine1: "address-line1",
  addressLine2: "address-line2",
  careOf: "address-line2",
  apartment: "address-line3",
  postcode: "postal-code",
  city: "address-level2",
  region: "address-level1",
  phone: "tel",
};

/**
 * Normalisers whose output is built from digits alone, so the numeric keypad is the right one:
 * PL's hyphen is inserted by the normaliser, not typed (§5.3: `inputmode="numeric"` where the
 * destination's postcode is numeric).
 */
const NUMERIC_NORMALISERS: ReadonlySet<AddressFormat["postcodeNormaliser"]> =
  new Set(["digits", "digits-hyphen-2-3"]);

function inputModeFor(
  field: AddressField,
  format: AddressFormat,
): AddressInputMode {
  if (field === "phone") return "tel";
  if (
    field === "postcode" &&
    NUMERIC_NORMALISERS.has(format.postcodeNormaliser)
  )
    return "numeric";
  return "text";
}

function maxGraphemesFor(field: AddressField): number | null {
  if (field === "postcode" || field === "phone") return null;
  if (field === "fullName") return CHECKOUT_LIMITS.fullName;
  return CHECKOUT_LIMITS.addressLine;
}

/** The field's label key. `AddressFormatSchema` guarantees one per ordered field; a gap throws. */
function labelKeyOf(format: AddressFormat, field: AddressField): string {
  const key = format.labelKeys[field];
  if (key === undefined) {
    throw new Error(
      `address format \`${format.country}\` orders \`${field}\` without a label key`,
    );
  }
  return key;
}

/**
 * The recipient form for a destination (spec 010 §7, AC-8).
 *
 * @param countryIso ISO 3166-1 alpha-2, uppercase. A malformed code throws (spec 003's rule: a
 *   lowercase code is how a URL segment reaches a form by accident).
 */
export function addressFormModel(countryIso: string): AddressFormModel {
  const format = addressFormat(countryIso);
  // `normalisePostcode` validates the argument; calling it once here makes a malformed code
  // throw at model time rather than at the first submit.
  normalisePostcode("", countryIso);
  const required = new Set<AddressField>(format.required);
  const status: AddressFormStatus =
    format === ADDRESS_FORMATS.generic ? "closed" : "open";

  return {
    countryIso,
    status,
    fields: format.fieldOrder.map((field) => ({
      field,
      required: required.has(field),
      labelKey: labelKeyOf(format, field),
      autocomplete: AUTOCOMPLETE[field],
      inputMode: inputModeFor(field, format),
      maxGraphemes: maxGraphemesFor(field),
    })),
    placeholderKey: format.placeholderKey,
    example: format.examplePlaceholder,
    checkPostcode: (raw) => normalisePostcode(raw, countryIso),
  };
}
