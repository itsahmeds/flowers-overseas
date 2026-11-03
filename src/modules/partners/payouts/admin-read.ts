/**
 * What the admin payout pages read (spec 030a §2.7, §2.8, §5.3; AC-29; TASK-367): the
 * `/admin/payouts` overview (five groups, open adjustments, the waiver list), one payout with its
 * lines, one Wise export with its rows, and a florist's payout terms for the partner page.
 *
 * Each read runs in one admin transaction (`payouts.view`, a read action no trigger records) and
 * parses its rows at the boundary. Amounts stay `bigint` minor units with their ISO currency; the
 * pages format them through `formatMoney`. Dates that belong to the florist (periods, delivery
 * dates) are calendar dates with the florist's country zone beside them; instants are `Date`s the
 * page renders in the viewer's zone. No buyer, recipient, card or address field is read.
 *
 * `sendRefusals(facts)` is the page's copy of `sendStatement`'s checks, in its order, so a payout
 * whose send would refuse shows no send control and says why (AC-29). The command stays the
 * judge: a stale page that still posts gets the command's own refusal.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { PAYOUTS_CONFIG } from "@/config/payouts";
import type { OrderExecutor } from "@/modules/orders";

import type { PayoutErrorCode } from "./amount";
import { type PayoutAdminRunner, payoutAdminRunner } from "./admin-command";

/** The read action of every payouts page transaction. */
export const PAYOUTS_VIEW_ACTION = "payouts.view" as const;

/** How far back the "Paid" group reaches (the artboard's "last 8 weeks"). */
export const PAID_GROUP_DAYS = 56;

export type PayoutKind = "weekly" | "prepaid" | "per_order";
export type PayoutStatus = "draft" | "statement_sent" | "paid";

/** `sendStatement`'s refusals, in its order (§5.2). */
export const SEND_REFUSALS = [
  "PAYOUT_STATUS_ILLEGAL",
  "PAYOUT_NOT_CLOSED",
  "PAYOUT_TOTAL_NOT_POSITIVE",
  "PAYOUT_REVIEW_OPEN",
  "PAYOUT_ADJUSTMENT_OPEN",
] as const satisfies readonly PayoutErrorCode[];
export type SendRefusal = (typeof SEND_REFUSALS)[number];

export interface SendFacts {
  readonly status: PayoutStatus;
  readonly kind: PayoutKind;
  readonly closed: boolean;
  readonly totalMinor: bigint;
  readonly reviewOpen: number;
  readonly adjustmentOpen: boolean;
}

/**
 * Every reason `sendStatement` would refuse, in its order; empty when it would send. A payout that
 * is not `draft` has the one reason; the weekly adjustment check never applies to a prepaid or
 * per-order payout (AC-18).
 */
export function sendRefusals(facts: SendFacts): SendRefusal[] {
  if (facts.status !== "draft") return ["PAYOUT_STATUS_ILLEGAL"];
  const reasons: SendRefusal[] = [];
  if (!facts.closed) reasons.push("PAYOUT_NOT_CLOSED");
  if (facts.totalMinor <= 0n) reasons.push("PAYOUT_TOTAL_NOT_POSITIVE");
  if (facts.reviewOpen > 0) reasons.push("PAYOUT_REVIEW_OPEN");
  if (facts.kind === "weekly" && facts.adjustmentOpen) {
    reasons.push("PAYOUT_ADJUSTMENT_OPEN");
  }
  return reasons;
}

/* -------------------------------------------------------------------------- */
/* Row schemas                                                                */
/* -------------------------------------------------------------------------- */

const Minor = z.union([z.string(), z.number(), z.bigint()]).transform(BigInt);
const Instant = z.coerce.date();
const CalendarDate = z.iso.date();
const Kind = z.enum(["weekly", "prepaid", "per_order"]);
const Status = z.enum(["draft", "statement_sent", "paid"]);

const BlockingAdjustment = z.object({
  reference: z.string(),
  createdAt: Instant,
});

