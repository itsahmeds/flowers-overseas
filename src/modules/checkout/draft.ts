/**
 * The checkout draft service (spec 010 §5.1 B, §5.2 `draft.ts`, §8, AC-6, AC-13, AC-17;
 * TASK-203): `createDraft`, `loadDraft`, `saveStep`, `expireDrafts`.
 *
 * A draft is an unfinished checkout kept on the server between its three steps. The buyer's
 * browser holds only the `fo_checkout` token (`cookie.ts`); this service finds the row by the
 * token's SHA-256 and never stores, returns or logs the token itself.
 *
 * Every function runs inside one transaction: the caller's (`{ db }`, the Drizzle handle of
 * `withSystemContext`; `{ executor }`, the raw seam the integration suite drives), or a `system`
 * transaction of its own when it is given neither. The table's only RLS policy admits the
 * `system` role, so no other context can read a draft.
 *
 * Rules this file keeps:
 *
 *  - **24 hours after the last activity** (§2 "Retention"). Every save moves `last_activity_at`
 *    and `expires_at` together. A draft read at or past `expires_at` is deleted on the spot and
 *    answered as `expired`, so an expired draft holds no personal data from the moment anyone
 *    looks at it (AC-13); `expireDrafts()` is the sweep for the ones nobody looks at.
 *  - **A placed draft is read-only.** `saveStep` writes nothing once `order_id` is set (spec 010
 *    §14 AC-52): the order is the record from then on.
 *  - **Values are parsed on the way out.** Each JSON column is read back through its schema, so a
 *    row edited by hand surfaces as an error, never as a value the checkout trusts.
 */
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { DRAFT_LIFETIME_HOURS, PLACE_KINDS } from "@/config/checkout";
import { type CountryIso2, isCountryIso2 } from "@/config/countries";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import {
  type IntegerMoney,
  IntegerMoneySchema,
  type Quote,
  QuoteSchema,
} from "@/modules/catalog";
import { MoneySchema } from "@/modules/i18n";
import type { OrderExecutor, RawRow, SqlRunner } from "@/modules/orders";

import { draftTokenHash, isDraftToken, newDraftToken } from "./cookie";

/* -------------------------------------------------------------------------- */
/* The stored step values                                                      */
/* -------------------------------------------------------------------------- */

/** Step 1's values as stored (`RecipientStep` without the date, which has its own column). */
export const DraftRecipientSchema = z
  .object({
    fullName: z.string().min(1),
    phone: z
      .object({
        e164: z.string().regex(/^\+[1-9]\d{6,14}$/u),
        national: z.string(),
        nonLocal: z.boolean(),
      })
      .strict(),
    address: z.record(z.string(), z.string()),
    placeKind: z.enum(PLACE_KINDS),
    deliveryNote: z.string(),
  })
  .strict();
export type DraftRecipient = z.infer<typeof DraftRecipientSchema>;

/** Step 2's buyer half as stored. */
export const DraftBuyerSchema = z
  .object({
    email: z.string().min(1),
    buyerName: z.string().min(1),
    buyerPhone: z.string().nullable(),
    residenceCountry: z.string().regex(/^[A-Z]{2}$/u),
  })
  .strict();
export type DraftBuyer = z.infer<typeof DraftBuyerSchema>;

/** Step 2's card half as stored: `""` is "no card" (§2). */
export const DraftCardSchema = z
  .object({ cardMessage: z.string(), signAs: z.string() })
  .strict();
export type DraftCard = z.infer<typeof DraftCardSchema>;

/** The modes a draft can be started in: `closed` never starts one. */
export const draftModes = ["demo", "test", "live"] as const;
export type DraftMode = (typeof draftModes)[number];

/** How many of the three steps are saved, in order (0 to 3). */
export type StepsCompleted = 0 | 1 | 2 | 3;

