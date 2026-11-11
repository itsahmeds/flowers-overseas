/**
 * Drizzle definitions for the `customers` tables — `customer`, `address`, `recipient`,
 * `recipient_address` and `consent_log` (spec 002 §5.1 "`customers`", §8, AC-27; `plan/07` §1.3,
 * §5; migration `0006_customers.sql`; TASK-018).
 *
 * The typed mirror of the migration. What to read off this file:
 *
 *  - **no recipient email** — `recipient` and `recipientAddress` have no column whose name matches
 *    `/e[-_]?mail/i`, and `pnpm db:check` fails a migration or a mirror that adds one, citing
 *    `plan/07` §1.3 (AC-27, `checkRecipientEmail` in `scripts/db-check.ts`);
 *  - **case-insensitive buyer email without `citext`** — `customer_email_normalised_idx` is unique
 *    on `lower(email_normalised)` where the row is not redacted;
 *  - **a truncated IP at most** — `consentLog.sourceIpTruncated` is `cidr`, at most /24 or /48.
 *
 * `customer.userId` references `users` (`0010`, TASK-022): `ON DELETE SET NULL`, so a buyer's row
 * stays for the invoice and loses its login.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  cidr,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { country, currency, postcodeZone } from "./geo.ts";
import { locale, timestamps } from "./i18n.ts";
import { E164_PATTERN } from "./partners.ts";

/* -------------------------------------------------------------------------- */
/* The closed value sets (CHECK lists, never a Postgres enum — AC-7)          */
/* -------------------------------------------------------------------------- */

/** `address.kind` — §5.1's list: billing only (delivery addresses are `recipient_address`). */
export const addressKinds = ["billing"] as const;

/** `recipient_address.place_kind` — §5.1's list; null for an ordinary address. */
export const recipientPlaceKinds = [
  "home",
  "work",
  "hospital",
  "funeral_home",
  "hotel",
  "cemetery",
  "church",
] as const;

/** `consent_log.subject_kind`. A visitor is an `anonymous_id`, the others a `subject_ref`. */
export const consentSubjectKinds = [
  "visitor",
  "customer",
  "recipient",
  // Spec 034 §5.1 D (`0040_basket_reminder`): an address known only as its `contactHmac`.
  "contact",
] as const;

/** `('a', 'b')` for a `CHECK … IN` list, from the tuples above. */
function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

/** One `@`, no whitespace: the shape of an address the checkout has normalised. */
const EMAIL_SHAPE_PATTERN = "^[^[:space:]@]+@[^[:space:]@]+$";
const ISO2_PATTERN = "^[A-Z]{2}$";

/* -------------------------------------------------------------------------- */
/* customer, address                                                          */
/* -------------------------------------------------------------------------- */

export const customer = pgTable(
  "customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `users.id` once `0010` exists (TASK-022 adds the reference); null for a guest. */
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    emailNormalised: text("email_normalised").notNull(),
    name: text("name"),
    phoneE164: text("phone_e164"),
    /** Invoicing and payment methods only, never access control (ADR-0006). */
    countryIso2: text("country_iso2"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    redacted: boolean("redacted").notNull().default(false),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    ...timestamps,
    /**
     * The buyer's objection to review emails (spec 022a §5.1, migration `0029_reviews_close`):
     * set by the opt-out link, kept across orders; every later invite is skipped `opted_out`.
     */
    reviewInviteOptOutAt: timestamp("review_invite_opt_out_at", {
      withTimezone: true,
    }),
    /**
     * Spec 018 §14 C.4, C.11 (migration `0036_buyer_sign_in`, TASK-344): set by every confirmed
     * buyer sign-in; the inactive-account sweep (C.9) reads it.
     */
    lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }),
    /**
     * Spec 018 §14 C.7.2, C.11 (migration `0045_buyer_account`, TASK-352): the language of the
     * emails no order carries, and the buyer's currency. Neither redirects or changes a URL.
     */
    preferredLocale: text("preferred_locale").references(() => locale.code, {
      onDelete: "restrict",
    }),
    preferredCurrency: text("preferred_currency").references(
      () => currency.code,
      { onDelete: "restrict" },
    ),
    /** C.7.4: explicit consent to occasion reminders, independent of `marketingConsent`. */
    reminderConsent: boolean("reminder_consent").notNull().default(false),
    /** C.11: 16 CSPRNG bytes, base64url, set at first consent (TASK-353). */
    reminderUnsubscribeToken: text("reminder_unsubscribe_token"),
  },
  (table) => [
    unique("customer_reminder_unsubscribe_token_key").on(
      table.reminderUnsubscribeToken,
    ),
    check(
      "customer_reminder_unsubscribe_token_check",
      sql.raw("reminder_unsubscribe_token ~ '^[A-Za-z0-9_-]{22}$'"),
    ),
    check(
      "customer_email_normalised_check",
      sql.raw(`email_normalised ~ '${EMAIL_SHAPE_PATTERN}'`),
    ),
    check(
      "customer_phone_e164_check",
      sql.raw(`phone_e164 ~ '${E164_PATTERN}'`),
    ),
    check(
      "customer_country_iso2_check",
      sql.raw(`country_iso2 ~ '${ISO2_PATTERN}'`),
    ),
    check(
      "customer_redacted_check",
      sql`${table.redacted} = (${table.redactedAt} is not null)`,
    ),
    /** §5.1: one live customer per email, case-insensitively, with no `citext`. */
    uniqueIndex("customer_email_normalised_idx")
      .on(sql`lower(${table.emailNormalised})`)
      .where(sql`redacted = false`),
    index("customer_user_id_idx").on(table.userId),
  ],
);

