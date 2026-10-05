/**
 * Phone numbers at the checkout's boundary (spec 010 §2 "Step 1", §7 "Addresses and names", AC-9;
 * `plan/03` §8; TASK-200).
 *
 *  - **The recipient's phone is required** and is parsed against the **destination's** numbering
 *    plan: a buyer in Berlin sending to Warsaw types the number the way a Pole would write it
 *    (`512 345 678`), and it is stored in E.164 (`+48512345678`). A valid number from another
 *    country is accepted with a warning, because a florist may not be able to call it
 *    (`plan/03` §8: "this doesn't look like a Polish number; the florist may not be able to
 *    call"); the warning is `nonLocal: true` here and a message key in the form.
 *  - **The buyer's phone is optional** and may be from any country; the buyer's country of
 *    residence is the default plan for a number typed without a country code.
 *
 * Both return a result, never throw for a bad number: a typo is an expected outcome at a form
 * boundary. `reason` is a code, never copy; `schemas.ts` maps it to a message key.
 *
 * **Server only.** `libphonenumber-js` with its full metadata (`/max`, the variant that checks a
 * number's digits against each plan rather than only its length) is ~150 kB, so no client graph
 * may reach this file: `tests/unit/client-message-graph.test.ts` lists the package as forbidden
 * in any `"use client"` closure. `server-only` is not used for the reason
 * `src/modules/i18n/messages.ts` gives: the package exists only inside Next's bundler, and this
 * file is imported by plain-Node unit tests. Phone metadata is not `Intl`, so `fo/no-adhoc-intl`
 * does not apply.
 *
 * No number is ever logged, and none appears in an error message.
 */
import {
  type CountryCode,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js/max";

/** Why a phone was refused. Codes for `schemas.ts` to map to message keys, never copy. */
export const phoneRejections = ["empty", "notANumber", "invalid"] as const;
export type PhoneRejection = (typeof phoneRejections)[number];

/** A parsed phone: E.164 for storage, the national form for display, and where it belongs. */
export interface ParsedPhone {
  readonly ok: true;
  /** E.164, e.g. `+48512345678`: the only form stored (spec 002 `phone_e164`). */
  readonly e164: string;
  /** The number's own national format, e.g. `512 345 678`. */
  readonly national: string;
  /** ISO 3166-1 alpha-2 of the plan the number belongs to, or `null` for a non-geographic one. */
  readonly country: string | null;
  /** True when the number is valid but not of the destination's plan (recipient only). */
  readonly nonLocal: boolean;
}

export type PhoneResult =
  ParsedPhone | { readonly ok: false; readonly reason: PhoneRejection };

/**
 * The characters a typed phone may contain: digits, spaces (including no-break), `+`, brackets,
 * hyphens, dots and slashes. Letters are refused before parsing, because the library would read
 * a vanity number (`0FLOWERS1`) as digits, and nobody types a florist's callback as a word.
 */
const PHONE_CHARACTERS = /^[\d\s +()./-]+$/u;

/** An ISO 3166-1 alpha-2 code the library has a numbering plan for. */
function planFor(countryIso: string): CountryCode | undefined {
  return /^[A-Z]{2}$/u.test(countryIso) && isSupportedCountry(countryIso)
    ? countryIso
    : undefined;
}

interface ParsedPhoneCore {
  readonly e164: string;
  readonly national: string;
  readonly country: string | null;
  readonly callingCode: string;
}

function parse(
  raw: string,
  defaultCountry: CountryCode | undefined,
):
  | { readonly ok: false; readonly reason: PhoneRejection }
  | { readonly ok: true; readonly phone: ParsedPhoneCore } {
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (!PHONE_CHARACTERS.test(text)) return { ok: false, reason: "notANumber" };
  const phone = parsePhoneNumberFromString(
    text,
    defaultCountry === undefined ? undefined : { defaultCountry },
  );
  if (phone === undefined || !phone.isValid()) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    phone: {
      e164: phone.number,
      national: phone.formatNational(),
      country: phone.country ?? null,
      callingCode: phone.countryCallingCode,
    },
  };
}

/**
 * The recipient's phone, parsed against the destination's numbering plan (spec 010 AC-9).
 *
 * A number written nationally is read as the destination's; a number with a country code (`+44`
 * or `0044`) is read as that country's and, when valid, accepted with `nonLocal: true`.
 *
 * @param destinationIso ISO 3166-1 alpha-2 of the destination. An unsupported or malformed code
 *   throws: it is a caller's bug, not a buyer's typo.
 */
export function parseRecipientPhone(
  raw: string,
  destinationIso: string,
): PhoneResult {
  const plan = planFor(destinationIso);
  if (plan === undefined) {
    throw new Error(
      `destination must be an ISO 3166-1 alpha-2 code with a numbering plan, received: ${JSON.stringify(destinationIso)}`,
    );
  }
  const result = parse(raw, plan);
  if (!result.ok) return result;
  const { e164, national, country, callingCode } = result.phone;
  // Local means "dialled with the destination's country code", not "assigned to the destination
  // ISO code": `+44 7911 …` is Guernsey's in the metadata, and a London florist calls it as a
  // domestic number. PL, DE and AT have a calling code of their own.
  return {
    ok: true,
    e164,
    national,
    country,
    nonLocal: callingCode !== getCountryCallingCode(plan),
  };
}

/**
 * The buyer's optional phone, from any country (spec 010 §5.2 `CardAndBuyerStepSchema`). A number
 * without a country code is read in the plan of the buyer's country of residence when that
 * country has one; otherwise a country code is required. Never `nonLocal`: a buyer may live
 * anywhere.
 */
export function parseBuyerPhone(
  raw: string,
  residenceCountry: string | undefined,
): PhoneResult {
  const result = parse(
    raw,
    residenceCountry === undefined ? undefined : planFor(residenceCountry),
  );
  if (!result.ok) return result;
  const { e164, national, country } = result.phone;
  return { ok: true, e164, national, country, nonLocal: false };
}

/** Whether a two-letter code is a country the library knows a numbering plan for. */
export function hasNumberingPlan(countryIso: string): boolean {
  return planFor(countryIso) !== undefined;
}
