/**
 * The details form's boundary (spec 018 §14 A-founder-2026-10-22 C.7.2; AC-53; TASK-352): the
 * posted fields, parsed by Zod into `DetailsInput` or refused field by field. The phone goes
 * through spec 003's parser (`parseBuyerPhone`, the buyer's country of residence as the default
 * plan) and is stored in E.164 only. The email is never posted: it shows read-only.
 *
 * Each refusal is a code that names a `checkout.error.*` message (step 3's words, verbatim on the
 * board); nothing here logs a value.
 */
import { z } from "zod";

import { CURRENCY_CODES } from "@/config/currencies";
import { isLocaleCode } from "@/config/locales";
import { parseBuyerPhone, residenceCountryCodes } from "@/modules/checkout";
import type { DetailsInput } from "@/modules/customers";

import {
  DETAILS_FIELDS,
  type DetailsField,
  type DetailsValues,
} from "./details-fields";

/** The `checkout.error.*` key of each refusal. */
export const DETAILS_ERROR_KEY = {
  required: "error.required",
  tooLong: "error.tooLong",
  phoneInvalid: "error.phoneInvalid",
  countryInvalid: "error.countryInvalid",
} as const;
export type DetailsErrorCode = keyof typeof DETAILS_ERROR_KEY;

/** The longest name the form takes (the `customer.name` the checkout writes, 200). */
export const NAME_MAX = 200;

const PostedSchema = z
  .object({
    buyerName: z.string().max(2_000).default(""),
    buyerPhone: z.string().max(200).default(""),
    residenceCountry: z.string().max(8).default(""),
    preferredLocale: z.string().max(16).default(""),
    preferredCurrency: z.string().max(8).default(""),
  })
  .strip();

export type DetailsParse =
  | {
      readonly ok: true;
      readonly input: DetailsInput;
      readonly values: DetailsValues;
    }
  | {
      readonly ok: false;
      readonly values: DetailsValues;
      readonly errors: Readonly<
        Partial<Record<DetailsField, DetailsErrorCode>>
      >;
    };

/** The posted values, every field a string (a missing one is empty). */
export function detailsValues(form: FormData | null): DetailsValues {
  const raw: Record<string, string> = {};
  for (const field of DETAILS_FIELDS) {
    const value = form?.get(field);
    raw[field] = typeof value === "string" ? value : "";
  }
  return PostedSchema.parse(raw);
}

/** Parses the posted form (AC-53): every field valid, or each refusal by field. */
export function parseDetailsForm(form: FormData | null): DetailsParse {
  const values = detailsValues(form);
  const errors: Partial<Record<DetailsField, DetailsErrorCode>> = {};
  const name = values.buyerName.trim();
  if (name === "") errors.buyerName = "required";
  else if (name.length > NAME_MAX) errors.buyerName = "tooLong";
  const country = values.residenceCountry.trim().toUpperCase();
  const countryOk = residenceCountryCodes().includes(country);
  if (!countryOk) errors.residenceCountry = "countryInvalid";
  let phone: string | null = null;
  if (values.buyerPhone.trim() !== "") {
    const parsed = parseBuyerPhone(
      values.buyerPhone,
      countryOk ? country : undefined,
    );
    if (parsed.ok) phone = parsed.e164;
    else errors.buyerPhone = "phoneInvalid";
  }
  const locale = values.preferredLocale.trim();
  if (locale !== "" && !isLocaleCode(locale))
    errors.preferredLocale = "required";
  const currency = values.preferredCurrency.trim().toUpperCase();
  if (currency !== "" && !CURRENCY_CODES.includes(currency)) {
    errors.preferredCurrency = "required";
  }
  if (Object.keys(errors).length > 0) return { ok: false, values, errors };
  return {
    ok: true,
    values,
    input: {
      name,
      phoneE164: phone,
      countryIso2: country,
      preferredLocale: locale === "" || !isLocaleCode(locale) ? null : locale,
      preferredCurrency: currency === "" ? null : currency,
    },
  };
}