/** A draft as the checkout reads it. Never carries the token. */
export interface Draft {
  readonly id: string;
  readonly locale: LocaleCode;
  readonly countryIso: CountryIso2;
  readonly sku: string;
  readonly tierKey: string;
  readonly deliveryDate: string | null;
  readonly addonKeys: readonly string[];
  readonly recipient: DraftRecipient | null;
  readonly buyer: DraftBuyer | null;
  readonly card: DraftCard | null;
  /** The signed quote of spec 005 every amount on every step is read from. */
  readonly quote: Quote | null;
  /** The total the product page displayed when the checkout started. */
  readonly expected: IntegerMoney | null;
  /** The last total the buyer saw and accepted; differs from the quote while a notice is open. */
  readonly confirmed: IntegerMoney | null;
  readonly mode: DraftMode;
  readonly stepsCompleted: StepsCompleted;
  readonly orderId: string | null;
  readonly lastActivityAt: Date;
  readonly expiresAt: Date;
  /**
   * The quote's `digest` exactly as stored, read straight from the row, so the save's
   * compare-and-set matches a stored quote even when it no longer parses (`quote` is then `null`
   * and the draft restarts at step 1, AC-17; `/break 275` round 2 hole 16).
   */
  readonly quoteStamp: string | null;
}

/* -------------------------------------------------------------------------- */
/* Connection                                                                  */
/* -------------------------------------------------------------------------- */

/** Where a draft function runs: the caller's transaction, a raw executor (tests), or its own. */
export interface DraftConnection {
  readonly db?: SqlRunner;
  readonly executor?: OrderExecutor;
}

async function withConnection<T>(
  connection: DraftConnection | undefined,
  fn: (executor: OrderExecutor) => Promise<T>,
): Promise<T> {
  if (connection?.executor !== undefined) return fn(connection.executor);
  const fromDb = (db: SqlRunner): OrderExecutor => ({
    async execute(query: SQL): Promise<readonly RawRow[]> {
      const rows: unknown = await db.execute(query);
      return rows as readonly RawRow[];
    },
  });
  if (connection?.db !== undefined) return fn(fromDb(connection.db));
  const { withSystemContext } = await import("@/lib/db");
  return withSystemContext("checkout", (db) => fn(fromDb(db)));
}

/* -------------------------------------------------------------------------- */
/* Row parsing                                                                 */
/* -------------------------------------------------------------------------- */

const MS_PER_HOUR = 3_600_000;

/** `expires_at` for activity at `now`. */
export function draftExpiryAt(now: Date): Date {
  return new Date(now.getTime() + DRAFT_LIFETIME_HOURS * MS_PER_HOUR);
}

/** A `bigint` column, which the driver returns as a decimal string. */
const MinorColumn = z
  .union([z.string().regex(/^\d{1,15}$/u), z.number().int().nonnegative()])
  .transform(Number)
  .nullable();

const EpochMsColumn = z
  .union([z.string().regex(/^\d{1,16}$/u), z.number().int().nonnegative()])
  .transform((value) => new Date(Number(value)));

const CurrencyColumn = MoneySchema.shape.currency.nullable();

const DraftRowSchema = z.object({
  id: z.uuid(),
  locale_code: z.string().refine(isLocaleCode),
  iso2: z.string().refine(isCountryIso2),
  sku: z.string().min(1),
  tier_key: z.string().min(1),
  delivery_date: z.iso.date().nullable(),
  addon_keys: z.array(z.string()),
  recipient: DraftRecipientSchema.nullable(),
  buyer: DraftBuyerSchema.nullable(),
  card: DraftCardSchema.nullable(),
  quote: z.unknown().nullable(),
  expected_total_minor: MinorColumn,
  expected_currency_code: CurrencyColumn,
  confirmed_total_minor: MinorColumn,
  confirmed_currency_code: CurrencyColumn,
  mode: z.enum(draftModes),
  steps_completed: z.coerce.number().int().min(0).max(3),
  order_id: z.uuid().nullable(),
  last_activity_ms: EpochMsColumn,
  expires_ms: EpochMsColumn,
  quote_stamp: z.string().nullable(),
});