const PayoutRow = z.object({
  id: z.uuid(),
  partner_id: z.uuid(),
  partner_code: z.string(),
  partner_name: z.string(),
  has_wise: z.boolean(),
  iana_zone: z.string().min(1),
  kind: Kind,
  status: Status,
  period_start: CalendarDate,
  period_end: CalendarDate,
  closed_at: Instant.nullable(),
  sent_at: Instant.nullable(),
  paid_at: Instant.nullable(),
  statement_number: z.string().nullable(),
  export_id: z.uuid().nullable(),
  export_created_at: Instant.nullable(),
  currency_code: z.string().regex(/^[A-Z]{3}$/u),
  total_minor: Minor,
  line_count: z.coerce.number().int(),
  review_count: z.coerce.number().int(),
  blocking_adjustment: BlockingAdjustment.nullable(),
});

/** One payout as a list row reads it. */
export interface PayoutListRow {
  readonly id: string;
  readonly partnerId: string;
  readonly partnerCode: string;
  readonly partnerName: string;
  readonly hasWiseRecipient: boolean;
  readonly zone: string;
  readonly kind: PayoutKind;
  readonly status: PayoutStatus;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly closedAt: Date | null;
  readonly sentAt: Date | null;
  readonly paidAt: Date | null;
  readonly statementNumber: string | null;
  readonly exportId: string | null;
  readonly exportCreatedAt: Date | null;
  readonly currency: string;
  readonly totalMinor: bigint;
  readonly lineCount: number;
  readonly reviewCount: number;
  /** The open adjustment that holds this weekly payout's statement, if any (§5.2 check 5). */
  readonly blockingAdjustment: {
    readonly reference: string;
    readonly createdAt: Date;
  } | null;
  readonly refusals: readonly SendRefusal[];
}

function toListRow(raw: unknown): PayoutListRow {
  const row = PayoutRow.parse(raw);
  const facts: SendFacts = {
    status: row.status,
    kind: row.kind,
    closed: row.closed_at !== null,
    totalMinor: row.total_minor,
    reviewOpen: row.review_count,
    adjustmentOpen: row.blocking_adjustment !== null,
  };
  return {
    id: row.id,
    partnerId: row.partner_id,
    partnerCode: row.partner_code,
    partnerName: row.partner_name,
    hasWiseRecipient: row.has_wise,
    zone: row.iana_zone,
    kind: row.kind,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    closedAt: row.closed_at,
    sentAt: row.sent_at,
    paidAt: row.paid_at,
    statementNumber: row.statement_number,
    exportId: row.export_id,
    exportCreatedAt: row.export_created_at,
    currency: row.currency_code,
    totalMinor: row.total_minor,
    lineCount: row.line_count,
    reviewCount: row.review_count,
    blockingAdjustment: row.kind === "weekly" ? row.blocking_adjustment : null,
    refusals: sendRefusals(facts),
  };
}

/** The columns every payout read selects; `p`, `fp`, `c` and `x` are the joined tables. */
const PAYOUT_COLUMNS = sql`
  p.id, p.partner_id, fp.code AS partner_code, fp.legal_name AS partner_name,
  fp.wise_recipient_id IS NOT NULL AS has_wise, c.iana_zone, p.kind, p.status,
  p.period_start::text AS period_start, p.period_end::text AS period_end,
  p.closed_at, p.sent_at, p.paid_at, p.statement_number, p.export_id,
  x.created_at AS export_created_at, p.currency_code, p.total_minor::text AS total_minor,
  (SELECT count(*) FROM payout_line l WHERE l.payout_id = p.id) AS line_count,
  (SELECT count(*) FROM payout_line l
    WHERE l.payout_id = p.id AND l.review_reason IS NOT NULL AND l.reviewed_at IS NULL)
    AS review_count,
  (SELECT json_build_object('reference', order_reference(a.order_id), 'createdAt', a.created_at)
     FROM payout_adjustment a
    WHERE a.partner_id = p.partner_id AND a.status = 'open'
      AND a.created_at < ((p.period_end + 1)::timestamp AT TIME ZONE c.iana_zone)
    ORDER BY a.created_at LIMIT 1) AS blocking_adjustment`;

