/**
 * The finance reads (spec 030b §5.2 "queries", §5.4; AC-19, AC-20, AC-22, AC-24; TASK-440).
 *
 * Each read runs in the caller's admin transaction (`readFinance`, action `finance.view`) and
 * issues a fixed number of statements whatever the number of orders: the facts, the purchases'
 * orders (for the split by weight), the refunds with their credit-note VAT, the balance rows,
 * the ECB rows, and for the overview the florists' owed and paid position. Six statements at
 * most (AC-22: at most eight); everything else is `orderMargin` and `rollUp` in memory.
 *
 * No personal data is selected: no buyer, recipient, legal name, email, phone or public token.
 * `demo` orders never appear (the view keeps `live` and `test` only, and every read names one).
 */
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { FINANCE_CONFIG, type FinanceConfig } from "@/config/finance";
import type { AdminContextInput } from "@/lib/db";
import type { OrderExecutor } from "@/modules/orders";

import {
  addDays,
  BALANCE_ROW_KINDS,
  type FinanceOrderFacts,
  type FinanceGroup,
  type OrderMargin,
  orderMargin,
  type RateBook,
  rateBookOf,
  rollUp,
} from "./margin";
import { type FinanceRange, todayIn } from "./range";

/** The audit action of every finance read (no trigger records a read; the name is the label). */
export const FINANCE_VIEW_ACTION = "finance.view";

const Minor = z.coerce.bigint();
const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

/** A text array literal (`{a,b}`) for `= ANY($1::uuid[])`; ids are checked as uuids first. */
function uuidList(ids: readonly string[]): string {
  return `{${ids.map((id) => z.uuid().parse(id)).join(",")}}`;
}

/** The UTC calendar day of an instant (Postgres or ISO text). */
function utcDay(instant: string): string {
  return new Date(instant).toISOString().slice(0, 10);
}

const FactRow = z.object({
  order_id: z.uuid(),
  order_reference: z.string(),
  mode: z.enum(["live", "test"]),
  purchase_id: z.uuid(),
  payment_id: z.uuid(),
  provider: z.string(),
  captured_at: z.union([z.date(), z.string()]),
  delivery_date: IsoDay,
  destination_iso2: z.string(),
  status: z.string(),
  supply_model: z.string().nullable(),
  buyer_currency_code: z.string(),
  buyer_total_minor: Minor,
  vat_breakdown: z.array(
    z.object({ rateBp: z.number().int(), vatMinor: z.number().int() }).loose(),
  ),
  vat_total_minor: Minor,
  partner_id: z.uuid().nullable(),
  partner_code: z.string().nullable(),
  partner_city: z.string().nullable(),
  fixed_minor: Minor.nullable(),
  fixed_currency_code: z.string().nullable(),
  payout_lines: z.array(
    z.object({
      kind: z.string(),
      amountMinor: Minor,
      currency: z.string(),
      payoutStatus: z.string(),
      paidAt: z.string().nullable(),
    }),
  ),
  open_adjustments: z.coerce.number().int(),
});

const SiblingRow = z.object({
  id: z.uuid(),
  purchase_id: z.uuid(),
  buyer_total_minor: Minor,
});

const RefundRow = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  status: z.string(),
  amount_minor: Minor,
  succeeded_at: z.union([z.date(), z.string()]).nullable(),
  credit_note_vat_minor: Minor.nullable(),
});

const BalanceRow = z.object({
  payment_id: z.uuid(),
  provider_txn_ref: z.string(),
  kind: z.enum(BALANCE_ROW_KINDS),
  refund_id: z.uuid().nullable(),
  amount_minor: Minor,
  fee_minor: Minor,
  settlement_currency_code: z.string(),
  presentment_currency_code: z.string().nullable(),
  effective_rate_ppm: Minor.nullable(),
  created_on: IsoDay,
});

const RateRowSchema = z.object({
  quote_code: z.string(),
  as_of: IsoDay,
  rate_ppm: Minor,
});

const instantText = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/** Statement 1: the facts of the orders the filter selects, oldest paid first. */
async function readFactRows(
  executor: OrderExecutor,
  where: SQL,
): Promise<z.infer<typeof FactRow>[]> {
  const rows = await executor.execute(sql`
    SELECT f.order_id, f.order_reference, f.mode, f.purchase_id, f.payment_id, f.provider,
           f.captured_at, f.delivery_date::text AS delivery_date, f.destination_iso2, f.status,
           f.supply_model, f.buyer_currency_code, f.buyer_total_minor::text AS buyer_total_minor,
           f.vat_breakdown, f.vat_total_minor::text AS vat_total_minor, f.partner_id,
           fp.code AS partner_code, fp.city_label AS partner_city,
           f.fixed_minor::text AS fixed_minor, f.fixed_currency_code, f.payout_lines,
           f.open_adjustments
    FROM finance_order_facts f
    LEFT JOIN fulfillment_partner fp ON fp.id = f.partner_id
    WHERE ${where}
    ORDER BY f.captured_at, f.order_reference`);
  return rows.map((row) => FactRow.parse(row));
}

