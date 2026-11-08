/**
 * The partner and application edit schemas, the status graph and the activation preflight, as
 * pure functions (spec 012 §2.5, §5.2; AC-15, AC-16, AC-17; TASK-221).
 *
 * Every schema here parses a form's strings into the values the commands in `commands.ts` write:
 *
 *  - **E.164 for the partner's country** (AC-15): a contact phone is parsed against the numbering
 *    plan of the partner's own country and must be dialled with that country's calling code, so a
 *    Polish florist's `512 345 678` becomes `+48512345678` and a valid German number is refused for
 *    a Polish florist. `libphonenumber-js/max` checks the digits, not only the length. Server only:
 *    the package is forbidden in any client closure (`tests/unit/client-message-graph.test.ts`).
 *  - **Payouts are positive integers of minor units** (AC-15): digits only, no sign, no point, no
 *    exponent, no leading zero, at most the largest safe integer. `"12.5"`, `"0"`, `"-1"`, `"1e3"`
 *    and `"0149"` are refused; nothing is ever rounded.
 *  - **A currency is one the `currency` table holds** (AC-15): the schema factories take the set
 *    the command read from the table in the same transaction, so the refusal is the table's, not
 *    a constant's.
 *
 * Refusals are codes keyed by field (`PartnerFieldErrors`), never copy: the admin pages map each
 * code to a message key. No value a person typed appears in an error.
 */
