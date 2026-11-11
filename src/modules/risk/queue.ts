/**
 * The admin reads of the review queue (spec 021 §5.3 `/admin/risk`, `/admin/risk/[reviewId]`, the
 * order page's Risk panel; AC-19; TASK-494). Every read runs on the caller's admin-context
 * transaction and selects **no** recipient name, phone or street and **no** buyer email: the
 * detail's buyer email and name are a separate read (`reviewBuyer`) that the page makes only for
 * `orders.view_pii`, and logs.
 *
 * A row's signals are ids and points; the page labels them from `admin.risk.signal.{id}`. The top
 * three for the queue: "always hold" and decisive signals first, then by points.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  BuyerSnapshotSchema,
  type OrderExecutor,
  orderReference,
} from "@/modules/orders";
import { RISK_SIGNALS } from "@/config/risk";

import { REVIEW_STATUSES } from "./reviews.ts";
import { type RiskSignals, RiskSignalsV1Schema } from "./score.ts";

const DAY_MS = 86_400_000;
/** The decided list reaches this far back (§5.3). */
export const DECIDED_WINDOW_DAYS = 7;

const date = z
  .union([z.date(), z.string()])
  .transform((value) => (value instanceof Date ? value : new Date(value)));
const optionalDate = date.nullable();

const QueueRow = z.object({
  review_id: z.uuid(),
  order_id: z.uuid(),
  kind: z.enum(["pre_routing", "post_routing"]),
  status: z.enum(REVIEW_STATUSES),
  recommendation: z.enum(["approve", "cancel", "refund"]),
  deadline_at: optionalDate,
  decided_at: optionalDate,
  decided_by: z.string().nullable(),
  decided_by_name: z.string().nullable(),
  decision_reason: z.string().nullable(),
  review_created_at: date,
  mode: z.enum(["demo", "test", "live"]),
  order_status: z.string(),
  placed_at: date,
  delivery_date: z.string(),
  city_name: z.string().nullable(),
  country_iso2: z.string(),
  dest_zone: z.string().nullable(),
  total_minor: z.number().int().nonnegative(),
  currency: z.string(),
  score: z.number().int(),
  signals: z.unknown(),
  rules_version: z.number().int(),
  assessed_at: date,
  radar_risk_level: z.string().nullable(),
  radar_risk_score: z.number().int().nullable(),
  radar_outcome: z.string().nullable(),
  liability_shift: z.boolean().nullable(),
});

/** One review as the queue and the detail read it. */
export interface ReviewView {
  readonly reviewId: string;
  readonly orderId: string;
  readonly reference: string;
  readonly kind: "pre_routing" | "post_routing";
  readonly status: (typeof REVIEW_STATUSES)[number];
  readonly recommendation: "approve" | "cancel" | "refund";
  readonly deadlineAt: Date | null;
  readonly decidedAt: Date | null;
  /** `system:…` or `admin:{id}`. */
  readonly decidedBy: string | null;
  /** The admin's display name when a person decided. */
  readonly decidedByName: string | null;
  readonly decisionReason: string | null;
  readonly openedAt: Date;
  readonly mode: "demo" | "test" | "live";
  readonly orderStatus: string;
  readonly placedAt: Date;
  readonly deliveryDate: string;
  readonly cityName: string | null;
  readonly countryIso2: string;
  readonly destinationZone: string | null;
  readonly totalMinor: number;
  readonly currency: string;
  readonly score: number;
  readonly signals: RiskSignals;
  readonly rulesVersion: number;
  readonly assessedAt: Date;
  readonly radarRiskLevel: string | null;
  readonly radarRiskScore: number | null;
  readonly radarOutcome: string | null;
  readonly liabilityShift: boolean | null;
}

const SELECT = sql`
  SELECT r.id AS review_id, r.order_id, r.kind, r.status, r.recommendation, r.deadline_at,
         r.decided_at, r.decided_by, ap.display_name AS decided_by_name, r.decision_reason,
         r.created_at AS review_created_at,
         o.mode, o.status AS order_status, o.created_at AS placed_at,
         o.delivery_date::text AS delivery_date,
         (SELECT ct.name FROM city_translation ct
          WHERE ct.city_id = o.destination_city_id AND ct.locale_code = 'en' LIMIT 1) AS city_name,
         c.iso2 AS country_iso2, coalesce(ci.iana_zone, c.iana_zone) AS dest_zone,
         o.buyer_total_minor::int AS total_minor, o.buyer_currency_code AS currency,
         a.score::int AS score, a.signals, a.rules_version, a.created_at AS assessed_at,
         a.radar_risk_level, a.radar_risk_score::int AS radar_risk_score, a.radar_outcome,
         a.liability_shift
  FROM risk_review r
  JOIN risk_assessment a ON a.id = r.assessment_id
  JOIN "order" o ON o.id = r.order_id
  JOIN country c ON c.id = o.destination_country_id
  LEFT JOIN city ci ON ci.id = o.destination_city_id
  LEFT JOIN admin_profile ap
    ON r.decided_by LIKE 'admin:%' AND ap.user_id::text = substring(r.decided_by FROM 7)`;

