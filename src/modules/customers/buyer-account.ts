/**
 * The buyer account's own data: sender details and preferences, and saved recipients (spec 018
 * §14 A-founder-2026-10-22 C.7.2, C.7.3, C.11, C.12; AC-53, AC-54, AC-55; TASK-352).
 *
 * **Ownership is row-level security's.** Every read and write here runs through the caller's
 * runner, which in production is the buyer's `customer` database context (`asCustomer` of the
 * account pages): `customer`, `"order"`, `recipient`, `saved_recipient` admit only rows whose
 * customer's `user_id` is the session's user, so another customer's id reads and deletes nothing.
 * The buyer's update guard (`0011`, widened by `0045`) refuses any change to the email, consent,
 * redaction or sign-in columns from a buyer session.
 *
 *  - `saveDetails`: name, phone (already E.164), country of residence, email language and currency.
 *    Nothing else of the row changes, and nothing here redirects or touches a URL (C.7.2).
 *  - `saveRecipientFromOrder`: one `saved_recipient` row copied from an order's recipient snapshot,
 *    exactly C.11's columns: **no card message, delivery note, place kind or email**. Not offered
 *    for a hospital, funeral home or cemetery, nor once the 90-day sweep has redacted the order's
 *    recipient. An identical row already saved is not saved twice. At most 20: the 21st is
 *    refused and writes nothing (the count here, the constraint trigger behind it).
 *  - `removeSavedRecipient`: a delete, not a pseudonymisation.
 *
 * Logs carry no name, phone, address or id (C.10, AC-62): `account.recipient.saved|removed` only.
 * Nothing here writes an order or appends an event.
 */
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { CURRENCY_CODES } from "@/config/currencies";
import { isLocaleCode } from "@/config/locales";
import { logger } from "@/lib/logger";

/** What a runner hands its callback: one method that runs a statement and resolves to its rows. */
export interface AccountExecutor {
  execute(query: SQL): Promise<readonly Record<string, unknown>[]>;
}

/** Runs `fn` in one transaction, normally the buyer's `customer` context (RLS scopes it). */
export type AccountRunner = <T>(
  fn: (db: AccountExecutor) => Promise<T>,
) => Promise<T>;

/** C.7.3: at most this many saved recipients per customer (the migration's trigger agrees). */
export const SAVED_RECIPIENT_LIMIT = 20;

/** C.7.3: the place kinds whose recipient is never offered for saving. */
export const UNSAVEABLE_PLACE_KINDS = [
  "hospital",
  "funeral_home",
  "cemetery",
] as const;

const E164 = z.string().regex(/^\+[1-9][0-9]{1,14}$/u);
const Iso2 = z.string().regex(/^[A-Z]{2}$/u);

/* -------------------------------------------------------------------------- */
/* Details and preferences (C.7.2)                                            */
/* -------------------------------------------------------------------------- */

export const DetailsInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    phoneE164: E164.nullable(),
    countryIso2: Iso2,
    preferredLocale: z
      .string()
      .refine((code) => isLocaleCode(code))
      .nullable(),
    preferredCurrency: z
      .string()
      .refine((code) => CURRENCY_CODES.includes(code))
      .nullable(),
  })
  .strict();
export type DetailsInput = z.infer<typeof DetailsInputSchema>;

export const AccountDetailsSchema = z
  .object({
    email: z.string().min(1),
    name: z.string().nullable(),
    phoneE164: z.string().nullable(),
    countryIso2: z.string().nullable(),
    preferredLocale: z.string().nullable(),
    preferredCurrency: z.string().nullable(),
  })
  .strict();
export type AccountDetails = z.infer<typeof AccountDetailsSchema>;

const DetailsRow = z.object({
  email_normalised: z.string(),
  name: z.string().nullable(),
  phone_e164: z.string().nullable(),
  country_iso2: z.string().nullable(),
  preferred_locale: z.string().nullable(),
  preferred_currency: z.string().nullable(),
});

/** The signed-in customer's details, or `null` when RLS admits no such row. */
export async function readAccountDetails(
  run: AccountRunner,
  customerId: string,
): Promise<AccountDetails | null> {
  const id = z.uuid().parse(customerId);
  const [raw] = await run((db) =>
    db.execute(sql`
      SELECT email_normalised, name, phone_e164, country_iso2, preferred_locale,
             preferred_currency
      FROM customer WHERE id = ${id} AND redacted = false`),
  );
  if (raw === undefined) return null;
  const row = DetailsRow.parse(raw);
  return AccountDetailsSchema.parse({
    email: row.email_normalised,
    name: row.name,
    phoneE164: row.phone_e164,
    countryIso2: row.country_iso2,
    preferredLocale: row.preferred_locale,
    preferredCurrency: row.preferred_currency,
  });
}

/**
 * Saves the details of `customerId` (C.7.2, AC-53). Answers whether a row was written: `false`
 * when RLS admits no such customer (another customer's id, or no session context).
 */