const PAYOUT_FROM = sql`
  payout p
  JOIN fulfillment_partner fp ON fp.id = p.partner_id
  JOIN country c ON c.id = fp.country_id
  LEFT JOIN payout_export x ON x.id = p.export_id`;

/* -------------------------------------------------------------------------- */
/* The overview                                                               */
/* -------------------------------------------------------------------------- */

const AdjustmentRow = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  reference: z.string(),
  created_at: Instant,
  partner_code: z.string(),
  partner_name: z.string(),
  iana_zone: z.string().min(1),
  currency_code: z.string().regex(/^[A-Z]{3}$/u),
  holds: z.boolean(),
});

export interface OpenAdjustment {
  readonly id: string;
  readonly orderId: string;
  readonly reference: string;
  readonly createdAt: Date;
  readonly partnerCode: string;
  readonly partnerName: string;
  readonly zone: string;
  /** The florist's payout currency: the settle dialog's amount is in it. */
  readonly currency: string;
  /** It holds a closed weekly statement of its florist (created on or before the period end). */
  readonly holdsStatement: boolean;
}

const WaiverRow = z.object({
  id: z.uuid(),
  reference: z.string(),
  delivered_at: Instant,
  partner_code: z.string(),
  partner_name: z.string(),
  iana_zone: z.string().min(1),
});

export interface WaiverCandidate {
  readonly orderId: string;
  readonly reference: string;
  readonly deliveredAt: Date;
  readonly partnerCode: string;
  readonly partnerName: string;
  readonly zone: string;
}

export interface PayoutsOverview {
  readonly open: readonly PayoutListRow[];
  readonly ready: readonly PayoutListRow[];
  readonly sent: readonly PayoutListRow[];
  readonly exported: readonly PayoutListRow[];
  readonly paid: readonly PayoutListRow[];
  readonly adjustments: readonly OpenAdjustment[];
  readonly waivers: readonly WaiverCandidate[];
}

/** The overview's reads, through the caller's transaction. */
export async function payoutsOverview(
  executor: OrderExecutor,
): Promise<PayoutsOverview> {
  const payouts = (
    await executor.execute(sql`
      SELECT ${PAYOUT_COLUMNS}
      FROM ${PAYOUT_FROM}
      WHERE p.status <> 'paid'
         OR p.paid_at >= now() - make_interval(days => ${PAID_GROUP_DAYS})
      ORDER BY p.period_end, p.statement_number NULLS LAST, fp.code, p.id`)
  ).map(toListRow);
  const adjustments = (
    await executor.execute(sql`
      SELECT a.id, a.order_id, order_reference(a.order_id) AS reference, a.created_at,
             fp.code AS partner_code, fp.legal_name AS partner_name, c.iana_zone,
             fp.payout_currency_code AS currency_code,
             EXISTS (SELECT 1 FROM payout p
                      WHERE p.partner_id = a.partner_id AND p.kind = 'weekly'
                        AND p.status = 'draft' AND p.closed_at IS NOT NULL
                        AND a.created_at < ((p.period_end + 1)::timestamp AT TIME ZONE c.iana_zone))
               AS holds
      FROM payout_adjustment a
      JOIN fulfillment_partner fp ON fp.id = a.partner_id
      JOIN country c ON c.id = fp.country_id
      WHERE a.status = 'open'
      ORDER BY a.created_at, a.id`)
  ).map((raw): OpenAdjustment => {
    const row = AdjustmentRow.parse(raw);
    return {
      id: row.id,
      orderId: row.order_id,
      reference: row.reference,
      createdAt: row.created_at,
      partnerCode: row.partner_code,
      partnerName: row.partner_name,
      zone: row.iana_zone,
      currency: row.currency_code,
      holdsStatement: row.holds,
    };
  });
  const waivers = (
    await executor.execute(sql`
      SELECT o.id, order_reference(o.id) AS reference, d.at AS delivered_at,
             fp.code AS partner_code, fp.legal_name AS partner_name, c.iana_zone
      FROM "order" o
      JOIN LATERAL (SELECT max(e.occurred_at) AS at FROM order_event e
                     WHERE e.order_id = o.id AND e.to_status = 'delivered') d ON d.at IS NOT NULL
      JOIN LATERAL (SELECT oa.partner_id FROM order_assignment oa
                     WHERE oa.order_id = o.id AND oa.response = 'accept'
                       AND oa.withdrawn_at IS NULL
                     ORDER BY oa.attempt DESC LIMIT 1) asg ON true
      JOIN fulfillment_partner fp ON fp.id = asg.partner_id
      JOIN country c ON c.id = fp.country_id
      WHERE o.mode = 'live' AND o.status = 'delivered'
        AND d.at < now() - make_interval(mins => ${PAYOUTS_CONFIG.waiverListAfterMinutes})
        AND NOT EXISTS (SELECT 1 FROM payout_line l WHERE l.order_id = o.id AND l.kind = 'order')
      ORDER BY d.at, o.id`)
  ).map((raw): WaiverCandidate => {
    const row = WaiverRow.parse(raw);
    return {
      orderId: row.id,
      reference: row.reference,
      deliveredAt: row.delivered_at,
      partnerCode: row.partner_code,
      partnerName: row.partner_name,
      zone: row.iana_zone,
    };
  });
  return {
    open: payouts.filter((p) => p.status === "draft" && p.closedAt === null),
    ready: payouts.filter((p) => p.status === "draft" && p.closedAt !== null),
    sent: payouts.filter(
      (p) => p.status === "statement_sent" && p.exportId === null,
    ),
    exported: payouts.filter(
      (p) => p.status === "statement_sent" && p.exportId !== null,
    ),
    paid: payouts.filter((p) => p.status === "paid"),
    adjustments,
    waivers,
  };
}

