/**
 * The pure half of florist access in admin (spec 026a §5.2, §13 Q3; AC-7, AC-9; TASK-355):
 *
 *  - `FloristSignInEmailSchema`: the one address that may sign in for a partner is its contact
 *    email, trimmed and lower-cased, so it matches `users.email`'s lower-case check
 *    (`users_email_check`) and the sign-in core's own normalisation.
 *  - `floristLanguageFor`: the starting language of a new membership. The application's language
 *    when the partner was converted from one; otherwise Polish for Poland, German for Germany and
 *    Austria, English anywhere else. Never `Accept-Language`, never an IP (ADR-0006).
 */
import { z } from "zod";

import {
  DEFAULT_FLORIST_LANGUAGE,
  type FloristLanguage,
  FloristLanguageSchema,
} from "@/config/florists";

/** The partner's contact email as the sign-in address: trimmed, lower-cased, at most 254. */
export const FloristSignInEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

/** The language each country starts its florists in; any other country starts in English. */
export const FLORIST_COUNTRY_LANGUAGES: Readonly<
  Record<string, FloristLanguage>
> = Object.freeze({ PL: "pl", DE: "de", AT: "de" });

export const FloristLanguageInputSchema = z
  .object({
    applicationLanguage: FloristLanguageSchema.nullable(),
    countryIso2: z.string().length(2),
  })
  .strict();
export type FloristLanguageInput = z.input<typeof FloristLanguageInputSchema>;

/** The starting language of a new membership (AC-9). */
export function floristLanguageFor(
  input: FloristLanguageInput,
): FloristLanguage {
  const { applicationLanguage, countryIso2 } =
    FloristLanguageInputSchema.parse(input);
  if (applicationLanguage !== null) return applicationLanguage;
  return (
    FLORIST_COUNTRY_LANGUAGES[countryIso2.toUpperCase()] ??
    DEFAULT_FLORIST_LANGUAGE
  );
}

/** `value` as a florist language, or `null` when it is none of the three (an application's). */
export function asFloristLanguage(value: unknown): FloristLanguage | null {
  const parsed = FloristLanguageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