export const address = pgTable(
  "address",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    lines: text("lines").array().notNull(),
    postalCode: text("postal_code"),
    city: text("city").notNull(),
    countryIso2: text("country_iso2").notNull(),
    ...timestamps,
  },
  (table) => [
    check("address_kind_check", sql.raw(`kind in ${valueList(addressKinds)}`)),
    check(
      "address_lines_check",
      sql`array_position(${table.lines}, null) is null`,
    ),
    check(
      "address_country_iso2_check",
      sql.raw(`country_iso2 ~ '${ISO2_PATTERN}'`),
    ),
    index("address_customer_id_idx").on(table.customerId),
  ],
);

/* -------------------------------------------------------------------------- */
/* recipient, recipient_address — no email column, by design and by gate      */
/* -------------------------------------------------------------------------- */

export const recipient = pgTable(
  "recipient",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    fullName: text("full_name").notNull(),
    /** Required until the contact is redacted (`plan/07` §1.3). */
    phoneE164: text("phone_e164"),
    isSelf: boolean("is_self").notNull().default(false),
    linkedCustomerId: uuid("linked_customer_id").references(() => customer.id, {
      onDelete: "restrict",
    }),
    contactRedacted: boolean("contact_redacted").notNull().default(false),
    contactRedactedAt: timestamp("contact_redacted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("recipient_full_name_check", sql`btrim(${table.fullName}) <> ''`),
    check(
      "recipient_phone_e164_check",
      sql.raw(`phone_e164 ~ '${E164_PATTERN}'`),
    ),
    check(
      "recipient_phone_check",
      sql`${table.contactRedacted} or ${table.phoneE164} is not null`,
    ),
    check(
      "recipient_contact_redacted_check",
      sql`${table.contactRedacted} = (${table.contactRedactedAt} is not null)`,
    ),
    index("recipient_customer_id_idx").on(table.customerId),
  ],
);

export const recipientAddress = pgTable(
  "recipient_address",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => recipient.id, { onDelete: "restrict" }),
    lines: text("lines").array().notNull(),
    postalCode: text("postal_code"),
    city: text("city").notNull(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "restrict" }),
    postcodeZoneId: uuid("postcode_zone_id"),
    deliveryNote: text("delivery_note"),
    placeKind: text("place_kind"),
    ...timestamps,
  },
  (table) => [
    /** A zone must be in the address's country; a null zone skips the check. */
    foreignKey({
      name: "recipient_address_postcode_zone_fkey",
      columns: [table.postcodeZoneId, table.countryId],
      foreignColumns: [postcodeZone.id, postcodeZone.countryId],
    }).onDelete("restrict"),
    check(
      "recipient_address_lines_check",
      sql`array_position(${table.lines}, null) is null`,
    ),
    check(
      "recipient_address_place_kind_check",
      sql.raw(`place_kind in ${valueList(recipientPlaceKinds)}`),
    ),
    index("recipient_address_recipient_id_idx").on(table.recipientId),
  ],
);

/* -------------------------------------------------------------------------- */
/* saved_recipient, occasion_reminder (spec 018 §14 C.11; `0045`, TASK-352)    */
/* -------------------------------------------------------------------------- */

/** C.7.3: at most this many saved recipients per customer (`SAVED_RECIPIENT_LIMIT`). */
export const SAVED_RECIPIENT_MAX = 20;

/** C.7.4: at most this many reminders per customer (`OCCASION_REMINDER_LIMIT`). */
export const OCCASION_REMINDER_MAX = 50;

/** `occasion_reminder.occasion_key`. */
export const reminderOccasionKeys = [
  "birthday",
  "anniversary",
  "name_day",
  "other",
] as const;