function money(
  amountMinor: number | null,
  currency: IntegerMoney["currency"] | null,
): IntegerMoney | null {
  return amountMinor === null || currency === null
    ? null
    : IntegerMoneySchema.parse({ amountMinor, currency });
}

/**
 * A stored quote that no longer parses is kept as `null` here and answered by the pricing layer as
 * `tampered` (§2: the quote is discarded and the draft restarts at step 1); it is never a throw
 * that would strand the buyer on an error page.
 */
function toDraft(raw: RawRow): Draft {
  const row = DraftRowSchema.parse(raw);
  const quote = row.quote === null ? null : QuoteSchema.safeParse(row.quote);
  return {
    id: row.id,
    locale: row.locale_code as LocaleCode,
    countryIso: row.iso2 as CountryIso2,
    sku: row.sku,
    tierKey: row.tier_key,
    deliveryDate: row.delivery_date,
    addonKeys: row.addon_keys,
    recipient: row.recipient,
    buyer: row.buyer,
    card: row.card,
    quote: quote === null || !quote.success ? null : quote.data,
    expected: money(row.expected_total_minor, row.expected_currency_code),
    confirmed: money(row.confirmed_total_minor, row.confirmed_currency_code),
    mode: row.mode,
    stepsCompleted: row.steps_completed as StepsCompleted,
    orderId: row.order_id,
    lastActivityAt: row.last_activity_ms,
    expiresAt: row.expires_ms,
    quoteStamp: row.quote_stamp,
  };
}

/** The columns every read selects, dates as epoch milliseconds so no driver parser decides them. */
const DRAFT_COLUMNS = sql`
  d.id, d.locale_code, c.iso2, p.sku, d.tier_key, d.delivery_date::text AS delivery_date,
  d.addon_keys, d.recipient, d.buyer, d.card, d.quote,
  d.expected_total_minor::text AS expected_total_minor, d.expected_currency_code,
  d.confirmed_total_minor::text AS confirmed_total_minor, d.confirmed_currency_code,
  d.mode, d.steps_completed, d.order_id,
  (extract(epoch FROM d.last_activity_at) * 1000)::bigint::text AS last_activity_ms,
  (extract(epoch FROM d.expires_at) * 1000)::bigint::text AS expires_ms,
  d.quote ->> 'digest' AS quote_stamp`;

/** `ARRAY[$1, …]::text[]`: Drizzle expands a bare array parameter into a list. */
function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** A JSON value bound as text and cast, so no driver serialiser encodes it twice. */
function jsonb(value: unknown): SQL {
  return value === null
    ? sql`NULL`
    : sql`(${JSON.stringify(value)}::text)::jsonb`;
}

function timestamptz(at: Date): SQL {
  return sql`${at.toISOString()}::timestamptz`;
}

/* -------------------------------------------------------------------------- */
/* createDraft                                                                 */
/* -------------------------------------------------------------------------- */

export const CreateDraftInputSchema = z
  .object({
    locale: z.string().refine(isLocaleCode),
    countryIso: z.string().refine(isCountryIso2),
    sku: z.string().min(1),
    tierKey: z.string().min(1).max(64),
    deliveryDate: z.iso.date().nullable(),
    mode: z.enum(draftModes),
    quote: QuoteSchema,
    expected: z
      .object({
        amountMinor: z.number().int().nonnegative(),
        currency: MoneySchema.shape.currency,
      })
      .strict(),
    confirmed: z
      .object({
        amountMinor: z.number().int().nonnegative(),
        currency: MoneySchema.shape.currency,
      })
      .strict(),
    now: z.date(),
  })
  .strict();
export type CreateDraftInput = z.input<typeof CreateDraftInputSchema>;

/**
 * Starts a draft (AC-6): one row, a fresh 256-bit token, its hash stored. The product and the
 * destination are resolved by their natural keys (`product.sku`, `country.iso2`); when either has
 * no row the answer is `null`, nothing is written, and the start route sends the buyer back to the
 * product page (fail closed: a SKU the database does not know cannot become an order, AC-28).
 *
 * Returns the token **once**, for the `Set-Cookie`; nothing stores it.
 */