/* -------------------------------------------------------------------------- */
/* One payout                                                                 */
/* -------------------------------------------------------------------------- */

const ItemRow = z.object({
  productName: z.string().nullable(),
  tierStems: z.number().int().nullable(),
  quantity: z.number().int().positive(),
});

const LineRow = z.object({
  id: z.uuid(),
  kind: z.enum(["order", "adjustment", "goodwill"]),
  order_id: z.uuid().nullable(),
  reference: z.string().nullable(),
  delivery_date: CalendarDate.nullable(),
  items: z.array(ItemRow).nullable(),
  amount_minor: Minor,
  note: z.string().nullable(),
  review_reason: z.string().nullable(),
  reviewed_at: Instant.nullable(),
  settled: z.boolean(),
});

export interface PayoutLineView {
  readonly id: string;
  readonly kind: "order" | "adjustment" | "goodwill";
  readonly orderId: string | null;
  readonly reference: string | null;
  readonly deliveryDate: string | null;
  readonly items: readonly {
    readonly productName: string | null;
    readonly tierStems: number | null;
    readonly quantity: number;
  }[];
  readonly amountMinor: bigint;
  readonly note: string | null;
  /** An unresolved review flag (`unpriced_lines`), or null. */
  readonly reviewOpen: string | null;
  /** A manual line a settled adjustment points to: never removable (§5.2). */
  readonly settled: boolean;
}

const DetailExtraRow = z.object({
  prepaid_rank: z.coerce.number().int().nullable(),
  prepaid_limit: z.coerce.number().int(),
  sent_by_name: z.string().nullable(),
  paid_by_name: z.string().nullable(),
  email_status: z.string().nullable(),
  has_pdf: z.boolean(),
  export_cancelled: z.boolean().nullable(),
});

export interface PayoutDetail extends PayoutListRow {
  readonly lines: readonly PayoutLineView[];
  /** For a prepaid payout: its place among the florist's prepaid payouts, and the limit. */
  readonly prepaidRank: number | null;
  readonly prepaidLimit: number;
  readonly sentByName: string | null;
  readonly paidByName: string | null;
  /** The statement email's `notification_delivery.status`, once the job has claimed it. */
  readonly emailStatus: string | null;
  readonly hasPdf: boolean;
}