/** `occasion_reminder.lead_days`. */
export const reminderLeadDays = [3, 7, 14] as const;

/**
 * A recipient the buyer chose to keep (C.7.3): exactly full name, phone, address lines, postcode,
 * city, country and `last_used_at`. **No card message, delivery note, place kind or email**
 * (`plan/07` §1.3; `db:check`'s recipient-email rule lists this table).
 */
export const savedRecipient = pgTable(
  "saved_recipient",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    phoneE164: text("phone_e164").notNull(),
    lines: text("lines").array().notNull(),
    postalCode: text("postal_code"),
    city: text("city").notNull(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "saved_recipient_full_name_check",
      sql`btrim(${table.fullName}) <> ''`,
    ),
    check(
      "saved_recipient_phone_e164_check",
      sql.raw(`phone_e164 ~ '${E164_PATTERN}'`),
    ),
    check(
      "saved_recipient_lines_check",
      sql`cardinality(${table.lines}) between 1 and 4 and array_position(${table.lines}, null) is null`,
    ),
    check("saved_recipient_city_check", sql`btrim(${table.city}) <> ''`),
    index("saved_recipient_customer_id_idx").on(table.customerId),
    index("saved_recipient_phone_e164_idx").on(table.phoneE164),
  ],
);

/** An occasion reminder (C.7.4): day and month, no year and no free text. */
export const occasionReminder = pgTable(
  "occasion_reminder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    savedRecipientId: uuid("saved_recipient_id").references(
      () => savedRecipient.id,
      { onDelete: "set null" },
    ),
    occasionKey: text("occasion_key").notNull(),
    day: smallint("day").notNull(),
    month: smallint("month").notNull(),
    leadDays: smallint("lead_days").notNull(),
    lastSentFor: date("last_sent_for"),
    ...timestamps,
  },
  (table) => [
    check(
      "occasion_reminder_occasion_key_check",
      sql.raw(`occasion_key in ${valueList(reminderOccasionKeys)}`),
    ),
    check(
      "occasion_reminder_lead_days_check",
      sql.raw(`lead_days in (${reminderLeadDays.join(", ")})`),
    ),
    check(
      "occasion_reminder_calendar_check",
      sql`${table.month} between 1 and 12 and ${table.day} >= 1 and ${table.day} <= case when ${table.month} = 2 then 29 when ${table.month} in (4, 6, 9, 11) then 30 else 31 end`,
    ),
    index("occasion_reminder_customer_id_idx").on(table.customerId),
    index("occasion_reminder_month_day_idx").on(table.month, table.day),
  ],
);

/* -------------------------------------------------------------------------- */
/* consent_log                                                                */
/* -------------------------------------------------------------------------- */

export const consentLog = pgTable(
  "consent_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectKind: text("subject_kind").notNull(),
    subjectRef: uuid("subject_ref"),
    /** Spec 004's unlinkable `cid`. */
    anonymousId: uuid("anonymous_id"),
    choices: jsonb("choices").notNull(),
    policyVersion: integer("policy_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** A network, never a host (`plan/07` §5): IPv4 /24 or wider, IPv6 /48 or wider. */
    sourceIpTruncated: cidr("source_ip_truncated"),
    /** Written once, never updated, so there is no `updated_at`. */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Spec 034 §5.1 D: a `contact` subject's `contactHmac(email)`; null for every other kind.
     * Last, where migration 0040's `ADD COLUMN` puts it in the table.
     */
    subjectHmac: text("subject_hmac"),
  },
  (table) => [
    check(
      "consent_log_subject_kind_check",
      sql.raw(`subject_kind in ${valueList(consentSubjectKinds)}`),
    ),
    check(
      "consent_log_subject_check",
      sql`case ${table.subjectKind} when 'visitor' then ${table.anonymousId} is not null and ${table.subjectRef} is null and ${table.subjectHmac} is null when 'contact' then ${table.subjectHmac} is not null and ${table.subjectHmac} ~ '^[0-9a-f]{64}$' and ${table.subjectRef} is null and ${table.anonymousId} is null else ${table.subjectRef} is not null and ${table.subjectHmac} is null end`,
    ),
    check(
      "consent_log_choices_check",
      sql`jsonb_typeof(${table.choices}) = 'object'`,
    ),
    check("consent_log_policy_version_check", sql`${table.policyVersion} > 0`),
    index("consent_log_subject_hmac_idx").on(table.subjectHmac),
    check(
      "consent_log_source_ip_truncated_check",
      sql`(family(${table.sourceIpTruncated}) = 4 and masklen(${table.sourceIpTruncated}) <= 24) or (family(${table.sourceIpTruncated}) = 6 and masklen(${table.sourceIpTruncated}) <= 48)`,
    ),
  ],
);
