/**
 * The checkout draft service: a basket of lines (spec 010 §5.1 B, §5.2 `draft.ts`, §8; §14
 * A-founder-2026-10-22 items 1 D3 to D8, 2 B and 4; AC-6, AC-13, AC-54, AC-55; TASK-203,
 * TASK-348): `createDraft`, `loadDraft`, `appendLine`, `saveLine`, `saveDraft`, `removeLine`,
 * `expireDrafts`.
 *
 * A draft is the basket: the basket-level fields (locale, mode, the basket's currency set by its
 * first line, the buyer, a pending notice) and one to `BASKET_MAX_LINES` lines, each one bouquet
 * for one recipient on one date in one destination, with its own add-ons, card, signed quote and
 * the amount the buyer last saw for it. The buyer's browser holds only the `fo_checkout` token
 * (`cookie.ts`); this service finds the row by the token's SHA-256 and never stores, returns or
 * logs the token itself.
 *
 * Every function runs inside one transaction: the caller's (`{ db }`, the Drizzle handle of
 * `withSystemContext`; `{ executor }`, the raw seam the integration suite drives), or a `system`
 * transaction of its own when it is given neither. The tables' only RLS policy admits the
 * `system` role, so no other context can read a draft or a line.
 *
 * Rules this file keeps:
 *
 *  - **30 days after the last change** (D7). Every save moves `last_activity_at` and
 *    `expires_at` together. A draft read at or past `expires_at` is deleted on the spot (its lines
 *    with it) and answered as `expired`; `expireDrafts()` is the sweep for the ones nobody reads.
 *    The buyer's, recipients' and cards' details are cleared after 24 hours by the retention row
 *    `checkout_draft_personal` (TASK-207's handler).
 *  - **A placed draft is read-only.** Nothing here writes once `purchase_id` is set (AC-52).
 *  - **Positions have no gap.** An append takes the draft's row lock (`FOR UPDATE`) and the next
 *    position under it, so two concurrent appends get consecutive positions, never the same one
 *    (AC-54); the `BASKET_MAX_LINES + 1`th is refused under the same lock (AC-55); a removal
 *    renumbers the rest, lowest first.
 *  - **Per-line compare-and-set.** A line save given the line as the caller loaded it writes
 *    nothing when another request changed that line's selection, quote or last-seen amount since
 *    (TASK-203 hole 17, extended to every line action). The line is written first and is the
 *    gate: the draft half of a save runs only when the line's did.
 *  - **Values are parsed on the way out.** Each JSON column is read back through its schema, so a
 *    row edited by hand surfaces as an error, never as a value the checkout trusts.
 */
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  BASKET_LIFETIME_DAYS,
  BASKET_MAX_LINES,
  PLACE_KINDS,
} from "@/config/checkout";
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

/** Step 2's buyer half as stored (on the draft: one buyer per basket). */
export const DraftBuyerSchema = z
  .object({
    email: z.string().min(1),
    buyerName: z.string().min(1),
    buyerPhone: z.string().nullable(),
    residenceCountry: z.string().regex(/^[A-Z]{2}$/u),
  })
  .strict();
export type DraftBuyer = z.infer<typeof DraftBuyerSchema>;

/** Step 2's card half as stored (on the line): `""` is "no card" (§2). */
export const DraftCardSchema = z
  .object({ cardMessage: z.string(), signAs: z.string() })
  .strict();
export type DraftCard = z.infer<typeof DraftCardSchema>;

/** The modes a draft can be started in: `closed` never starts one. */
export const draftModes = ["demo", "test", "live"] as const;
export type DraftMode = (typeof draftModes)[number];

/**
 * What the start route leaves for the next basket render (item 4): never a query string. `added`
 * after an "Add to basket"; `full` at `BASKET_MAX_LINES`; `other_mode` for a destination whose
 * mode differs from the basket's; `other_currency` for a line the provider cannot price in the
 * basket's currency.
 */
export const pendingNotices = [
  "added",
  "full",
  "other_mode",
  "other_currency",
] as const;
export type PendingNotice = (typeof pendingNotices)[number];