/** One payout and its lines, or `undefined`. */
export async function payoutDetail(
  executor: OrderExecutor,
  payoutId: string,
): Promise<PayoutDetail | undefined> {
  const id = z.uuid().safeParse(payoutId);
  if (!id.success) return undefined;
  const [head] = await executor.execute(sql`
    SELECT ${PAYOUT_COLUMNS},
           CASE WHEN p.kind = 'prepaid' THEN
             (SELECT count(*) FROM payout q
               WHERE q.partner_id = p.partner_id AND q.kind = 'prepaid'
                 AND (q.created_at, q.id) <= (p.created_at, p.id)) END AS prepaid_rank,
           fp.prepaid_order_limit AS prepaid_limit,
           (SELECT ap.display_name FROM audit_log al
              JOIN admin_profile ap ON ap.user_id = al.actor_user_id
             WHERE al.entity_table = 'payout' AND al.entity_id = p.id::text
               AND al.action = 'payout.statement_sent'
             ORDER BY al.at DESC LIMIT 1) AS sent_by_name,
           (SELECT ap.display_name FROM audit_log al
              JOIN admin_profile ap ON ap.user_id = al.actor_user_id
             WHERE al.entity_table = 'payout' AND al.entity_id = p.id::text
               AND al.action = 'payout.paid'
             ORDER BY al.at DESC LIMIT 1) AS paid_by_name,
           (SELECT nd.status FROM notification_delivery nd
             WHERE nd.source_key = 'job:payouts.statement_email:' || p.id::text
               AND nd.template_key = 'florist-payout-statement'
             LIMIT 1) AS email_status,
           p.statement_media_asset_id IS NOT NULL AS has_pdf,
           x.cancelled_at IS NOT NULL AS export_cancelled
    FROM ${PAYOUT_FROM}
    WHERE p.id = ${id.data}`);
  if (head === undefined) return undefined;
  const row = toListRow(head);
  const extra = DetailExtraRow.parse(head);
  const lines = (
    await executor.execute(sql`
      SELECT l.id, l.kind, l.order_id,
             CASE WHEN l.order_id IS NULL THEN NULL ELSE order_reference(l.order_id) END
               AS reference,
             o.delivery_date::text AS delivery_date,
             (SELECT json_agg(json_build_object(
                       'productName', (SELECT pt.name FROM product_translation pt
                                        WHERE pt.product_id = ol.product_id
                                          AND pt.locale_code = 'en' LIMIT 1),
                       'tierStems', t.stems,
                       'quantity', ol.qty) ORDER BY ol.id)
                FROM order_line ol
                LEFT JOIN product_tier t
                  ON t.product_id = ol.product_id AND t.tier_key = ol.tier_key
               WHERE ol.order_id = l.order_id AND l.kind = 'order' AND ol.kind = 'product')
               AS items,
             l.amount_minor::text AS amount_minor, l.note,
             CASE WHEN l.reviewed_at IS NULL THEN l.review_reason END AS review_reason,
             l.reviewed_at,
             EXISTS (SELECT 1 FROM payout_adjustment a WHERE a.payout_line_id = l.id)
               AS settled
      FROM payout_line l
      LEFT JOIN "order" o ON o.id = l.order_id
      WHERE l.payout_id = ${id.data}
      ORDER BY (l.kind <> 'order'), o.delivery_date NULLS LAST, l.created_at, l.id`)
  ).map((raw): PayoutLineView => {
    const line = LineRow.parse(raw);
    return {
      id: line.id,
      kind: line.kind,
      orderId: line.order_id,
      reference: line.reference,
      deliveryDate: line.kind === "order" ? line.delivery_date : null,
      items: line.items ?? [],
      amountMinor: line.amount_minor,
      note: line.note,
      reviewOpen: line.review_reason,
      settled: line.settled,
    };
  });
  return {
    ...row,
    // An export that was cancelled frees its payouts (`export_id` cleared), so a set id is active.
    exportId: extra.export_cancelled === true ? null : row.exportId,
    lines,
    prepaidRank: extra.prepaid_rank,
    prepaidLimit: extra.prepaid_limit,
    sentByName: extra.sent_by_name,
    paidByName: extra.paid_by_name,
    emailStatus: extra.email_status,
    hasPdf: extra.has_pdf,
  };
}