export async function saveDetails(
  run: AccountRunner,
  customerId: string,
  raw: DetailsInput,
): Promise<boolean> {
  const id = z.uuid().parse(customerId);
  const input = DetailsInputSchema.parse(raw);
  const updated = await run((db) =>
    db.execute(sql`
      UPDATE customer
      SET name = ${input.name}, phone_e164 = ${input.phoneE164},
          country_iso2 = ${input.countryIso2},
          preferred_locale = ${input.preferredLocale},
          preferred_currency = ${input.preferredCurrency}
      WHERE id = ${id} AND redacted = false
      RETURNING id`),
  );
  if (updated.length === 0) return false;
  logger.info({}, "account.details.updated");
  return true;
}

/* -------------------------------------------------------------------------- */
/* Saved recipients (C.7.3)                                                   */
/* -------------------------------------------------------------------------- */

export const SavedRecipientSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string().min(1),
    phoneE164: E164,
    lines: z.array(z.string().min(1)).min(1).max(4),
    postalCode: z.string().nullable(),
    city: z.string().min(1),
    countryIso2: Iso2,
    lastUsedAt: z.date(),
  })
  .strict();
export type SavedRecipient = z.infer<typeof SavedRecipientSchema>;

const SavedRow = z.object({
  id: z.uuid(),
  full_name: z.string(),
  phone_e164: z.string(),
  lines: z.array(z.string()),
  postal_code: z.string().nullable(),
  city: z.string(),
  iso2: z.string(),
  last_used_at: z.coerce.date(),
});

function savedRecipientOf(raw: unknown): SavedRecipient {
  const row = SavedRow.parse(raw);
  return SavedRecipientSchema.parse({
    id: row.id,
    fullName: row.full_name,
    phoneE164: row.phone_e164,
    lines: row.lines,
    postalCode: row.postal_code,
    city: row.city,
    countryIso2: row.iso2,
    lastUsedAt: row.last_used_at,
  });
}

const SAVED_COLUMNS = sql`s.id, s.full_name, s.phone_e164, s.lines, s.postal_code, s.city,
  c.iso2, s.last_used_at`;

/** The customer's saved recipients, most recently used first (RLS: only theirs). */
export async function listSavedRecipients(
  run: AccountRunner,
  customerId: string,
): Promise<SavedRecipient[]> {
  const id = z.uuid().parse(customerId);
  const rows = await run((db) =>
    db.execute(sql`
      SELECT ${SAVED_COLUMNS}
      FROM saved_recipient s JOIN country c ON c.id = s.country_id
      WHERE s.customer_id = ${id}
      ORDER BY s.last_used_at DESC, s.full_name, s.id`),
  );
  return rows.map(savedRecipientOf);
}

/** Deletes one saved recipient of the customer; `false` when RLS admits no such row. */
export async function removeSavedRecipient(
  run: AccountRunner,
  customerId: string,
  savedRecipientId: string,
): Promise<boolean> {
  const customer = z.uuid().parse(customerId);
  const id = z.uuid().safeParse(savedRecipientId);
  if (!id.success) return false;
  const deleted = await run((db) =>
    db.execute(sql`
      DELETE FROM saved_recipient
      WHERE id = ${id.data} AND customer_id = ${customer}
      RETURNING id`),
  );
  if (deleted.length === 0) return false;
  logger.info({}, "account.recipient.removed");
  return true;
}

/**
 * Sets `last_used_at` of one saved recipient of the customer and answers it (C.8 R3, AC-55, AC-61):
 * the only write a use makes. `null` when RLS admits no such row.
 */
export async function markSavedRecipientUsed(
  run: AccountRunner,
  customerId: string,
  savedRecipientId: string,
  now: Date,
): Promise<SavedRecipient | null> {
  const customer = z.uuid().parse(customerId);
  const id = z.uuid().safeParse(savedRecipientId);
  if (!id.success) return null;
  const [raw] = await run((db) =>
    db.execute(sql`
      WITH used AS (
        UPDATE saved_recipient SET last_used_at = ${now.toISOString()}::timestamptz
        WHERE id = ${id.data} AND customer_id = ${customer}
        RETURNING *)
      SELECT ${SAVED_COLUMNS} FROM used s JOIN country c ON c.id = s.country_id`),
  );
  return raw === undefined ? null : savedRecipientOf(raw);
}

/** The parts of an order's recipient snapshot a saved recipient copies, and its place kind. */
const SnapshotSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  phoneE164: E164,
  addressLines: z.array(z.string().trim().min(1).max(200)).min(1).max(4),
  postcode: z.string().trim().max(16).optional(),
  city: z.string().trim().min(1).max(120),
  placeKind: z.string().optional(),
});

const OrderRecipientRow = z.object({
  snapshot: z.unknown(),
  country_id: z.uuid(),
  contact_redacted: z.boolean(),
});

/** What the order detail offers (C.13): the box, a saved row already, or nothing. */
export type SaveOffer = "offered" | "saved" | "not_offered";

