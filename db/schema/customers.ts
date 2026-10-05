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
 * `customer.userId` waits for `users` (`0010`, TASK-022), which adds the reference.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  cidr,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { country, postcodeZone } from "./geo.ts";
import { timestamps } from "./i18n.ts";
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
    userId: uuid("user_id"),
    emailNormalised: text("email_normalised").notNull(),
    name: text("name"),
    phoneE164: text("phone_e164"),
    /** Invoicing and payment methods only, never access control (ADR-0006). */
    countryIso2: text("country_iso2"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    redacted: boolean("redacted").notNull().default(false),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
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
  },
  (table) => [
    check(
      "consent_log_subject_kind_check",
      sql.raw(`subject_kind in ${valueList(consentSubjectKinds)}`),
    ),
    check(
      "consent_log_subject_check",
      sql`case ${table.subjectKind} when 'visitor' then ${table.anonymousId} is not null and ${table.subjectRef} is null else ${table.subjectRef} is not null end`,
    ),
    check(
      "consent_log_choices_check",
      sql`jsonb_typeof(${table.choices}) = 'object'`,
    ),
    check("consent_log_policy_version_check", sql`${table.policyVersion} > 0`),
    check(
      "consent_log_source_ip_truncated_check",
      sql`(family(${table.sourceIpTruncated}) = 4 and masklen(${table.sourceIpTruncated}) <= 24) or (family(${table.sourceIpTruncated}) = 6 and masklen(${table.sourceIpTruncated}) <= 48)`,
    ),
  ],
);