/** How many of a line's own two screens are saved, in order: 1 = step 1, 2 = step 2. */
export type LineStepsCompleted = 0 | 1 | 2;

/** One basket line as the checkout reads it. */
export interface BasketLine {
  readonly id: string;
  /** 1 to `BASKET_MAX_LINES`, no gap. */
  readonly position: number;
  readonly countryIso: CountryIso2;
  readonly sku: string;
  readonly tierKey: string;
  readonly deliveryDate: string | null;
  readonly addonKeys: readonly string[];
  readonly recipient: DraftRecipient | null;
  readonly card: DraftCard | null;
  /** The signed quote of spec 005 the line's amount is read from, in the basket's currency. */
  readonly quote: Quote | null;
  /** The amount the buyer last saw for this line, in whatever currency it was shown. */
  readonly lastSeen: IntegerMoney | null;
  readonly stepsCompleted: LineStepsCompleted;
  readonly orderId: string | null;
  /**
   * The quote's `digest` exactly as stored, read straight from the row, so the save's
   * compare-and-set matches a stored quote even when it no longer parses (`/break 275` round 2
   * hole 16).
   */
  readonly quoteStamp: string | null;
}

/** A draft as the checkout reads it. Never carries the token. */
export interface Draft {
  readonly id: string;
  readonly locale: LocaleCode;
  readonly mode: DraftMode;
  /** The basket's currency, set by its first line; `null` only for a draft from before `0020`. */
  readonly currency: IntegerMoney["currency"] | null;
  readonly buyer: DraftBuyer | null;
  readonly buyerSaved: boolean;
  /** The total the product page displayed when the basket started. */
  readonly expected: IntegerMoney | null;
  /** The basket total the buyer last confirmed (`confirmPrice`). */
  readonly confirmed: IntegerMoney | null;
  readonly pendingNotice: PendingNotice | null;
  readonly purchaseId: string | null;
  readonly lastActivityAt: Date;
  readonly expiresAt: Date;
  /** In position order. */
  readonly lines: readonly BasketLine[];
}

/* -------------------------------------------------------------------------- */
/* Connection                                                                  */
/* -------------------------------------------------------------------------- */

/** Where a draft function runs: the caller's transaction, a raw executor (tests), or its own. */
export interface DraftConnection {
  readonly db?: SqlRunner;
  readonly executor?: OrderExecutor;
}

/** Runs `fn` in the caller's transaction, or in a `system` transaction of its own. */
export async function withDraftConnection<T>(
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

const MS_PER_DAY = 86_400_000;

/** `expires_at` for activity at `now`: 30 days later (D7). */
export function draftExpiryAt(now: Date): Date {
  return new Date(now.getTime() + BASKET_LIFETIME_DAYS * MS_PER_DAY);
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
  mode: z.enum(draftModes),
  currency_code: CurrencyColumn,
  buyer: DraftBuyerSchema.nullable(),
  buyer_saved: z.boolean(),
  expected_total_minor: MinorColumn,
  expected_currency_code: CurrencyColumn,
  confirmed_total_minor: MinorColumn,
  confirmed_currency_code: CurrencyColumn,
  pending_notice: z.enum(pendingNotices).nullable(),
  purchase_id: z.uuid().nullable(),
  last_activity_ms: EpochMsColumn,
  expires_ms: EpochMsColumn,
});