export type SaveRecipientOutcome = "saved" | "limit" | "not_offered";

interface OrderRecipientCopy {
  readonly fullName: string;
  readonly phoneE164: string;
  readonly lines: readonly string[];
  readonly postalCode: string | null;
  readonly city: string;
  readonly countryId: string;
}

/**
 * The order's recipient as a saved recipient would copy it, or `null` when saving is not offered:
 * RLS admits no such order, the recipient was swept (`contact_redacted`), the snapshot lacks a
 * field, or the place kind is a hospital, funeral home or cemetery (AC-54).
 */
async function orderRecipientCopy(
  db: AccountExecutor,
  orderId: string,
): Promise<OrderRecipientCopy | null> {
  const [raw] = await db.execute(sql`
    SELECT o.recipient_snapshot AS snapshot, o.destination_country_id AS country_id,
           r.contact_redacted
    FROM "order" o JOIN recipient r ON r.id = o.recipient_id
    WHERE o.id = ${orderId}`);
  if (raw === undefined) return null;
  const row = OrderRecipientRow.parse(raw);
  if (row.contact_redacted) return null;
  const snapshot = SnapshotSchema.safeParse(row.snapshot);
  if (!snapshot.success) return null;
  const kind = snapshot.data.placeKind;
  if (
    kind !== undefined &&
    (UNSAVEABLE_PLACE_KINDS as readonly string[]).includes(kind)
  ) {
    return null;
  }
  const postcode = snapshot.data.postcode ?? "";
  return {
    fullName: snapshot.data.fullName,
    phoneE164: snapshot.data.phoneE164,
    lines: snapshot.data.addressLines,
    postalCode: postcode === "" ? null : postcode,
    city: snapshot.data.city,
    countryId: row.country_id,
  };
}

function textArray(values: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** The customer's row identical to `copy`, if one is saved already. */
function sameRecipient(customerId: string, copy: OrderRecipientCopy): SQL {
  return sql`
    SELECT id FROM saved_recipient
    WHERE customer_id = ${customerId} AND full_name = ${copy.fullName}
      AND phone_e164 = ${copy.phoneE164} AND lines = ${textArray(copy.lines)}
      AND postal_code IS NOT DISTINCT FROM ${copy.postalCode}
      AND city = ${copy.city} AND country_id = ${copy.countryId}
    LIMIT 1`;
}

/** What the order detail shows for saving this order's recipient (C.13, AC-54). */
export async function recipientSaveOffer(
  run: AccountRunner,
  customerId: string,
  orderId: string,
): Promise<SaveOffer> {
  const customer = z.uuid().parse(customerId);
  const order = z.uuid().parse(orderId);
  return run(async (db) => {
    const copy = await orderRecipientCopy(db, order);
    if (copy === null) return "not_offered";
    const [found] = await db.execute(sameRecipient(customer, copy));
    return found === undefined ? "offered" : "saved";
  });
}

/** Whether `error`, or an error it wraps, is the migration's 21st-row refusal. */
function isLimitError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current.message.includes("SAVED_RECIPIENT_LIMIT")) return true;
    current = current.cause;
  }
  return false;
}

/**
 * Saves the recipient of `orderId` for `customerId` (C.7.3, AC-54): one row of exactly C.11's
 * columns, `last_used_at` now. `not_offered` writes nothing (no such order, a swept recipient, a
 * place kind that is never saved); `limit` writes nothing; an identical row is `saved` already.
 */
export async function saveRecipientFromOrder(
  run: AccountRunner,
  customerId: string,
  orderId: string,
  now: Date,
): Promise<SaveRecipientOutcome> {
  const customer = z.uuid().parse(customerId);
  const order = z.uuid().parse(orderId);
  try {
    const outcome = await run(async (db) => {
      const copy = await orderRecipientCopy(db, order);
      if (copy === null) return "not_offered" as const;
      const [found] = await db.execute(sameRecipient(customer, copy));
      if (found !== undefined) return "saved" as const;
      const [counted] = await db.execute(sql`
        SELECT count(*)::int AS count FROM saved_recipient WHERE customer_id = ${customer}`);
      const count = z.object({ count: z.number().int() }).parse(counted).count;
      if (count >= SAVED_RECIPIENT_LIMIT) return "limit" as const;
      await db.execute(sql`
        INSERT INTO saved_recipient (customer_id, full_name, phone_e164, lines, postal_code,
                                     city, country_id, last_used_at)
        VALUES (${customer}, ${copy.fullName}, ${copy.phoneE164}, ${textArray(copy.lines)},
                ${copy.postalCode}, ${copy.city}, ${copy.countryId},
                ${now.toISOString()}::timestamptz)`);
      return "saved" as const;
    });
    if (outcome === "saved") logger.info({}, "account.recipient.saved");
    return outcome;
  } catch (error) {
    if (isLimitError(error)) return "limit";
    throw error;
  }
}