/** Statements 2 to 4: the purchases' orders, the refunds and the balance rows; facts assembled. */
async function assembleFacts(
  executor: OrderExecutor,
  facts: readonly z.infer<typeof FactRow>[],
): Promise<FinanceOrderFacts[]> {
  if (facts.length === 0) return [];
  const purchaseIds = [...new Set(facts.map((row) => row.purchase_id))];
  const orderIds = facts.map((row) => row.order_id);
  const paymentIds = [...new Set(facts.map((row) => row.payment_id))];
  const siblings = (
    await executor.execute(sql`
      SELECT id, purchase_id, buyer_total_minor::text AS buyer_total_minor
      FROM "order"
      WHERE purchase_id = ANY(${uuidList(purchaseIds)}::uuid[])
      ORDER BY id`)
  ).map((row) => SiblingRow.parse(row));
  const refunds = (
    await executor.execute(sql`
      SELECT r.id, r.order_id, r.status, r.amount_minor::text AS amount_minor, r.succeeded_at,
             (SELECT i.snapshot -> 'totals' ->> 'vatMinor'
              FROM invoice i
              WHERE i.refund_id = r.id AND i.kind = 'credit_note') AS credit_note_vat_minor
      FROM refund r
      WHERE r.order_id = ANY(${uuidList(orderIds)}::uuid[])
      ORDER BY r.created_at, r.id`)
  ).map((row) => RefundRow.parse(row));
  const balance = (
    await executor.execute(sql`
      SELECT payment_id, provider_txn_ref, kind, refund_id, amount_minor::text AS amount_minor,
             fee_minor::text AS fee_minor, settlement_currency_code, presentment_currency_code,
             effective_rate_ppm::text AS effective_rate_ppm,
             (provider_created_at AT TIME ZONE 'UTC')::date::text AS created_on
      FROM payment_balance_txn
      WHERE payment_id = ANY(${uuidList(paymentIds)}::uuid[])
      ORDER BY provider_created_at, provider_txn_ref`)
  ).map((row) => BalanceRow.parse(row));

  return facts.map((row) => ({
    orderId: row.order_id,
    reference: row.order_reference,
    mode: row.mode,
    purchaseId: row.purchase_id,
    paymentId: row.payment_id,
    provider: row.provider,
    capturedAt: instantText(row.captured_at),
    paidOn: utcDay(instantText(row.captured_at)),
    deliveryDate: row.delivery_date,
    countryIso2: row.destination_iso2,
    status: row.status,
    supplyModel: row.supply_model,
    buyerCurrency: row.buyer_currency_code,
    buyerTotalMinor: row.buyer_total_minor,
    vatTotalMinor: row.vat_total_minor,
    vatBreakdown: row.vat_breakdown.map((split) => ({
      rateBp: split.rateBp,
      vatMinor: BigInt(split.vatMinor),
    })),
    partnerId: row.partner_id,
    partnerCode: row.partner_code,
    partnerCity: row.partner_city,
    fixedMinor: row.fixed_minor,
    fixedCurrency: row.fixed_currency_code,
    payoutLines: row.payout_lines.map((line) => ({
      kind: line.kind,
      amountMinor: line.amountMinor,
      currency: line.currency,
      payoutStatus: line.payoutStatus,
      paidOn: line.paidAt === null ? null : utcDay(line.paidAt),
    })),
    openAdjustments: row.open_adjustments,
    refunds: refunds
      .filter((refund) => refund.order_id === row.order_id)
      .map((refund) => ({
        refundId: refund.id,
        status: refund.status,
        amountMinor: refund.amount_minor,
        succeededOn:
          refund.succeeded_at === null
            ? null
            : utcDay(instantText(refund.succeeded_at)),
        creditNoteVatMinor: refund.credit_note_vat_minor,
      })),
    siblings: siblings
      .filter((sibling) => sibling.purchase_id === row.purchase_id)
      .map((sibling) => ({
        id: sibling.id,
        weight: sibling.buyer_total_minor,
      })),
    balance: balance
      .filter((txn) => txn.payment_id === row.payment_id)
      .map((txn) => ({
        providerTxnRef: txn.provider_txn_ref,
        kind: txn.kind,
        refundId: txn.refund_id,
        amountMinor: txn.amount_minor,
        feeMinor: txn.fee_minor,
        settlementCurrency: txn.settlement_currency_code,
        presentmentCurrency: txn.presentment_currency_code,
        effectiveRatePpm: txn.effective_rate_ppm,
        createdOn: txn.created_on,
      })),
  }));
}