const LineRowSchema = z.object({
  id: z.uuid(),
  position: z.coerce.number().int().min(1).max(BASKET_MAX_LINES),
  iso2: z.string().refine(isCountryIso2),
  sku: z.string().min(1),
  tier_key: z.string().min(1),
  delivery_date: z.iso.date().nullable(),
  addon_keys: z.array(z.string()),
  recipient: DraftRecipientSchema.nullable(),
  card: DraftCardSchema.nullable(),
  quote: z.unknown().nullable(),
  last_seen_total_minor: MinorColumn,
  last_seen_currency_code: CurrencyColumn,
  steps_completed: z.coerce.number().int().min(0).max(2),
  order_id: z.uuid().nullable(),
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
 * `tampered` (§2: the quote is discarded and the line restarts at step 1); it is never a throw
 * that would strand the buyer on an error page.
 */
function toLine(raw: RawRow): BasketLine {
  const row = LineRowSchema.parse(raw);
  const quote = row.quote === null ? null : QuoteSchema.safeParse(row.quote);
  return {
    id: row.id,
    position: row.position,
    countryIso: row.iso2 as CountryIso2,
    sku: row.sku,
    tierKey: row.tier_key,
    deliveryDate: row.delivery_date,
    addonKeys: row.addon_keys,
    recipient: row.recipient,
    card: row.card,
    quote: quote === null || !quote.success ? null : quote.data,
    lastSeen: money(row.last_seen_total_minor, row.last_seen_currency_code),
    stepsCompleted: row.steps_completed as LineStepsCompleted,
    orderId: row.order_id,
    quoteStamp: row.quote_stamp,
  };
}

function toDraft(
  row: z.output<typeof DraftRowSchema>,
  lines: readonly BasketLine[],
): Draft {
  return {
    id: row.id,
    locale: row.locale_code as LocaleCode,
    mode: row.mode,
    currency: row.currency_code,
    buyer: row.buyer,
    buyerSaved: row.buyer_saved,
    expected: money(row.expected_total_minor, row.expected_currency_code),
    confirmed: money(row.confirmed_total_minor, row.confirmed_currency_code),
    pendingNotice: row.pending_notice,
    purchaseId: row.purchase_id,
    lastActivityAt: row.last_activity_ms,
    expiresAt: row.expires_ms,
    lines,
  };
}

/** The draft columns every read selects, dates as epoch milliseconds so no driver parser decides them. */
const DRAFT_COLUMNS = sql`
  d.id, d.locale_code, d.mode, d.currency_code, d.buyer, d.buyer_saved,
  d.expected_total_minor::text AS expected_total_minor, d.expected_currency_code,
  d.confirmed_total_minor::text AS confirmed_total_minor, d.confirmed_currency_code,
  d.pending_notice, d.purchase_id,
  (extract(epoch FROM d.last_activity_at) * 1000)::bigint::text AS last_activity_ms,
  (extract(epoch FROM d.expires_at) * 1000)::bigint::text AS expires_ms`;

const LINE_COLUMNS = sql`
  l.id, l.position, c.iso2, p.sku, l.tier_key, l.delivery_date::text AS delivery_date,
  l.addon_keys, l.recipient, l.card, l.quote,
  l.last_seen_total_minor::text AS last_seen_total_minor, l.last_seen_currency_code,
  l.steps_completed, l.order_id, l.quote ->> 'digest' AS quote_stamp`;

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

async function linesOf(
  executor: OrderExecutor,
  draftId: string,
): Promise<BasketLine[]> {
  const rows = await executor.execute(sql`
    SELECT ${LINE_COLUMNS}
      FROM checkout_draft_line l
      JOIN country c ON c.id = l.destination_country_id
      JOIN product p ON p.id = l.product_id
     WHERE l.draft_id = ${draftId}
     ORDER BY l.position`);
  return rows.map(toLine);
}

/* -------------------------------------------------------------------------- */
/* New lines                                                                   */
/* -------------------------------------------------------------------------- */

const AmountSchema = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: MoneySchema.shape.currency,
  })
  .strict();

/** A line as the start route adds it: the product page's selection, priced. */
export const NewLineSchema = z
  .object({
    countryIso: z.string().refine(isCountryIso2),
    sku: z.string().min(1),
    tierKey: z.string().min(1).max(64),
    deliveryDate: z.iso.date().nullable(),
    /** Priced in the basket's currency. */
    quote: QuoteSchema,
    /** What the product page displayed for it (AC-6: the notice compares the two). */
    lastSeen: AmountSchema,
  })
  .strict();
export type NewLine = z.input<typeof NewLineSchema>;

/* -------------------------------------------------------------------------- */
/* createDraft                                                                 */
/* -------------------------------------------------------------------------- */