function view(raw: unknown): ReviewView {
  const row = QueueRow.parse(raw);
  return {
    reviewId: row.review_id,
    orderId: row.order_id,
    reference: orderReference(row.order_id),
    kind: row.kind,
    status: row.status,
    recommendation: row.recommendation,
    deadlineAt: row.deadline_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by_name,
    decisionReason: row.decision_reason,
    openedAt: row.review_created_at,
    mode: row.mode,
    orderStatus: row.order_status,
    placedAt: row.placed_at,
    deliveryDate: row.delivery_date,
    cityName: row.city_name,
    countryIso2: row.country_iso2,
    destinationZone: row.dest_zone,
    totalMinor: row.total_minor,
    currency: row.currency,
    score: row.score,
    signals: RiskSignalsV1Schema.catch([]).parse(row.signals),
    rulesVersion: row.rules_version,
    assessedAt: row.assessed_at,
    radarRiskLevel: row.radar_risk_level,
    radarRiskScore: row.radar_risk_score,
    radarOutcome: row.radar_outcome,
    liabilityShift: row.liability_shift,
  };
}

/** The open reviews, soonest deadline first (no deadline last). */
export async function listOpenReviews(
  executor: OrderExecutor,
): Promise<ReviewView[]> {
  const rows = await executor.execute(sql`
    ${SELECT}
    WHERE r.status = 'open'
    ORDER BY r.deadline_at ASC NULLS LAST, r.created_at, r.id`);
  return rows.map(view);
}

/** The reviews decided in the last `DECIDED_WINDOW_DAYS`, newest first. */
export async function listDecidedReviews(
  executor: OrderExecutor,
  now: Date,
): Promise<ReviewView[]> {
  const since = new Date(now.getTime() - DECIDED_WINDOW_DAYS * DAY_MS);
  const rows = await executor.execute(sql`
    ${SELECT}
    WHERE r.status <> 'open' AND r.decided_at >= ${since.toISOString()}::timestamptz
    ORDER BY r.decided_at DESC, r.id`);
  return rows.map(view);
}

/** One review, or `null`. */
export async function reviewDetail(
  executor: OrderExecutor,
  reviewId: string,
): Promise<ReviewView | null> {
  const id = z.uuid().safeParse(reviewId);
  if (!id.success) return null;
  const [row] = await executor.execute(sql`${SELECT} WHERE r.id = ${id.data}`);
  return row === undefined ? null : view(row);
}

/** The buyer's email and name, for a session with `orders.view_pii` only (the caller logs it). */
export async function reviewBuyer(
  executor: OrderExecutor,
  orderId: string,
): Promise<{ readonly email: string; readonly name: string } | null> {
  const [row] = await executor.execute(sql`
    SELECT buyer_snapshot FROM "order" WHERE id = ${orderId}`);
  const buyer = BuyerSnapshotSchema.safeParse(row?.["buyer_snapshot"]);
  return buyer.success
    ? { email: buyer.data.email, name: buyer.data.name }
    : null;
}

/** How many reviews are open (the navigation's count). */
export async function openReviewCount(
  executor: OrderExecutor,
): Promise<number> {
  const [row] = await executor.execute(sql`
    SELECT count(*)::int AS n FROM risk_review WHERE status = 'open'`);
  return z
    .number()
    .int()
    .parse(row?.["n"] ?? 0);
}

/** The order page's Risk panel: its last assessment and its open or last review. */
export interface RiskPanelView {
  readonly assessment: {
    readonly score: number;
    readonly decision: "pass" | "hold" | "cancel";
    readonly enforced: boolean;
    readonly rulesVersion: number;
    readonly at: Date;
  } | null;
  readonly review: ReviewView | null;
}

const PanelRow = z.object({
  score: z.number().int(),
  decision: z.enum(["pass", "hold", "cancel"]),
  enforced: z.boolean(),
  rules_version: z.number().int(),
  created_at: date,
});

export async function riskPanelFor(
  executor: OrderExecutor,
  orderId: string,
): Promise<RiskPanelView> {
  const [assessment] = await executor.execute(sql`
    SELECT score::int AS score, decision, enforced, rules_version, created_at
    FROM risk_assessment WHERE order_id = ${orderId}
    ORDER BY created_at DESC, id DESC LIMIT 1`);
  const [review] = await executor.execute(sql`
    ${SELECT}
    WHERE r.order_id = ${orderId}
    ORDER BY (r.status = 'open') DESC, r.created_at DESC, r.id DESC
    LIMIT 1`);
  const parsed = assessment === undefined ? null : PanelRow.parse(assessment);
  return {
    assessment:
      parsed === null
        ? null
        : {
            score: parsed.score,
            decision: parsed.decision,
            enforced: parsed.enforced,
            rulesVersion: parsed.rules_version,
            at: parsed.created_at,
          },
    review: review === undefined ? null : view(review),
  };
}

/** The signals a queue row shows: holds and decisive first, then by points; at most `n`. */
export function topSignals(signals: RiskSignals, n = 3): RiskSignals {
  const weight = (id: RiskSignals[number]["id"]): number =>
    RISK_SIGNALS[id].kind === "points" ? 0 : 1;
  return [...signals]
    .sort((a, b) => weight(b.id) - weight(a.id) || b.points - a.points)
    .slice(0, n);
}