/* -------------------------------------------------------------------------- */
/* One export                                                                 */
/* -------------------------------------------------------------------------- */

const ExportHeadRow = z.object({
  id: z.uuid(),
  created_at: Instant,
  cancelled_at: Instant.nullable(),
  source_currency_code: z.string().regex(/^[A-Z]{3}$/u),
  created_by_name: z.string().nullable(),
  cancelled_by_name: z.string().nullable(),
  cancelled_count: z.coerce.number().int().nullable(),
});

const ExportPayoutRow = z.object({
  id: z.uuid(),
  statement_number: z.string().nullable(),
  partner_code: z.string(),
  partner_name: z.string(),
  wise_recipient_id: z.string().nullable(),
  currency_code: z.string().regex(/^[A-Z]{3}$/u),
  total_minor: Minor,
  status: Status,
  paid_at: Instant.nullable(),
});

export interface ExportPayout {
  readonly id: string;
  readonly statementNumber: string | null;
  readonly partnerCode: string;
  readonly partnerName: string;
  readonly wiseRecipientId: string | null;
  readonly currency: string;
  readonly totalMinor: bigint;
  readonly status: PayoutStatus;
  readonly paidAt: Date | null;
}

export interface ExportDetail {
  readonly id: string;
  readonly createdAt: Date;
  readonly cancelledAt: Date | null;
  readonly sourceCurrency: string;
  readonly createdByName: string | null;
  readonly cancelledByName: string | null;
  /** How many payouts a cancelled export held (its audit row), since cancelling frees them. */
  readonly cancelledCount: number | null;
  readonly payouts: readonly ExportPayout[];
  /** One total per currency, in the order the currencies first appear. */
  readonly totals: readonly {
    readonly currency: string;
    readonly totalMinor: bigint;
  }[];
}

/** One export and its payouts, or `undefined`. */
export async function exportDetail(
  executor: OrderExecutor,
  exportId: string,
): Promise<ExportDetail | undefined> {
  const id = z.uuid().safeParse(exportId);
  if (!id.success) return undefined;
  const [head] = await executor.execute(sql`
    SELECT x.id, x.created_at, x.cancelled_at, x.source_currency_code,
           (SELECT ap.display_name FROM admin_profile ap WHERE ap.user_id = x.created_by)
             AS created_by_name,
           (SELECT ap.display_name FROM audit_log al
              JOIN admin_profile ap ON ap.user_id = al.actor_user_id
             WHERE al.entity_table = 'payout_export' AND al.entity_id = x.id::text
               AND al.action = 'payout_export.cancelled'
             ORDER BY al.at DESC LIMIT 1) AS cancelled_by_name,
           (SELECT (al.before ->> 'payout_count')::int FROM audit_log al
             WHERE al.entity_table = 'payout_export' AND al.entity_id = x.id::text
               AND al.action = 'payout_export.cancelled'
             ORDER BY al.at DESC LIMIT 1) AS cancelled_count
    FROM payout_export x WHERE x.id = ${id.data}`);
  if (head === undefined) return undefined;
  const row = ExportHeadRow.parse(head);
  const payouts = (
    await executor.execute(sql`
      SELECT p.id, p.statement_number, fp.code AS partner_code, fp.legal_name AS partner_name,
             fp.wise_recipient_id, p.currency_code, p.total_minor::text AS total_minor,
             p.status, p.paid_at
      FROM payout p JOIN fulfillment_partner fp ON fp.id = p.partner_id
      WHERE p.export_id = ${id.data}
      ORDER BY p.statement_number, p.id`)
  ).map((raw): ExportPayout => {
    const payout = ExportPayoutRow.parse(raw);
    return {
      id: payout.id,
      statementNumber: payout.statement_number,
      partnerCode: payout.partner_code,
      partnerName: payout.partner_name,
      wiseRecipientId: payout.wise_recipient_id,
      currency: payout.currency_code,
      totalMinor: payout.total_minor,
      status: payout.status,
      paidAt: payout.paid_at,
    };
  });
  return {
    id: row.id,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    sourceCurrency: row.source_currency_code,
    createdByName: row.created_by_name,
    cancelledByName: row.cancelled_by_name,
    cancelledCount: row.cancelled_count,
    payouts,
    totals: totalsByCurrency(payouts),
  };
}