export const CreateDraftInputSchema = z
  .object({
    locale: z.string().refine(isLocaleCode),
    mode: z.enum(draftModes),
    line: NewLineSchema,
    expected: AmountSchema,
    pendingNotice: z.enum(pendingNotices).nullable().default(null),
    now: z.date(),
  })
  .strict();
export type CreateDraftInput = z.input<typeof CreateDraftInputSchema>;

/**
 * Starts a basket with its first line (AC-6): one draft row, one line at position 1, a fresh
 * 256-bit token whose hash is stored. The basket's currency is the line's quote's. The product and
 * the destination are resolved by their natural keys (`product.sku`, `country.iso2`); when either
 * has no row the answer is `null` and nothing is written (one statement: the draft is inserted
 * only when the line can be), so the start route sends the buyer back to the product page (fail
 * closed: a SKU the database does not know cannot become an order, AC-28).
 *
 * Returns the token **once**, for the `Set-Cookie`; nothing stores it.
 */
export async function createDraft(
  input: CreateDraftInput,
  connection?: DraftConnection,
): Promise<{ readonly draftId: string; readonly token: string } | null> {
  const value = CreateDraftInputSchema.parse(input);
  const token = newDraftToken();
  return withDraftConnection(connection, async (executor) => {
    const rows = await executor.execute(sql`
      WITH keys AS (
        SELECT c.id AS country_id, p.id AS product_id
          FROM country c, product p
         WHERE c.iso2 = ${value.line.countryIso} AND p.sku = ${value.line.sku}
      ), draft AS (
        INSERT INTO checkout_draft (
          token_sha256, locale_code, mode, currency_code, expected_total_minor,
          expected_currency_code, confirmed_total_minor, confirmed_currency_code, pending_notice,
          last_activity_at, expires_at)
        SELECT ${draftTokenHash(token)}, ${value.locale}, ${value.mode},
               ${value.line.quote.currency}, ${value.expected.amountMinor},
               ${value.expected.currency}, ${value.expected.amountMinor},
               ${value.expected.currency}, ${value.pendingNotice},
               ${timestamptz(value.now)}, ${timestamptz(draftExpiryAt(value.now))}
          FROM keys
        RETURNING id
      )
      INSERT INTO checkout_draft_line (
        draft_id, position, destination_country_id, product_id, tier_key, delivery_date, quote,
        last_seen_total_minor, last_seen_currency_code)
      SELECT draft.id, 1, keys.country_id, keys.product_id, ${value.line.tierKey},
             ${value.line.deliveryDate}::date, ${jsonb(value.line.quote)},
             ${value.line.lastSeen.amountMinor}, ${value.line.lastSeen.currency}
        FROM draft, keys
      RETURNING draft_id`);
    const id = z
      .object({ draft_id: z.uuid() })
      .optional()
      .parse(rows[0])?.draft_id;
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
 * `expired`, after deleting the row and its lines, when `now` is at or past `expires_at`;
 * otherwise `active`, placed drafts included (`draft.purchaseId` set), which the caller answers
 * with the confirmation.
 */
export async function loadDraft(
  token: string | null,
  now: Date,
  connection?: DraftConnection,
): Promise<DraftLookup> {
  if (!isDraftToken(token)) return { status: "missing" };
  return withDraftConnection(connection, async (executor) => {
    const rows = await executor.execute(sql`
      SELECT ${DRAFT_COLUMNS}
        FROM checkout_draft d
       WHERE d.token_sha256 = ${draftTokenHash(token)}`);
    const raw = rows[0];
    if (raw === undefined) return { status: "missing" };
    const row = DraftRowSchema.parse(raw);
    if (now.getTime() >= row.expires_ms.getTime()) {
      await executor.execute(
        sql`DELETE FROM checkout_draft WHERE id = ${row.id}`,
      );
      return { status: "expired" };
    }
    return {
      status: "active",
      draft: toDraft(row, await linesOf(executor, row.id)),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* appendLine                                                                  */
/* -------------------------------------------------------------------------- */

export type AppendResult =
  | { readonly status: "appended"; readonly position: number }
  | { readonly status: "full" }
  | { readonly status: "placed" }
  | { readonly status: "missing" };

/**
 * Appends a line to an unplaced draft (item 4, AC-54, AC-55), under the draft's row lock: the
 * lock is taken first and the count and the next position are read under it, so two concurrent
 * appends serialise and get consecutive positions, and the `BASKET_MAX_LINES + 1`th is refused
 * (`full`, nothing written). `pendingNotice` is stored with the line, in the same transaction.
 * A product or destination missing from the database answers `missing`, nothing written.
 */
export async function appendLine(
  draftId: string,
  line: NewLine,
  now: Date,
  connection?: DraftConnection,
  pendingNotice: PendingNotice | null = null,
): Promise<AppendResult> {
  const id = z.uuid().parse(draftId);
  const value = NewLineSchema.parse(line);
  const notice = z.enum(pendingNotices).nullable().parse(pendingNotice);
  return withDraftConnection(connection, async (executor) => {
    const [locked] = await executor.execute(sql`
      SELECT purchase_id FROM checkout_draft WHERE id = ${id} FOR UPDATE`);
    if (locked === undefined) return { status: "missing" };
    const { purchase_id: purchaseId } = z
      .object({ purchase_id: z.uuid().nullable() })
      .parse(locked);
    if (purchaseId !== null) return { status: "placed" };
    const [counted] = await executor.execute(sql`
      SELECT count(*)::int AS lines, coalesce(max(position), 0)::int AS last
        FROM checkout_draft_line WHERE draft_id = ${id}`);
    const { lines, last } = z
      .object({ lines: z.number().int(), last: z.number().int() })
      .parse(counted);
    if (lines >= BASKET_MAX_LINES) return { status: "full" };
    const inserted = await executor.execute(sql`
      INSERT INTO checkout_draft_line (
        draft_id, position, destination_country_id, product_id, tier_key, delivery_date, quote,
        last_seen_total_minor, last_seen_currency_code)
      SELECT ${id}, ${last + 1}, c.id, p.id, ${value.tierKey}, ${value.deliveryDate}::date,
             ${jsonb(value.quote)}, ${value.lastSeen.amountMinor}, ${value.lastSeen.currency}
        FROM country c, product p
       WHERE c.iso2 = ${value.countryIso} AND p.sku = ${value.sku}
      RETURNING position`);
    if (inserted.length !== 1) return { status: "missing" };
    await executor.execute(sql`
      UPDATE checkout_draft
         SET pending_notice = ${notice}, ${sql.join(touch(now), sql`, `)}
       WHERE id = ${id}`);
    return { status: "appended", position: last + 1 };
  });
}

/* -------------------------------------------------------------------------- */
/* saveLine, saveDraft                                                         */
/* -------------------------------------------------------------------------- */

/** What a line action may change. Absent keys are left as they are. */
export const LinePatchSchema = z
  .object({
    tierKey: z.string().min(1).max(64).optional(),
    deliveryDate: z.iso.date().nullable().optional(),
    addonKeys: z.array(z.string().min(1)).optional(),
    recipient: DraftRecipientSchema.nullable().optional(),
    card: DraftCardSchema.nullable().optional(),
    quote: QuoteSchema.optional(),
    lastSeen: AmountSchema.optional(),
    stepsCompleted: z.number().int().min(0).max(2).optional(),
  })
  .strict();
export type LinePatch = z.input<typeof LinePatchSchema>;

/** What a draft-level save may change. */
export const DraftPatchSchema = z
  .object({
    locale: z.string().refine(isLocaleCode).optional(),
    buyer: DraftBuyerSchema.nullable().optional(),
    buyerSaved: z.boolean().optional(),
    confirmed: AmountSchema.optional(),
    pendingNotice: z.enum(pendingNotices).nullable().optional(),
  })
  .strict();
export type DraftPatch = z.input<typeof DraftPatchSchema>;

/** The activity stamp every save writes. */
function touch(now: Date): SQL[] {
  return [
    sql`last_activity_at = ${timestamptz(now)}`,
    sql`expires_at = ${timestamptz(draftExpiryAt(now))}`,
  ];
}

function draftSets(value: z.output<typeof DraftPatchSchema>): SQL[] {
  const sets: SQL[] = [];
  if (value.locale !== undefined) sets.push(sql`locale_code = ${value.locale}`);
  if (value.buyer !== undefined) sets.push(sql`buyer = ${jsonb(value.buyer)}`);
  if (value.buyerSaved !== undefined) {
    sets.push(sql`buyer_saved = ${value.buyerSaved}`);
  }
  if (value.confirmed !== undefined) {
    sets.push(
      sql`confirmed_total_minor = ${value.confirmed.amountMinor}`,
      sql`confirmed_currency_code = ${value.confirmed.currency}`,
    );
  }
  if (value.pendingNotice !== undefined) {
    sets.push(sql`pending_notice = ${value.pendingNotice}`);
  }
  return sets;
}

/**
 * Saves a draft-level change (the buyer, the confirmed basket total, the locale, the pending
 * notice) and moves the 30-day window. `false`, nothing written, when the draft is gone or placed.
 */
export async function saveDraft(
  draftId: string,
  patch: DraftPatch,
  now: Date,
  connection?: DraftConnection,
): Promise<boolean> {
  const id = z.uuid().parse(draftId);
  const value = DraftPatchSchema.parse(patch);
  return withDraftConnection(connection, async (executor) => {
    const rows = await executor.execute(sql`
      UPDATE checkout_draft SET ${sql.join([...draftSets(value), ...touch(now)], sql`, `)}
       WHERE id = ${id} AND purchase_id IS NULL
      RETURNING id`);
    return rows.length === 1;
  });
}

/**
 * Saves one line's changes and the draft-level ones beside them (AC-13). The line is written
 * first, under the compare-and-set when `ifUnchanged` (the line as the caller loaded it) is given,
 * and only on an unplaced draft; the draft half (and the 30-day window) is written only when the
 * line's was. Returns `false`, writing nothing, when the draft is gone or placed, the position
 * has no line, or another request has changed that line's selection, quote or last-seen amount
 * since it was loaded.
 */
export async function saveLine(
  draftId: string,
  position: number,
  patch: LinePatch,
  now: Date,
  connection?: DraftConnection,
  ifUnchanged?: BasketLine,
  draftPatch: DraftPatch = {},
): Promise<boolean> {
  const id = z.uuid().parse(draftId);
  const at = z.number().int().min(1).max(BASKET_MAX_LINES).parse(position);
  const value = LinePatchSchema.parse(patch);
  const draftValue = DraftPatchSchema.parse(draftPatch);
  const sets: SQL[] = [];
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
  if (value.card !== undefined) sets.push(sql`card = ${jsonb(value.card)}`);
  if (value.quote !== undefined) sets.push(sql`quote = ${jsonb(value.quote)}`);
  if (value.lastSeen !== undefined) {
    sets.push(
      sql`last_seen_total_minor = ${value.lastSeen.amountMinor}`,
      sql`last_seen_currency_code = ${value.lastSeen.currency}`,
    );
  }
  if (value.stepsCompleted !== undefined) {
    sets.push(sql`steps_completed = ${value.stepsCompleted}`);
  }
  // An empty patch still proves the line is there and unchanged before the draft half runs.
  if (sets.length === 0) sets.push(sql`position = position`);
  return withDraftConnection(connection, async (executor) => {
    const rows = await executor.execute(sql`
      UPDATE checkout_draft_line l SET ${sql.join(sets, sql`, `)}
       WHERE l.draft_id = ${id} AND l.position = ${at}
         AND EXISTS (SELECT 1 FROM checkout_draft d
                      WHERE d.id = l.draft_id AND d.purchase_id IS NULL)${ifUnchanged === undefined ? sql`` : lineUnchangedSince(ifUnchanged)}
      RETURNING l.id`);
    if (rows.length !== 1) return false;
    await executor.execute(sql`
      UPDATE checkout_draft SET ${sql.join([...draftSets(draftValue), ...touch(now)], sql`, `)}
       WHERE id = ${id}`);
    return true;
  });
}

/**
 * The compare half of a per-line compare-and-set (TASK-203 `/review 275` change 1, `/break 275`
 * holes 1 and 17): the line is still the one the runner loaded (its id), with the selection, the
 * quote and the last-seen amount the runner priced from. A runner that loaded the basket before
 * another request changed any of them writes nothing, so a quote priced for one size or add-on
 * set can never be saved over another's, and a removal that renumbered the lines can never make
 * an action land on the wrong one.
 */
function lineUnchangedSince(loaded: BasketLine): SQL {
  return sql` AND l.id = ${loaded.id}
    AND l.tier_key = ${loaded.tierKey}
    AND l.delivery_date IS NOT DISTINCT FROM ${loaded.deliveryDate}::date
    AND l.addon_keys = ${textArray(loaded.addonKeys)}
    AND (l.quote ->> 'digest') IS NOT DISTINCT FROM ${loaded.quoteStamp}::text
    AND l.last_seen_total_minor IS NOT DISTINCT FROM ${loaded.lastSeen?.amountMinor ?? null}::bigint
    AND l.last_seen_currency_code IS NOT DISTINCT FROM ${loaded.lastSeen?.currency ?? null}::text`;
}

/* -------------------------------------------------------------------------- */
/* removeLine                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Deletes the line at `position` of an unplaced draft and renumbers the rest, lowest first, so
 * positions stay 1 to n with no gap. Under the draft's row lock. With `ifUnchanged`, the line must
 * still be the one the caller saw (its id), or nothing is deleted. Returns the number of lines
 * left, or `null` when nothing was deleted.
 */
export async function removeLine(
  draftId: string,
  position: number,
  now: Date,
  connection?: DraftConnection,
  ifUnchanged?: BasketLine,
): Promise<number | null> {
  const id = z.uuid().parse(draftId);
  const at = z.number().int().min(1).max(BASKET_MAX_LINES).parse(position);
  return withDraftConnection(connection, async (executor) => {
    const [locked] = await executor.execute(sql`
      SELECT id FROM checkout_draft WHERE id = ${id} AND purchase_id IS NULL FOR UPDATE`);
    if (locked === undefined) return null;
    const deleted = await executor.execute(sql`
      DELETE FROM checkout_draft_line
       WHERE draft_id = ${id} AND position = ${at}
             ${ifUnchanged === undefined ? sql`` : sql`AND id = ${ifUnchanged.id}`}
      RETURNING id`);
    if (deleted.length !== 1) return null;
    const later = await executor.execute(sql`
      SELECT position FROM checkout_draft_line
       WHERE draft_id = ${id} AND position > ${at} ORDER BY position`);
    for (const row of later) {
      const from = z.coerce.number().int().parse(row["position"]);
      await executor.execute(sql`
        UPDATE checkout_draft_line SET position = ${from - 1}
         WHERE draft_id = ${id} AND position = ${from}`);
    }
    await executor.execute(sql`
      UPDATE checkout_draft SET ${sql.join(touch(now), sql`, `)} WHERE id = ${id}`);
    const [left] = await executor.execute(sql`
      SELECT count(*)::int AS n FROM checkout_draft_line WHERE draft_id = ${id}`);
    return z.object({ n: z.number().int() }).parse(left).n;
  });
}

/* -------------------------------------------------------------------------- */
/* expireDrafts                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Deletes every draft at or past its `expires_at`, its lines with it, and returns how many (D7:
 * 30 days after the last change). Spec 002's `retention.sweep` calls it for the
 * `checkout_draft` row (TASK-207 wires the handler).
 */
export async function expireDrafts(
  now: Date,
  connection?: DraftConnection,
): Promise<number> {
  return withDraftConnection(connection, async (executor) => {
    const rows = await executor.execute(sql`
      DELETE FROM checkout_draft WHERE expires_at <= ${timestamptz(now)} RETURNING id`);
    return rows.length;
  });
}