/** The viewer's zone as a bound parameter; Postgres refuses a zone it does not know. */
function zoneParam(zone: string): string {
  return z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/u)
    .parse(zone);
}

/** The range's filter: mode, then paid-on (whole days in the viewer's zone) or delivery date. */
function rangeWhere(range: FinanceRange, zone: string): SQL {
  const tz = zoneParam(zone);
  const window =
    range.basis === "paid"
      ? sql`f.captured_at >= ((${range.from}::date)::timestamp AT TIME ZONE ${tz})
            AND f.captured_at < ((${range.to}::date + 1)::timestamp AT TIME ZONE ${tz})`
      : sql`f.delivery_date BETWEEN ${range.from}::date AND ${range.to}::date`;
  const parts = [sql`f.mode = ${range.mode}`, window];
  if (range.country !== undefined)
    parts.push(sql`f.destination_iso2 = ${range.country}`);
  if (range.partner !== undefined) parts.push(sql`fp.code = ${range.partner}`);
  return sql.join(parts, sql` AND `);
}

/** §5.2 `financeOrderFacts(range)`: the facts of every order in the range (statements 1 to 4). */
export async function financeOrderFacts(
  executor: OrderExecutor,
  range: FinanceRange,
  zone: string,
): Promise<FinanceOrderFacts[]> {
  return assembleFacts(
    executor,
    await readFactRows(executor, rangeWhere(range, zone)),
  );
}

/**
 * §5.2 `rateBook(dates, currencies)` (statement 5): every EUR-based row from `from − lookback`
 * to `today`, plus the newest row of each currency on or before `today` (an unpaid florist
 * amount converts at it, §13 Q6).
 */
export async function rateBook(
  executor: OrderExecutor,
  from: string,
  today: string,
  config: FinanceConfig = FINANCE_CONFIG,
): Promise<RateBook> {
  const earliest = addDays(from, -config.rateLookbackDays);
  const rows = (
    await executor.execute(sql`
      SELECT quote_code, as_of::text AS as_of, rate_ppm::text AS rate_ppm
      FROM fx_rate
      WHERE base_code = 'EUR' AND as_of BETWEEN ${earliest}::date AND ${today}::date
      UNION
      SELECT quote_code, as_of, rate_ppm FROM (
        SELECT DISTINCT ON (quote_code) quote_code, as_of::text AS as_of,
               rate_ppm::text AS rate_ppm
        FROM fx_rate
        WHERE base_code = 'EUR' AND as_of <= ${today}::date
        ORDER BY quote_code, as_of DESC
      ) newest`)
  ).map((row) => RateRowSchema.parse(row));
  return rateBookOf(
    rows.map((row) => ({
      currency: row.quote_code,
      asOf: row.as_of,
      ratePpm: row.rate_ppm,
    })),
  );
}

/** The earliest date any rate of these orders may be read on. */
function earliestDate(
  facts: readonly FinanceOrderFacts[],
  fallback: string,
): string {
  return facts.reduce(
    (min, fact) => (fact.paidOn < min ? fact.paidOn : min),
    fallback,
  );
}

/** One florist's owed and paid position, per currency (`finance_partner_position`). */
export interface PartnerPosition {
  readonly partnerId: string;
  readonly partnerCode: string;
  readonly currency: string;
  readonly draftOpenMinor: bigint;
  readonly draftClosedMinor: bigint;
  readonly statementSentMinor: bigint;
  readonly paidMinor: bigint;
  readonly openAdjustments: number;
}

const PositionRow = z.object({
  partner_id: z.uuid(),
  partner_code: z.string(),
  currency_code: z.string(),
  draft_open_minor: Minor,
  draft_closed_minor: Minor,
  statement_sent_minor: Minor,
  paid_minor: Minor,
  open_adjustments: z.coerce.number().int(),
});