export async function createDraft(
  input: CreateDraftInput,
  connection?: DraftConnection,
): Promise<{ readonly draftId: string; readonly token: string } | null> {
  const value = CreateDraftInputSchema.parse(input);
  const token = newDraftToken();
  return withConnection(connection, async (executor) => {
    const rows = await executor.execute(sql`
      INSERT INTO checkout_draft (
        token_sha256, locale_code, destination_country_id, product_id, tier_key, delivery_date,
        quote, expected_total_minor, expected_currency_code,
        confirmed_total_minor, confirmed_currency_code, mode,
        last_activity_at, expires_at)
      SELECT ${draftTokenHash(token)}, ${value.locale}, c.id, p.id, ${value.tierKey},
             ${value.deliveryDate}::date, ${jsonb(value.quote)},
             ${value.expected.amountMinor}, ${value.expected.currency},
             ${value.confirmed.amountMinor}, ${value.confirmed.currency}, ${value.mode},
             ${timestamptz(value.now)}, ${timestamptz(draftExpiryAt(value.now))}
        FROM country c, product p
       WHERE c.iso2 = ${value.countryIso} AND p.sku = ${value.sku}
      RETURNING id`);
    const id = z.object({ id: z.uuid() }).optional().parse(rows[0])?.id;
    return id === undefined ? null : { draftId: id, token };
  });
}

/* -------------------------------------------------------------------------- */
/* loadDraft                                                                   */
/* -------------------------------------------------------------------------- */

/** What a cookie leads to. */
export type DraftLookup =
  | { readonly status: "missing" }
  | { readonly status: "expired" }
  | { readonly status: "active"; readonly draft: Draft };

/**
 * The draft a cookie's token names (AC-13). `missing` for no token, a malformed one or no row;
 * `expired` — after deleting the row — when `now` is at or past `expires_at`; otherwise `active`,
 * placed drafts included (`draft.orderId` set), which the caller answers with the confirmation.
 */
export async function loadDraft(
  token: string | null,
  now: Date,
  connection?: DraftConnection,
): Promise<DraftLookup> {
  if (!isDraftToken(token)) return { status: "missing" };
  return withConnection(connection, async (executor) => {
    const rows = await executor.execute(sql`
      SELECT ${DRAFT_COLUMNS}
        FROM checkout_draft d
        JOIN country c ON c.id = d.destination_country_id
        JOIN product p ON p.id = d.product_id
       WHERE d.token_sha256 = ${draftTokenHash(token)}`);
    const row = rows[0];
    if (row === undefined) return { status: "missing" };
    const draft = toDraft(row);
    if (now.getTime() >= draft.expiresAt.getTime()) {
      await executor.execute(
        sql`DELETE FROM checkout_draft WHERE id = ${draft.id}`,
      );
      return { status: "expired" };
    }
    return { status: "active", draft };
  });
}

/* -------------------------------------------------------------------------- */
/* saveStep                                                                    */
/* -------------------------------------------------------------------------- */

const MoneyPatchSchema = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: MoneySchema.shape.currency,
  })
  .strict();

/** What a step may change. Absent keys are left as they are. */
export const DraftPatchSchema = z
  .object({
    locale: z.string().refine(isLocaleCode).optional(),
    tierKey: z.string().min(1).max(64).optional(),
    deliveryDate: z.iso.date().nullable().optional(),
    addonKeys: z.array(z.string().min(1)).optional(),
    recipient: DraftRecipientSchema.nullable().optional(),
    buyer: DraftBuyerSchema.nullable().optional(),
    card: DraftCardSchema.nullable().optional(),
    quote: QuoteSchema.optional(),
    confirmed: MoneyPatchSchema.optional(),
    stepsCompleted: z.number().int().min(0).max(3).optional(),
  })
  .strict();
export type DraftPatch = z.input<typeof DraftPatchSchema>;