import {
  type CountryCode,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js/max";
import { z } from "zod";

import {
  partnerNotificationChannels,
  partnerStatuses,
} from "../../../../db/schema/partners";
import { parseContactName } from "../crm/schemas";

export type PartnerStatus = (typeof partnerStatuses)[number];
export type PartnerChannel = (typeof partnerNotificationChannels)[number];

/* -------------------------------------------------------------------------- */
/* field rules                                                                */
/* -------------------------------------------------------------------------- */

const ISO2 = /^[A-Z]{2}$/u;
const ISO4217 = /^[A-Z]{3}$/u;
/** `fulfillment_partner_code_check`, at most 60 characters. */
export const PARTNER_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
/** Positive whole minor units, as typed: no sign, point, exponent or leading zero. */
const MINOR_UNITS = /^[1-9][0-9]*$/u;
/** A whole number of orders a day, as typed. */
const WHOLE = /^[1-9][0-9]{0,3}$/u;
/** A calendar date as a date input sends it. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
/** The phone characters a person types; letters are refused before parsing (vanity numbers). */
const PHONE_CHARACTERS = /^[\d\s +()./-]+$/u;
/** The most orders a day a form accepts, as spec 011's application form (`0022`). */
export const MAX_CAPACITY_PER_DAY = 500;

/** Refusal codes, by what was refused. The admin catalogue holds one message per code. */
export const partnerFieldErrors = [
  "required",
  "tooLong",
  "email",
  "phone",
  "phoneForChannel",
  "currency",
  "country",
  "capacity",
  "payout",
  "code",
  "date",
  "dateFuture",
  "dateFar",
  "datePast",
  "version",
  "reason",
  "target",
  "product",
  // Spec 030b §5.2 (TASK-441): the contact person, 2 to 120 characters, no contact details.
  "tooShort",
  "contactDetails",
] as const;
export type PartnerFieldError = (typeof partnerFieldErrors)[number];
export type PartnerFieldErrors = Readonly<Record<string, PartnerFieldError>>;

/** A form value: trimmed text, or `undefined` for an absent or blank field. */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** The plan of an ISO 3166-1 alpha-2 code, or `undefined` when the library has none. */
function planFor(iso2: string): CountryCode | undefined {
  return ISO2.test(iso2) && isSupportedCountry(iso2) ? iso2 : undefined;
}

/**
 * A phone typed for a partner in `countryIso2`, as E.164, or `undefined` when it is not a valid
 * number dialled with that country's calling code (AC-15).
 */
export function partnerPhoneE164(
  raw: string,
  countryIso2: string,
): string | undefined {
  const plan = planFor(countryIso2);
  const typed = raw.trim();
  if (plan === undefined || typed === "" || !PHONE_CHARACTERS.test(typed)) {
    return undefined;
  }
  const phone = parsePhoneNumberFromString(typed, { defaultCountry: plan });
  if (phone === undefined || !phone.isValid()) return undefined;
  return phone.countryCallingCode === getCountryCallingCode(plan)
    ? phone.number
    : undefined;
}

/** The calling code of a country's numbering plan without the plus ("48"), for the field hint. */
export function partnerCallingCode(countryIso2: string): string | undefined {
  const plan = planFor(countryIso2);
  return plan === undefined ? undefined : getCountryCallingCode(plan);
}

/** Positive whole minor units from their typed form, or `undefined` (AC-15). */
export function payoutMinorUnits(raw: unknown): number | undefined {
  const typed = typeof raw === "string" ? raw.trim() : undefined;
  if (typed === undefined || !MINOR_UNITS.test(typed)) return undefined;
  const value = Number(typed);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** A real calendar date `YYYY-MM-DD` (no 30 February), or `undefined`. */
export function calendarDate(raw: unknown): string | undefined {
  const typed = text(raw);
  if (typed === undefined || !ISO_DATE.test(typed)) return undefined;
  const parsed = new Date(`${typed}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === typed
    ? typed
    : undefined;
}

/** The UTC calendar date `days` away from `now`. */
function utcDate(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** An `updated_at` the form carried back, as the page rendered it. */
const VersionSchema = z.iso.datetime({ offset: true });

/** The outcome of a parse: the value, or the refusal per field. */
export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: PartnerFieldErrors };

/* -------------------------------------------------------------------------- */
/* PartnerEditSchema: create and update                                       */
/* -------------------------------------------------------------------------- */

/** What the database needs to judge a partner form: its own reference rows. */
export interface PartnerReference {
  /** `currency.code`, every row. */
  readonly currencies: ReadonlySet<string>;
  /** `country.iso2`, every row. */
  readonly countries: ReadonlySet<string>;
}

/** The profile a partner form saves (spec 012 §2.5 "edit"). */
export interface PartnerProfile {
  readonly legalName: string;
  readonly cityLabel: string;
  readonly countryIso2: string;
  readonly notificationChannel: PartnerChannel;
  readonly contactEmail: string;
  /** E.164, or `null` when none was given. */
  readonly contactPhone: string | null;
  readonly payoutCurrency: string;
  readonly capacityPerDay: number;
  /**
   * The contact person (spec 030b §5.2: `PartnerEditSchema` gains `contactName`): `undefined`
   * when the form carried no such field, so a save leaves the column alone; `null` clears it.
   */
  readonly contactName?: string | null;
}

/** The form's fields; anything else is ignored. */
export const PartnerEditFormSchema = z.object({
  legalName: z.string().optional(),
  cityLabel: z.string().optional(),
  countryIso2: z.string().optional(),
  notificationChannel: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  payoutCurrency: z.string().optional(),
  capacityPerDay: z.string().optional(),
  contactName: z.string().optional(),
});

const EmailSchema = z.email().max(254);

/**
 * `PartnerEditSchema` (§5.2): the profile of a partner from its form, judged against the
 * reference rows (AC-15). Every refusal is reported, one code per field.
 */
export function parsePartnerProfile(
  input: unknown,
  reference: PartnerReference,
): Parsed<PartnerProfile> {
  const form = PartnerEditFormSchema.safeParse(input);
  const fields = form.success ? form.data : {};
  const errors: Record<string, PartnerFieldError> = {};

  const legalName = text(fields.legalName);
  if (legalName === undefined) errors["legalName"] = "required";
  else if (legalName.length > 200) errors["legalName"] = "tooLong";

  const cityLabel = text(fields.cityLabel);
  if (cityLabel === undefined) errors["cityLabel"] = "required";
  else if (cityLabel.length > 120) errors["cityLabel"] = "tooLong";

  const countryIso2 = text(fields.countryIso2)?.toUpperCase();
  const countryKnown =
    countryIso2 !== undefined &&
    ISO2.test(countryIso2) &&
    reference.countries.has(countryIso2);
  if (!countryKnown) errors["countryIso2"] = "country";

  const channelParse = z
    .enum(partnerNotificationChannels)
    .safeParse(text(fields.notificationChannel));
  if (!channelParse.success) errors["notificationChannel"] = "required";

  const email = text(fields.contactEmail)?.toLowerCase();
  if (email === undefined) errors["contactEmail"] = "required";
  else if (!EmailSchema.safeParse(email).success)
    errors["contactEmail"] = "email";

  const typedPhone = text(fields.contactPhone);
  let contactPhone: string | null = null;
  if (typedPhone !== undefined) {
    const e164 =
      countryKnown && countryIso2 !== undefined
        ? partnerPhoneE164(typedPhone, countryIso2)
        : undefined;
    if (e164 === undefined) errors["contactPhone"] = "phone";
    else contactPhone = e164;
  } else if (channelParse.success && channelParse.data === "whatsapp") {
    errors["contactPhone"] = "phoneForChannel";
  }

  const payoutCurrency = text(fields.payoutCurrency)?.toUpperCase();
  if (
    payoutCurrency === undefined ||
    !ISO4217.test(payoutCurrency) ||
    !reference.currencies.has(payoutCurrency)
  ) {
    errors["payoutCurrency"] = "currency";
  }

  const capacityText = text(fields.capacityPerDay);
  const capacity =
    capacityText !== undefined && WHOLE.test(capacityText)
      ? Number(capacityText)
      : undefined;
  if (capacity === undefined || capacity > MAX_CAPACITY_PER_DAY) {
    errors["capacityPerDay"] = "capacity";
  }

  const contactName =
    fields.contactName === undefined
      ? undefined
      : parseContactName(fields.contactName);
  if (contactName !== undefined && "error" in contactName) {
    errors["contactName"] = contactName.error;
  }

  if (
    Object.keys(errors).length > 0 ||
    legalName === undefined ||
    cityLabel === undefined ||
    countryIso2 === undefined ||
    !channelParse.success ||
    email === undefined ||
    payoutCurrency === undefined ||
    capacity === undefined
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      legalName,
      cityLabel,
      countryIso2,
      notificationChannel: channelParse.data,
      contactEmail: email,
      contactPhone,
      payoutCurrency,
      capacityPerDay: capacity,
      ...(contactName !== undefined && "name" in contactName
        ? { contactName: contactName.name }
        : {}),
    },
  };
}

/** A new partner's code, from its form (`fulfillment_partner_code_check`). */
export function parsePartnerCode(raw: unknown): string | undefined {
  const typed = text(raw)?.toLowerCase();
  return typed !== undefined &&
    typed.length <= 60 &&
    PARTNER_CODE_PATTERN.test(typed)
    ? typed
    : undefined;
}

/** The row an edit names and the version the form was rendered from (§5.2 "Concurrency"). */
export const PartnerVersionSchema = z
  .object({ partnerId: z.uuid(), updatedAt: VersionSchema })
  .strip();
export type PartnerVersion = z.infer<typeof PartnerVersionSchema>;

/* -------------------------------------------------------------------------- */
/* terms, coverage, blackouts, mapping                                        */
/* -------------------------------------------------------------------------- */

/** A partner agreement's version label: `v1`, `2026-10`, `pa-pl-2026-10`. */
const TERMS_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/u;

export interface TermsEdit {
  readonly signedOn: string;
  readonly version: string;
}

/**
 * `recordTerms`' input: the day the agreement was signed (not after today anywhere on Earth) and
 * its version label.
 */
export function parseTerms(input: unknown, now: Date): Parsed<TermsEdit> {
  const fields = z
    .object({ signedOn: z.unknown(), version: z.unknown() })
    .partial()
    .safeParse(input);
  const values = fields.success ? fields.data : {};
  const errors: Record<string, PartnerFieldError> = {};
  const signedOn = calendarDate(values.signedOn);
  if (signedOn === undefined) errors["signedOn"] = "date";
  else if (signedOn > utcDate(now, 1)) errors["signedOn"] = "dateFuture";
  const version = text(values.version);
  if (version === undefined || !TERMS_VERSION.test(version)) {
    errors["version"] = "version";
  }
  if (
    Object.keys(errors).length > 0 ||
    signedOn === undefined ||
    version === undefined
  ) {
    return { ok: false, errors };
  }
  return { ok: true, value: { signedOn, version } };
}

/** `CoverageEditSchema`: add a city or a postcode zone, or remove one row. */
export type CoverageEdit =
  | {
      readonly op: "add";
      readonly target:
        | { readonly kind: "city"; readonly id: string }
        | { readonly kind: "zone"; readonly id: string };
      /** `null`: the partner's own capacity. */
      readonly capacityPerDay: number | null;
    }
  | { readonly op: "remove"; readonly coverageId: string };

const TARGET = /^(city|zone):([0-9a-f-]{36})$/u;

export function parseCoverage(input: unknown): Parsed<CoverageEdit> {
  const fields = z
    .object({
      op: z.unknown(),
      target: z.unknown(),
      capacityPerDay: z.unknown(),
      coverageId: z.unknown(),
    })
    .partial()
    .safeParse(input);
  const values = fields.success ? fields.data : {};
  if (values.op === "remove") {
    const id = z.uuid().safeParse(values.coverageId);
    return id.success
      ? { ok: true, value: { op: "remove", coverageId: id.data } }
      : { ok: false, errors: { coverageId: "target" } };
  }
  const errors: Record<string, PartnerFieldError> = {};
  const match = TARGET.exec(text(values.target) ?? "");
  const kind = match?.[1];
  const id = z.uuid().safeParse(match?.[2]);
  if ((kind !== "city" && kind !== "zone") || !id.success) {
    errors["target"] = "target";
  }
  const capacityText = text(values.capacityPerDay);
  let capacityPerDay: number | null = null;
  if (capacityText !== undefined) {
    const capacity = WHOLE.test(capacityText) ? Number(capacityText) : 0;
    if (capacity < 1 || capacity > MAX_CAPACITY_PER_DAY) {
      errors["capacityPerDay"] = "capacity";
    } else {
      capacityPerDay = capacity;
    }
  }
  if (
    Object.keys(errors).length > 0 ||
    (kind !== "city" && kind !== "zone") ||
    !id.success
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { op: "add", target: { kind, id: id.data }, capacityPerDay },
  };
}

/** `BlackoutEditSchema`: add a day off (today or later, within two years), or remove one. */
export type BlackoutEdit =
  | {
      readonly op: "add";
      readonly date: string;
      readonly reason: string | null;
    }
  | { readonly op: "remove"; readonly date: string };

export function parseBlackout(input: unknown, now: Date): Parsed<BlackoutEdit> {
  const fields = z
    .object({ op: z.unknown(), date: z.unknown(), reason: z.unknown() })
    .partial()
    .safeParse(input);
  const values = fields.success ? fields.data : {};
  const date = calendarDate(values.date);
  if (date === undefined) return { ok: false, errors: { date: "date" } };
  if (values.op === "remove")
    return { ok: true, value: { op: "remove", date } };
  // "Today" anywhere on Earth is from yesterday to tomorrow in UTC.
  if (date < utcDate(now, -1))
    return { ok: false, errors: { date: "datePast" } };
  if (date > utcDate(now, 731))
    return { ok: false, errors: { date: "dateFar" } };
  const reason = text(values.reason) ?? null;
  if (reason !== null && reason.length > 200) {
    return { ok: false, errors: { reason: "tooLong" } };
  }
  return { ok: true, value: { op: "add", date, reason } };
}

/** `CatalogMappingEditSchema`: one product and size, whether the partner makes it, the payout. */
export type MappingEdit =
  | {
      readonly op: "save";
      readonly productId: string;
      /** `null`: the product's base row (no size named). */
      readonly tierKey: string | null;
      readonly canFulfil: boolean;
      readonly payoutMinor: number;
      readonly currency: string;
    }
  | { readonly op: "remove"; readonly mappingId: string };

/** A size the form names: empty for every size, else a `product_tier.tier_key`. */
const TIER_KEY = /^[a-z0-9_-]{1,40}$/u;

/**
 * Parses a mapping form: `product` (an id), `size` (empty for every size, a null `tier_key`,
 * which spec 016's routing reads as covering every tier; else a tier key, which the command
 * checks exists for that product), `canFulfil`, `payoutMinor` and `currency`. `currency` must be
 * one of `currencies` (the `currency` table) and is the partner's payout currency, which the
 * command checks against the row it locked.
 */
export function parseMapping(
  input: unknown,
  currencies: ReadonlySet<string>,
): Parsed<MappingEdit> {
  const fields = z
    .object({
      op: z.unknown(),
      product: z.unknown(),
      size: z.unknown(),
      canFulfil: z.unknown(),
      payoutMinor: z.unknown(),
      currency: z.unknown(),
      mappingId: z.unknown(),
    })
    .partial()
    .safeParse(input);
  const values = fields.success ? fields.data : {};
  if (values.op === "remove") {
    const id = z.uuid().safeParse(values.mappingId);
    return id.success
      ? { ok: true, value: { op: "remove", mappingId: id.data } }
      : { ok: false, errors: { mappingId: "target" } };
  }
  const errors: Record<string, PartnerFieldError> = {};
  const productId = z.uuid().safeParse(text(values.product));
  if (!productId.success) errors["product"] = "product";
  const size = text(values.size) ?? "";
  if (size !== "" && !TIER_KEY.test(size)) errors["size"] = "product";
  const payoutMinor = payoutMinorUnits(values.payoutMinor);
  if (payoutMinor === undefined) errors["payoutMinor"] = "payout";
  const currency = text(values.currency)?.toUpperCase();
  if (
    currency === undefined ||
    !ISO4217.test(currency) ||
    !currencies.has(currency)
  ) {
    errors["currency"] = "currency";
  }
  const canFulfil = values.canFulfil === "yes" || values.canFulfil === "on";
  if (
    Object.keys(errors).length > 0 ||
    !productId.success ||
    payoutMinor === undefined ||
    currency === undefined
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      op: "save",
      productId: productId.data,
      tierKey: size === "" ? null : size,
      canFulfil,
      payoutMinor,
      currency,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* the status graph and its preconditions (§2.5, AC-16)                       */
/* -------------------------------------------------------------------------- */

/**
 * The §2.5 graph, and nothing else: `onboarding → active | offboarded`, `active → paused |
 * offboarded`, `paused → active | offboarded`, `demo → offboarded`. `offboarded` is the end, and
 * nothing moves into `demo` or `onboarding` (a demo partner is seed-only; create starts at
 * `onboarding`).
 */
export const PARTNER_STATUS_EDGES: Readonly<
  Record<PartnerStatus, readonly PartnerStatus[]>
> = Object.freeze({
  onboarding: ["active", "offboarded"],
  active: ["paused", "offboarded"],
  paused: ["active", "offboarded"],
  demo: ["offboarded"],
  offboarded: [],
});

export const PartnerStatusSchema = z.enum(partnerStatuses);

/** Whether the graph has the edge `from → to`. */
export function isPartnerStatusEdge(from: string, to: string): boolean {
  const parsedFrom = PartnerStatusSchema.safeParse(from);
  const parsedTo = PartnerStatusSchema.safeParse(to);
  return (
    parsedFrom.success &&
    parsedTo.success &&
    PARTNER_STATUS_EDGES[parsedFrom.data].includes(parsedTo.data)
  );
}

/** `PartnerStatusChangeSchema`: the target status and the version the page showed. */
export const PartnerStatusChangeSchema = PartnerVersionSchema.extend({
  to: PartnerStatusSchema,
}).strip();
export type PartnerStatusChange = z.infer<typeof PartnerStatusChangeSchema>;

/** The four conditions of `→ active`, in the order the status card lists them. */
export const ACTIVATION_CONDITIONS = [
  "terms",
  "coverage",
  "mapping",
  "contact",
  // Spec 030b §14.2 A, §13 Q21 (founder 2026-10-24, "Q21 blocks"; TASK-442): a current signed
  // `agreement` row in `partner_contract`. Unmet, it reads "No signed agreement on file".
  "agreement",
] as const;
export type ActivationCondition = (typeof ACTIVATION_CONDITIONS)[number];

/** What the preflight reads of a partner. */
export interface PreflightFacts {
  readonly termsSignedAt: string | null;
  readonly termsVersion: string | null;
  readonly coverageRows: number;
  /** Mappings with `can_fulfil` and a payout above zero. */
  readonly fulfillableMappings: number;
  readonly notificationChannel: string;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  /** A current (not superseded, not withdrawn) `agreement` row exists (spec 030b §13 Q21). */
  readonly currentAgreement: boolean;
}

/** Each condition of `→ active`, met or not. */
export type PreflightResult = Readonly<Record<ActivationCondition, boolean>>;

/** `partnerStatusPreflight`'s rule: signed terms, a zone, a fulfillable mapping, the contact. */
export function activationPreflight(facts: PreflightFacts): PreflightResult {
  const email = facts.contactEmail?.trim() ?? "";
  const phone = facts.contactPhone?.trim() ?? "";
  const contact =
    facts.notificationChannel === "email"
      ? email !== "" && EmailSchema.safeParse(email).success
      : facts.notificationChannel === "whatsapp" &&
        new RegExp(String.raw`^\+[1-9][0-9]{1,14}$`, "u").test(phone);
  return {
    terms: facts.termsSignedAt !== null && facts.termsVersion !== null,
    coverage: facts.coverageRows > 0,
    mapping: facts.fulfillableMappings > 0,
    contact,
    agreement: facts.currentAgreement,
  };
}

/** The conditions still unmet, in card order; empty means `→ active` may be offered. */
export function unmetConditions(
  result: PreflightResult,
): ActivationCondition[] {
  return ACTIVATION_CONDITIONS.filter((condition) => !result[condition]);
}

/* -------------------------------------------------------------------------- */
/* applications (§2.5, AC-17)                                                 */
/* -------------------------------------------------------------------------- */

/** `new → contacted → converted | rejected`; the two decisions are the end. */
export const APPLICATION_STATUS_EDGES = Object.freeze({
  new: ["contacted"],
  contacted: ["converted", "rejected"],
  converted: [],
  rejected: [],
} as const satisfies Record<string, readonly string[]>);

export type ApplicationStatus = keyof typeof APPLICATION_STATUS_EDGES;

/** Whether an application may move `from → to`. */
export function isApplicationEdge(from: string, to: string): boolean {
  if (!Object.hasOwn(APPLICATION_STATUS_EDGES, from)) return false;
  const next: readonly string[] =
    APPLICATION_STATUS_EDGES[from as ApplicationStatus];
  return next.includes(to);
}

/** The application an action names and the version the page showed. */
const ApplicationVersionSchema = z
  .object({ applicationId: z.uuid(), updatedAt: VersionSchema })
  .strip();

/** `ApplicationConvertSchema`: convert one contacted application into an onboarding partner. */
export const ApplicationConvertSchema = ApplicationVersionSchema;
export type ApplicationConvert = z.infer<typeof ApplicationConvertSchema>;

/** `ApplicationContactSchema`: mark one new application as contacted. */
export const ApplicationContactSchema = ApplicationVersionSchema;

/** `ApplicationRejectSchema`: a reason is required, 3 to 500 characters, kept in `status_reason`. */
export const ApplicationRejectSchema = ApplicationVersionSchema.extend({
  reason: z.string().trim().min(3).max(500),
}).strip();
export type ApplicationReject = z.infer<typeof ApplicationRejectSchema>;
