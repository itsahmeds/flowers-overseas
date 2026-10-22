/**
 * Minimal row builders for the schema suites (spec 002 §10; TASK-019 … TASK-023).
 *
 * Each builder inserts the fewest columns its table's constraints allow and returns the id, so a
 * test reads as the property it checks rather than as a page of `INSERT`s. They run as whatever
 * role the transaction is in — normally the server's superuser, before `asApp()` narrows it.
 * Values are fixed and obviously fake: no real person, address or phone number appears here
 * (`CLAUDE.md`: no PII), and phone numbers are from reserved fiction ranges.
 */
import { randomUUID } from "node:crypto";

import type { Tx } from "./scratch-db.ts";

let counter = 0;
/** A short unique token for natural keys inside one database. */
export function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${String(counter)}${randomUUID().slice(0, 6)}`;
}

/** The currencies and locales most tables need. Idempotent within a database. */
export async function base(tx: Tx): Promise<void> {
  await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('EUR', 2), ('PLN', 2), ('GBP', 2)
           ON CONFLICT DO NOTHING`;
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en', 'en', 'English'), ('pl', 'pl-PL', 'Polski')
           ON CONFLICT DO NOTHING`;
}

export async function country(tx: Tx, iso2 = "PL"): Promise<string> {
  await base(tx);
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
    VALUES (${iso2}, 'PLN', 800, 'Europe/Warsaw')
    ON CONFLICT (iso2) DO UPDATE SET iso2 = EXCLUDED.iso2
    RETURNING id`;
  return row?.id ?? "";
}

export async function customer(tx: Tx, userId?: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO customer (email_normalised, user_id)
    VALUES (${`${unique("buyer")}@example.test`}, ${userId ?? null})
    RETURNING id`;
  return row?.id ?? "";
}

export async function recipient(tx: Tx, customerId: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO recipient (customer_id, full_name, phone_e164)
    VALUES (${customerId}, 'Test Recipient', '+48500000000')
    RETURNING id`;
  return row?.id ?? "";
}

export type PartnerStatus =
  "demo" | "onboarding" | "active" | "paused" | "offboarded";

export async function partner(
  tx: Tx,
  countryId: string,
  status: PartnerStatus = "demo",
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO fulfillment_partner (code, legal_name, city_label, country_id, status,
                                     contact_email, payout_currency_code, capacity_per_day)
    VALUES (${unique("florist-")}, 'Test Florist', 'Warszawa', ${countryId}, ${status},
            'florist@example.test', 'PLN', 15)
    RETURNING id`;
  return row?.id ?? "";
}

export interface AssetOptions {
  readonly kind?: "product" | "delivery_proof" | "brand" | "partner";
  readonly visibility?: "public" | "private";
  readonly exifStripped?: boolean;
}

export async function mediaAsset(
  tx: Tx,
  options: AssetOptions = {},
): Promise<string> {
  const id = randomUUID();
  const kind = options.kind ?? "delivery_proof";
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO media_asset (id, kind, bucket, object_key, mime, width, height, bytes,
                             checksum_sha256, visibility, source, depicts, exif_stripped)
    VALUES (${id}, ${kind}, 'fo-media-test', ${`${kind.replace("_", "-")}/${id}/original`},
            'image/jpeg', 1200, 1500, 48213, ${"a".repeat(64)},
            ${options.visibility ?? "private"}, 'partner',
            ${kind === "delivery_proof" ? "delivery" : "product"},
            ${options.exifStripped ?? true})
    RETURNING id`;
  return row?.id ?? "";
}

/** An order's parents: a country, a buyer and a recipient. */
export async function orderParents(
  tx: Tx,
  userId?: string,
): Promise<{ countryId: string; customerId: string; recipientId: string }> {
  const countryId = await country(tx);
  const customerId = await customer(tx, userId);
  const recipientId = await recipient(tx, customerId);
  return { countryId, customerId, recipientId };
}

/**
 * The columns a `partner_application` row needs since `0020_florists_v0` (spec 011 §5.1;
 * TASK-211), as a SQL fragment's values. Fictional applicant, reserved phone range.
 */
export const APPLICATION_REQUIRED = {
  contact_name: "Test Applicant",
  contact_email: "applicant@example.test",
  contact_phone: "+48 500 000 000",
  privacy_notice_version: "2026-10-04",
} as const;

export interface ApplicationOptions {
  readonly countryId: string;
  readonly languageCode?: string;
  readonly businessName?: string;
  readonly status?: "new" | "contacted" | "rejected" | "converted";
  readonly convertedPartnerId?: string | null;
  /** How long ago the row last changed, in days (sets `updated_at`). */
  readonly changedDaysAgo?: number;
}

/** One valid florist application; returns its id. */
export async function application(
  tx: Tx,
  options: ApplicationOptions,
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO partner_application (business_name, city, country_id, language_code,
                                     contact_name, contact_email, contact_phone,
                                     privacy_notice_version, status, converted_partner_id)
    VALUES (${options.businessName ?? unique("Kwiaty ")}, 'Warszawa', ${options.countryId},
            ${options.languageCode ?? "pl"}, ${APPLICATION_REQUIRED.contact_name},
            ${APPLICATION_REQUIRED.contact_email}, ${APPLICATION_REQUIRED.contact_phone},
            ${APPLICATION_REQUIRED.privacy_notice_version}, ${options.status ?? "new"},
            ${options.convertedPartnerId ?? null})
    RETURNING id`;
  const id = row?.id ?? "";
  if (options.changedDaysAgo !== undefined) {
    // `set_updated_at` stamps `now()` on UPDATE, so the age is set with the trigger off for
    // this one statement (superuser only, rolled back with the test's transaction).
    await tx`ALTER TABLE partner_application DISABLE TRIGGER USER`;
    await tx`UPDATE partner_application
             SET updated_at = now() - make_interval(days => ${options.changedDaysAgo})
             WHERE id = ${id}`;
    await tx`ALTER TABLE partner_application ENABLE TRIGGER USER`;
  }
  return id;
}