/** Statement 6: the owed and paid position of every florist (or of the one filtered). */
async function partnerPositions(
  executor: OrderExecutor,
  partner: string | undefined,
): Promise<PartnerPosition[]> {
  const rows = await executor.execute(sql`
    SELECT p.partner_id, fp.code AS partner_code, p.currency_code,
           p.draft_open_minor::text AS draft_open_minor,
           p.draft_closed_minor::text AS draft_closed_minor,
           p.statement_sent_minor::text AS statement_sent_minor,
           p.paid_minor::text AS paid_minor, p.open_adjustments
    FROM finance_partner_position p
    JOIN fulfillment_partner fp ON fp.id = p.partner_id
    WHERE ${partner === undefined ? sql`true` : sql`fp.code = ${partner}`}
    ORDER BY fp.code, p.currency_code`);
  return rows.map((row) => {
    const parsed = PositionRow.parse(row);
    return {
      partnerId: parsed.partner_id,
      partnerCode: parsed.partner_code,
      currency: parsed.currency_code,
      draftOpenMinor: parsed.draft_open_minor,
      draftClosedMinor: parsed.draft_closed_minor,
      statementSentMinor: parsed.statement_sent_minor,
      paidMinor: parsed.paid_minor,
      openAdjustments: parsed.open_adjustments,
    };
  });
}

/** What `/admin/finance` renders. */
export interface PortfolioOverview {
  readonly range: FinanceRange;
  readonly today: string;
  readonly orders: readonly OrderMargin[];
  readonly totals: FinanceGroup;
  readonly byCountry: readonly FinanceGroup[];
  readonly byPartner: readonly FinanceGroup[];
  readonly positions: readonly PartnerPosition[];
}

/** §5.2 `financeOrders(range)`: every order of the range through `orderMargin`. */
export async function financeOrders(
  executor: OrderExecutor,
  range: FinanceRange,
  zone: string,
  now: Date,
  config: FinanceConfig = FINANCE_CONFIG,
): Promise<{
  readonly today: string;
  readonly orders: readonly OrderMargin[];
}> {
  const today = todayIn(zone, now);
  const facts = await financeOrderFacts(executor, range, zone);
  if (facts.length === 0) return { today, orders: [] };
  const book = await rateBook(
    executor,
    earliestDate(facts, range.from),
    today,
    config,
  );
  return {
    today,
    orders: facts.map((fact) => orderMargin(fact, book, today, config)),
  };
}

/** §5.2 `portfolioOverview(range)`: totals, by country, by florist, and the owed position. */
export async function portfolioOverview(
  executor: OrderExecutor,
  range: FinanceRange,
  zone: string,
  now: Date,
  config: FinanceConfig = FINANCE_CONFIG,
): Promise<PortfolioOverview> {
  const { today, orders } = await financeOrders(
    executor,
    range,
    zone,
    now,
    config,
  );
  const positions = await partnerPositions(executor, range.partner);
  const [totals] = rollUp(orders, "all");
  if (totals === undefined)
    throw new Error("rollUp(all) always returns one group");
  return {
    range,
    today,
    orders,
    totals,
    byCountry: rollUp(orders, "country"),
    byPartner: rollUp(orders, "partner"),
    positions,
  };
}

/** §5.2 `orderMoney(orderId)`: one order's margin, or `null` for a demo or unpaid order. */
export async function orderMoney(
  executor: OrderExecutor,
  orderId: string,
  zone: string,
  now: Date,
  config: FinanceConfig = FINANCE_CONFIG,
): Promise<OrderMargin | null> {
  const id = z.uuid().parse(orderId);
  const facts = await assembleFacts(
    executor,
    await readFactRows(executor, sql`f.order_id = ${id}`),
  );
  const [fact] = facts;
  if (fact === undefined) return null;
  const today = todayIn(zone, now);
  const book = await rateBook(executor, fact.paidOn, today, config);
  return orderMargin(fact, book, today, config);
}

/** Runs `fn` in one admin transaction with an executor over it. */
export type FinanceRunner = <T>(
  input: AdminContextInput,
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

/** Production: `withAdminContext`, loaded lazily (no server env is read at import). */
export const financeRunner: FinanceRunner = async (input, fn) => {
  const [{ withAdminContext }, { withExecutor }] = await Promise.all([
    import("@/lib/db"),
    import("@/modules/orders"),
  ]);
  return withAdminContext(input, (db) =>
    withExecutor({ db }, "admin.finance", fn),
  );
};

/** Runs a finance read in its own admin transaction (`finance.view`). */
export async function readFinance<T>(
  actor: { readonly userId: string; readonly requestId: string },
  read: (executor: OrderExecutor) => Promise<T>,
  run: FinanceRunner = financeRunner,
): Promise<T> {
  return run({ ...actor, action: FINANCE_VIEW_ACTION }, read);
}
