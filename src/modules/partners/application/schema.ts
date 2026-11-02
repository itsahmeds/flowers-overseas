/**
 * The florist application's input (spec 011 §2 "The application form", §5.2 "Application", §8;
 * AC-11, AC-12, AC-13; TASK-213).
 *
 * `FloristApplicationInputSchema` is the one boundary between the form post and everything after
 * it: `.strict()`, so a field the form does not draw writes nothing (AC-13), and every bound is the
 * database's own (`0022_florists_v0`'s checks) or tighter, so a valid input is always insertable.
 *
 * Zod's English never reaches a screen: `applicationFieldErrors()` maps each issue to the
 * `forFlorists.apply.error.*` key of the field it concerns (§5.2), and an issue with no field (a
 * key the schema does not know) maps to none, so the form re-renders without inventing a message.
 *
 * `formEntries()` turns the posted `FormData` into the plain record the schema reads. React's
 * own `$ACTION_*` bookkeeping fields are dropped first (they are the framework's, not the
 * applicant's); a key posted twice and a file part are both refused, because the form posts
 * neither and a crafted body should not be half-read.
 *
 * No database, no Next import: unit-testable on its own.
 */
import { z } from "zod";

import { isCountryIso2 } from "@/config/countries";
import { FLORIST_LANGUAGES } from "@/config/florists";

/** The form's field names, in the order the form draws them (the error summary's order). */
export const APPLICATION_FIELDS = [
  "businessName",
  "contactName",
  "email",
  "phone",
  "country",
  "town",
  "capacityPerDay",
  "deliveryArea",
  "weekendDelivery",
  "registrationNumber",
  "website",
  "contactPreference",
  "language",
] as const;
export type ApplicationField = (typeof APPLICATION_FIELDS)[number];

/** The honeypot's name (§2 "Abuse controls"). */
export const HONEYPOT_FIELD = "hp";

/**
 * Each field's message key under `forFlorists.apply.error` (the key names follow the form's
 * label keys, `forFlorists.apply.field.*`).
 */
export const APPLICATION_ERROR_KEYS: Readonly<
  Record<ApplicationField, string>
> = Object.freeze({
  businessName: "forFlorists.apply.error.shopName",
  contactName: "forFlorists.apply.error.contactName",
  email: "forFlorists.apply.error.email",
  phone: "forFlorists.apply.error.phone",
  country: "forFlorists.apply.error.country",
  town: "forFlorists.apply.error.town",
  capacityPerDay: "forFlorists.apply.error.capacity",
  deliveryArea: "forFlorists.apply.error.area",
  weekendDelivery: "forFlorists.apply.error.weekends",
  registrationNumber: "forFlorists.apply.error.registration",
  website: "forFlorists.apply.error.website",
  contactPreference: "forFlorists.apply.error.contactBy",
  language: "forFlorists.apply.error.language",
});

/** A trimmed, required text of at most `max` characters. */
function requiredText(max: number) {
  return z.string().trim().min(1).max(max);
}

/** A trimmed optional text: an empty answer is no answer. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();
}

/** §5.2: a loose pattern, not normalised to E.164 (an applicant's WhatsApp may be abroad). */
export const APPLICATION_PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/u;

/** An `https:` or `http:` URL of at most 300 characters (§5.2). */
const WebsiteSchema = z
  .string()
  .trim()
  .max(300)
  .refine((value) => {
    if (value === "") return true;
    try {
      const url = new URL(value);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.hostname.includes(".")
      );
    } catch {
      return false;
    }
  })
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const FloristApplicationInputSchema = z
  .object({
    businessName: requiredText(200),
    contactName: requiredText(200),
    email: z.string().trim().max(254).pipe(z.email()),
    phone: z.string().trim().regex(APPLICATION_PHONE_PATTERN),
    /** ISO 3166-1 alpha-2, one of the seeded destinations (`countries.ts`). */
    country: z.string().refine(isCountryIso2),
    town: requiredText(200),
    deliveryArea: requiredText(1000),
    /** An integer field (`inputmode="numeric"`): digits only, so no separator is ever parsed. */
    capacityPerDay: z
      .string()
      .trim()
      .regex(/^[0-9]{1,3}$/u)
      .transform(Number)
      .pipe(z.number().int().min(1).max(500)),
    weekendDelivery: z.enum(["yes", "sometimes", "no"]),
    registrationNumber: optionalText(100),
    website: WebsiteSchema,
    contactPreference: z.enum(["email", "whatsapp", "phone"]),
    language: z.enum(FLORIST_LANGUAGES),
    /** The honeypot: handled before this schema (`submitFloristApplication`), refused here too. */
    hp: z.string().max(0).optional(),
  })
  .strict();
export type FloristApplicationInput = z.output<
  typeof FloristApplicationInputSchema
>;

/** Field → message key, for every issue that names a field; the first issue per field wins. */
export function applicationFieldErrors(
  error: z.ZodError,
): Partial<Record<ApplicationField, string>> {
  const errors: Partial<Record<ApplicationField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;
    if (!(APPLICATION_FIELDS as readonly string[]).includes(field)) continue;
    const name = field as ApplicationField;
    errors[name] ??= APPLICATION_ERROR_KEYS[name];
  }
  return errors;
}

/** What `formEntries()` makes of a post. */
export type FormEntries =
  | { readonly ok: true; readonly entries: Readonly<Record<string, string>> }
  | { readonly ok: false };

/**
 * The posted fields as a record of strings, with React's `$ACTION_*` fields dropped. A repeated
 * key or a file part answers `{ ok: false }`.
 */
export function formEntries(form: FormData): FormEntries {
  const entries: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value !== "string") return { ok: false };
    if (Object.hasOwn(entries, key)) return { ok: false };
    entries[key] = value;
  }
  return { ok: true, entries };
}

/**
 * The answers to show again after a refused post: only the form's own fields, each cut to the
 * schema's longest bound, so the re-rendered page never carries an unknown key or a megabyte.
 */
export function keptAnswers(
  entries: Readonly<Record<string, string>>,
): Partial<Record<ApplicationField, string>> {
  const kept: Partial<Record<ApplicationField, string>> = {};
  for (const field of APPLICATION_FIELDS) {
    const value = entries[field];
    if (typeof value === "string") kept[field] = value.slice(0, 1000);
  }
  return kept;
}