/** One total per currency, in first-seen order; amounts are summed as `bigint`. */
export function totalsByCurrency(
  rows: readonly { readonly currency: string; readonly totalMinor: bigint }[],
): { readonly currency: string; readonly totalMinor: bigint }[] {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0n) + row.totalMinor);
  }
  return [...totals].map(([currency, totalMinor]) => ({
    currency,
    totalMinor,
  }));
}

/* -------------------------------------------------------------------------- */
/* A florist's terms, the statement's file                                    */
/* -------------------------------------------------------------------------- */

const TermsRow = z.object({
  payout_cadence: z.enum(["weekly", "per_order"]),
  prepaid_order_limit: z.coerce.number().int(),
  wise_recipient_id: z.string().nullable(),
  prepaid_used: z.coerce.number().int(),
});

export interface PayoutTermsView {
  readonly cadence: "weekly" | "per_order";
  readonly prepaidOrderLimit: number;
  readonly wiseRecipientId: string | null;
  /** The florist's `prepaid` payouts so far: "used n of m". */
  readonly prepaidUsed: number;
}

/** A florist's payout terms, or `undefined`. */
export async function payoutTermsOf(
  executor: OrderExecutor,
  partnerId: string,
): Promise<PayoutTermsView | undefined> {
  const id = z.uuid().safeParse(partnerId);
  if (!id.success) return undefined;
  const [raw] = await executor.execute(sql`
    SELECT fp.payout_cadence, fp.prepaid_order_limit, fp.wise_recipient_id,
           (SELECT count(*) FROM payout p
             WHERE p.partner_id = fp.id AND p.kind = 'prepaid') AS prepaid_used
    FROM fulfillment_partner fp WHERE fp.id = ${id.data}`);
  if (raw === undefined) return undefined;
  const row = TermsRow.parse(raw);
  return {
    cadence: row.payout_cadence,
    prepaidOrderLimit: row.prepaid_order_limit,
    wiseRecipientId: row.wise_recipient_id,
    prepaidUsed: row.prepaid_used,
  };
}

const StatementFileRow = z.object({
  bucket: z.string().min(1),
  object_key: z.string().min(1),
});

/** Where a sent payout's statement PDF is stored, or `undefined` before the job has stored it. */
export async function statementFileOf(
  executor: OrderExecutor,
  payoutId: string,
): Promise<
  { readonly bucket: string; readonly objectKey: string } | undefined
> {
  const id = z.uuid().safeParse(payoutId);
  if (!id.success) return undefined;
  const [raw] = await executor.execute(sql`
    SELECT m.bucket, m.object_key
    FROM payout p JOIN media_asset m ON m.id = p.statement_media_asset_id
    WHERE p.id = ${id.data} AND m.visibility = 'private'`);
  if (raw === undefined) return undefined;
  const row = StatementFileRow.parse(raw);
  return { bucket: row.bucket, objectKey: row.object_key };
}

/* -------------------------------------------------------------------------- */
/* The page entry                                                             */
/* -------------------------------------------------------------------------- */

/** Runs one of the reads above in its own admin read transaction. */
export async function readPayouts<T>(
  actor: { readonly userId: string; readonly requestId: string },
  read: (executor: OrderExecutor) => Promise<T>,
  run: PayoutAdminRunner = payoutAdminRunner,
): Promise<T> {
  return run({ ...actor, action: PAYOUTS_VIEW_ACTION }, read);
}