/**
 * Saves a step's changes and moves the 24-hour window (AC-13). Returns `false`, writing nothing,
 * when the draft is gone or already placed (AC-52), or — given `ifUnchanged`, the draft as the
 * caller loaded it — when another request has changed its selection, quote or last-seen total
 * since.
 */
export async function saveStep(
  draftId: string,
  patch: DraftPatch,
  now: Date,
  connection?: DraftConnection,
  ifUnchanged?: Draft,
): Promise<boolean> {
  const id = z.uuid().parse(draftId);
  const value = DraftPatchSchema.parse(patch);
  const sets: SQL[] = [];
  if (value.locale !== undefined) sets.push(sql`locale_code = ${value.locale}`);
  if (value.tierKey !== undefined) sets.push(sql`tier_key = ${value.tierKey}`);
  if (value.deliveryDate !== undefined) {
    sets.push(sql`delivery_date = ${value.deliveryDate}::date`);
  }
  if (value.addonKeys !== undefined) {
    sets.push(sql`addon_keys = ${textArray(value.addonKeys)}`);
  }
  if (value.recipient !== undefined) {
    sets.push(sql`recipient = ${jsonb(value.recipient)}`);
  }
  if (value.buyer !== undefined) sets.push(sql`buyer = ${jsonb(value.buyer)}`);
  if (value.card !== undefined) sets.push(sql`card = ${jsonb(value.card)}`);
  if (value.quote !== undefined) sets.push(sql`quote = ${jsonb(value.quote)}`);
  if (value.confirmed !== undefined) {
    sets.push(
      sql`confirmed_total_minor = ${value.confirmed.amountMinor}`,
      sql`confirmed_currency_code = ${value.confirmed.currency}`,
    );
  }
  if (value.stepsCompleted !== undefined) {
    sets.push(sql`steps_completed = ${value.stepsCompleted}`);
  }
  sets.push(
    sql`last_activity_at = ${timestamptz(now)}`,
    sql`expires_at = ${timestamptz(draftExpiryAt(now))}`,
  );
  return withConnection(connection, async (executor) => {
    const rows = await executor.execute(sql`
      UPDATE checkout_draft SET ${sql.join(sets, sql`, `)}
       WHERE id = ${id} AND order_id IS NULL${ifUnchanged === undefined ? sql`` : unchangedSince(ifUnchanged)}
      RETURNING id`);
    return rows.length === 1;
  });
}

/**
 * The compare half of a compare-and-set (`/review 275` change 1, `/break 275` hole 1): the row
 * still has the selection, the quote and the last-seen total the runner priced from. A runner
 * that loaded the draft before another request changed any of them writes nothing, so a quote
 * priced for one size or add-on set can never be saved over another's.
 */
function unchangedSince(loaded: Draft): SQL {
  return sql` AND tier_key = ${loaded.tierKey}
    AND delivery_date IS NOT DISTINCT FROM ${loaded.deliveryDate}::date
    AND addon_keys = ${textArray(loaded.addonKeys)}
    AND (quote ->> 'digest') IS NOT DISTINCT FROM ${loaded.quoteStamp}::text
    AND confirmed_total_minor IS NOT DISTINCT FROM ${loaded.confirmed?.amountMinor ?? null}::bigint
    AND confirmed_currency_code IS NOT DISTINCT FROM ${loaded.confirmed?.currency ?? null}::text`;
}

/* -------------------------------------------------------------------------- */
/* expireDrafts                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Deletes every draft at or past its `expires_at` and returns how many (§2 "Retention": drafts
 * are deleted 24 hours after the last activity in every environment). Spec 002's
 * `retention.sweep` calls it for the `checkout_draft` row (TASK-207 wires the handler).
 */
export async function expireDrafts(
  now: Date,
  connection?: DraftConnection,
): Promise<number> {
  return withConnection(connection, async (executor) => {
    const rows = await executor.execute(sql`
      DELETE FROM checkout_draft WHERE expires_at <= ${timestamptz(now)} RETURNING id`);
    return rows.length;
  });
}
