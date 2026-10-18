/**
 * The guest-checkout writers of buyers and recipients (spec 010 §5.2 "Customers and recipients";
 * `plan/11` §3; TASK-202).
 *
 *  - `upsertGuestCustomer` matches on the **normalised email** (trimmed, lower-cased; the unique
 *    index `customer_email_normalised_idx` is on `lower(email_normalised)` among unredacted rows)
 *    and **never overwrites** an existing row's name, phone or country from an unauthenticated
 *    checkout: anyone can type anyone's email. The order's `buyer_snapshot` keeps what was typed.
 *  - `createRecipient` deduplicates on `(customer, normalised full name, phone)` (`plan/11` §3)
 *    and writes the `recipient_address`, reusing an identical address rather than adding a copy.
 *    The order's `recipient_snapshot` stays the history-preserving copy.
 *
 * Both run in the caller's transaction (the checkout's placement), as `system`; neither logs a
 * value it writes.
 */
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

/**
 * What the writers need of the caller's transaction handle (`DbTransaction` of `src/lib/db.ts`
 * satisfies it): one method that runs a statement and resolves to its rows.
 */
export interface SqlRunner {
  execute(query: SQL): PromiseLike<unknown>;
}

const Phone = z.string().regex(/^\+[1-9][0-9]{1,14}$/);

export const GuestCustomerInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    name: z.string().trim().min(1).max(200).optional(),
    phoneE164: Phone.optional(),
    countryIso2: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict();

export type GuestCustomerInput = z.input<typeof GuestCustomerInputSchema>;

export const RecipientInputSchema = z
  .object({
    customerId: z.uuid(),
    fullName: z.string().min(1).max(200),
    phoneE164: Phone,
    address: z
      .object({
        lines: z.array(z.string().min(1).max(200)).min(1).max(4),
        postalCode: z.string().min(1).max(16).optional(),
        city: z.string().min(1).max(120),
        countryId: z.uuid(),
        postcodeZoneId: z.uuid().optional(),
        deliveryNote: z.string().max(400).optional(),
        placeKind: z
          .enum([
            "home",
            "work",
            "hospital",
            "funeral_home",
            "hotel",
            "cemetery",
            "church",
          ])
          .optional(),
      })
      .strict(),
  })
  .strict();

export type RecipientInput = z.input<typeof RecipientInputSchema>;

/** `plan/11` §3's email identity: trimmed and lower-cased. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * `plan/11` §3's name identity: NFC, whitespace collapsed, trimmed, lower-cased with the root
 * locale (no Turkish dotless-i surprise), so "Anna  Nowak" and "anna nowak" are one recipient.
 */
export function normaliseFullName(name: string): string {
  return name.normalize("NFC").replace(/\s+/gu, " ").trim().toLowerCase();
}

const IdRow = z.object({ id: z.uuid() });

async function rows(
  db: SqlRunner,
  query: SQL,
): Promise<readonly Record<string, unknown>[]> {
  const result: unknown = await db.execute(query);
  return result as readonly Record<string, unknown>[];
}

export interface UpsertedCustomer {
  readonly customerId: string;
  readonly created: boolean;
}

export async function upsertGuestCustomer(
  db: SqlRunner,
  raw: GuestCustomerInput,
): Promise<UpsertedCustomer> {
  const input = GuestCustomerInputSchema.parse(raw);
  const email = normaliseEmail(input.email);
  const [inserted] = await rows(
    db,
    sql`
    INSERT INTO customer (email_normalised, name, phone_e164, country_iso2)
    VALUES (${email}, ${input.name ?? null}, ${input.phoneE164 ?? null},
            ${input.countryIso2 ?? null})
    ON CONFLICT (lower(email_normalised)) WHERE redacted = false DO NOTHING
    RETURNING id`,
  );
  if (inserted !== undefined) {
    return { customerId: IdRow.parse(inserted).id, created: true };
  }
  const [existing] = await rows(
    db,
    sql`
    SELECT id FROM customer
    WHERE lower(email_normalised) = ${email} AND redacted = false`,
  );
  return { customerId: IdRow.parse(existing).id, created: false };
}

export interface CreatedRecipient {
  readonly recipientId: string;
  readonly addressId: string;
  readonly created: boolean;
}

const RecipientRow = z.object({ id: z.uuid(), full_name: z.string() });

export async function createRecipient(
  db: SqlRunner,
  raw: RecipientInput,
): Promise<CreatedRecipient> {
  const input = RecipientInputSchema.parse(raw);
  const wanted = normaliseFullName(input.fullName);
  const candidates = await rows(
    db,
    sql`
    SELECT id, full_name FROM recipient
    WHERE customer_id = ${input.customerId} AND phone_e164 = ${input.phoneE164}
      AND contact_redacted = false
    ORDER BY created_at, id
    FOR UPDATE`,
  );
  const match = candidates
    .map((row) => RecipientRow.parse(row))
    .find((row) => normaliseFullName(row.full_name) === wanted);

  let recipientId: string;
  if (match === undefined) {
    const [inserted] = await rows(
      db,
      sql`
      INSERT INTO recipient (customer_id, full_name, phone_e164)
      VALUES (${input.customerId}, ${input.fullName.normalize("NFC").trim()},
              ${input.phoneE164})
      RETURNING id`,
    );
    recipientId = IdRow.parse(inserted).id;
  } else {
    recipientId = match.id;
  }

  const address = input.address;
  const lines = sql`ARRAY[${sql.join(
    address.lines.map((line) => sql`${line}`),
    sql`, `,
  )}]::text[]`;
  const [same] = await rows(
    db,
    sql`
    SELECT id FROM recipient_address
    WHERE recipient_id = ${recipientId} AND lines = ${lines}
      AND postal_code IS NOT DISTINCT FROM ${address.postalCode ?? null}
      AND city = ${address.city} AND country_id = ${address.countryId}
      AND delivery_note IS NOT DISTINCT FROM ${address.deliveryNote ?? null}
      AND place_kind IS NOT DISTINCT FROM ${address.placeKind ?? null}
    LIMIT 1`,
  );
  if (same !== undefined) {
    return {
      recipientId,
      addressId: IdRow.parse(same).id,
      created: match === undefined,
    };
  }
  const [addressRow] = await rows(
    db,
    sql`
    INSERT INTO recipient_address (recipient_id, lines, postal_code, city, country_id,
                                   postcode_zone_id, delivery_note, place_kind)
    VALUES (${recipientId}, ${lines}, ${address.postalCode ?? null}, ${address.city},
            ${address.countryId}, ${address.postcodeZoneId ?? null},
            ${address.deliveryNote ?? null}, ${address.placeKind ?? null})
    RETURNING id`,
  );
  return {
    recipientId,
    addressId: IdRow.parse(addressRow).id,
    created: match === undefined,
  };
}
