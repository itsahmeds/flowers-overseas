/**
 * The buyer's tracking view model (spec 018 §5.2 "`modules/orders`, read projections", AC-3 to
 * AC-6, AC-41; TASK-338).
 *
 * `getTrackingView(orderId)` is the one read behind `/{locale}/track/{token}`, its photo route and
 * its calendar file. It returns `TrackingView`, a `.strict()` allowlist (AC-4): the order's
 * reference, the folded buyer step, the five-step timeline, the delivery date and city, the florist
 * card once the order is being made, the substitution note, the photo state and the demo flag. No
 * recipient name, phone, street, postcode, card message or buyer email is read here, so none can
 * reach the page.
 *
 * **The buyer projection is read from the database**, `order_status.buyer_projection` for the
 * current status and for every event's `to_status`, never from a copy in code. Only the fold is
 * code: `buyerStep` maps `with_florist` to `confirmed` (founder ruling 2026-10-14, spec 002 §14
 * A9.1), so an `accepted` or `paid` order reads "We have your order" until production starts.
 *
 * **No assignment, offer, decline, timeout or re-route reaches the view (AC-41).** The timeline is
 * a fold of each event's `to_status` projection: an event that keeps the status, or moves it
 * between internal statuses of one projection, changes nothing a buyer sees. No event type is read;
 * the entry into `cancelled` or `cancelled_refunded` is read for its actor class and reason and
 * nothing else. The florist card reads the partner of the order's accepted
 * `order_assignment` row, and only once the history holds a production event (AC-5).
 *
 * **Refunds and the cancelled state (TASK-339; AC-10, AC-42).** `refundLines` comes from the
 * caller's `refundLines` source, `buyerRefundLines` (`./buyer-refund-lines.ts`, over spec 013's
 * `succeededRefunds`), handed in so this barrel-exported file never imports `payments`: one line
 * per succeeded refund, in every state, dated by `refund.succeeded_at`. On a cancelled order, `cancelledBy` is `buyer` when the
 * latest cancellation was the buyer's own, or an admin's with reason `buyer_cancel` (spec 020a
 * request 3), and `us` for every other actor, whatever the cause; `refundPending` is the sum of
 * the order's `requested` and `pending` refunds, so "We are refunding {amount}" shows until the
 * refund succeeds and its dated line takes its place. An order that never took money
 * (`payment_failed`, `abandoned`) has no cancellation event and no refund, so neither appears.
 *
 * Nothing here logs an order id, a token or an order's data (spec 018 §8).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  BuyerRefundLineSchema,
  CurrencyCodeSchema,
  type RefundLinesSource,
} from "./refund-lines";
import { type EngineConnection, withExecutor } from "./service/executor";
import { ORDER_REFERENCE_PATTERN, orderReference } from "./service/reference";

/** The buyer's seven keys after the fold (spec 018 §5.2, §7). */
export const BUYER_STEPS = [
  "placed",
  "confirmed",
  "being_made",
  "on_its_way",
  "delivered",
  "closed",
  "cancelled",
] as const;
export const BuyerStepSchema = z.enum(BUYER_STEPS);
export type BuyerStep = z.infer<typeof BuyerStepSchema>;

/** The five timeline steps, in order (`placed` is a headline, not a step). */
export const TIMELINE_STEPS = [
  "confirmed",
  "being_made",
  "on_its_way",
  "delivered",
  "closed",
] as const;
export const TimelineStepKeySchema = z.enum(TIMELINE_STEPS);
export type TimelineStepKey = z.infer<typeof TimelineStepKeySchema>;

/** The stored projections `order_status.buyer_projection` allows (spec 002 §14 A6.4). */
const StoredProjectionSchema = z.enum([...BUYER_STEPS, "with_florist"]);

/**
 * Folds a stored `buyer_projection` into the buyer's key: `with_florist` reads `confirmed`, every
 * other value is itself. Throws on a value the `CHECK` does not allow.
 */
export function buyerStep(projection: string): BuyerStep {
  const stored = StoredProjectionSchema.parse(projection);
  return stored === "with_florist" ? "confirmed" : stored;
}

export const TimelineStepSchema = z
  .object({
    step: TimelineStepKeySchema,
    state: z.enum(["done", "current", "future"]),
    /** The first event that reached the step; `null` for a future step. */
    at: z.date().nullable(),
  })
  .strict();
export type TimelineStep = z.infer<typeof TimelineStepSchema>;

export const TimelineSchema = z
  .object({
    /** The destination's IANA zone: every time on the page is printed in it. */
    timeZone: z.string().min(1),
    steps: z.array(TimelineStepSchema).max(TIMELINE_STEPS.length),
    /** The first entry into a cancelled-projection status, when the order reads `cancelled`. */
    cancelledAt: z.date().nullable(),
  })
  .strict();
export type Timeline = z.infer<typeof TimelineSchema>;

export const PhotoStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("available"), takenAt: z.date() }).strict(),
  z.object({ kind: z.literal("deleted"), deletedOn: z.date() }).strict(),
]);
export type PhotoState = z.infer<typeof PhotoStateSchema>;

const MinorAmountSchema = z
  .object({
    amountMinor: z.number().int().positive(),
    currencyCode: CurrencyCodeSchema,
  })
  .strict();

export const CancelledBySchema = z.enum(["buyer", "us"]);
export type CancelledBy = z.infer<typeof CancelledBySchema>;

/** The cancellation reason that reads as the buyer's own when an admin records it (spec 020a). */
const BUYER_CANCEL_REASON = "buyer_cancel";

/**
 * Who the buyer is told cancelled the order (spec 018 §5.2 "Cancelled"; spec 020a request 3):
 * `buyer` for the buyer's own cancellation, or an admin's made with reason `buyer_cancel` (the
 * buyer asked us); `us` for every other actor and reason, an unknown one included.
 */
export function cancelledByOf(
  actor: string,
  reason: string | null,
): CancelledBy {
  // The class is the actor's head, as `order_event_actor_check` stores it (`buyer`, `admin:…`).
  const actorKind = actor.split(":", 1)[0];
  if (actorKind === "buyer") return "buyer";
  if (actorKind === "admin" && reason === BUYER_CANCEL_REASON) return "buyer";
  return "us";
}

/** The AC-4 allowlist, key for key. An added key fails the parse. */
export const TrackingViewSchema = z
  .object({
    reference: z.string().regex(ORDER_REFERENCE_PATTERN),
    projection: BuyerStepSchema,
    timeline: TimelineSchema,
    /** One per succeeded refund, oldest first (`buyerRefundLines`). */
    refundLines: z.array(BuyerRefundLineSchema),
    /** A cancelled order's open refund (`requested` or `pending`), until it succeeds. */
    refundPending: MinorAmountSchema.nullable(),
    /** Who the buyer is told cancelled: themselves, or us. `null` unless cancelled. */
    cancelledBy: CancelledBySchema.nullable(),
    deliveryDate: z.iso.date(),
    destinationCity: z.string().min(1).nullable(),
    floristFirstName: z.string().min(1).nullable(),
    floristCity: z.string().min(1).nullable(),
    substitution: z.string().min(1).nullable(),
    photoState: PhotoStateSchema,
    canShare: z.boolean(),
    demo: z.enum(["demo", "test"]).nullable(),
  })
  .strict();
export type TrackingView = z.infer<typeof TrackingViewSchema>;

/** The allowlist's keys, for the AC-4 test and nothing else. */
export const TRACKING_VIEW_KEYS = Object.keys(TrackingViewSchema.shape);

/** One status-changing event, as the fold reads it. */
export interface ProjectedEvent {
  readonly projection: string;
  readonly occurredAt: Date;
}

const RANK: Readonly<Record<TimelineStepKey, number>> = {
  confirmed: 0,
  being_made: 1,
  on_its_way: 2,
  delivered: 3,
  closed: 4,
};

function isTimelineStep(step: BuyerStep): step is TimelineStepKey {
  return (TIMELINE_STEPS as readonly string[]).includes(step);
}

/**
 * The timeline of a history (events in `seq` order) whose current projection is `current`
 * (spec 018 §5.2 "Timeline steps"). A step up to and including the current one is done or current,
 * dated at the first event that reached it; a later step is future and undated, even when an
 * earlier event reached it (a `closed` order that is then disputed reads `delivered` current and
 * `closed` future). A cancelled order lists the steps it reached, all done, and ends with the dated
 * cancelled line. Pure: no clock, no zone.
 */
export function foldTimeline(
  events: readonly ProjectedEvent[],
  current: string,
  timeZone: string,
): Timeline {
  const now = buyerStep(current);
  const firstEntry = new Map<BuyerStep, Date>();
  for (const event of events) {
    const step = buyerStep(event.projection);
    if (!firstEntry.has(step)) firstEntry.set(step, event.occurredAt);
  }
  if (now === "cancelled") {
    const reached = TIMELINE_STEPS.filter((step) => firstEntry.has(step));
    const last = Math.max(-1, ...reached.map((step) => RANK[step]));
    return {
      timeZone,
      steps: TIMELINE_STEPS.filter((step) => RANK[step] <= last).map(
        (step) => ({ step, state: "done", at: firstEntry.get(step) ?? null }),
      ),
      cancelledAt: firstEntry.get("cancelled") ?? null,
    };
  }
  const position = isTimelineStep(now) ? RANK[now] : -1;
  return {
    timeZone,
    steps: TIMELINE_STEPS.map((step) => {
      const rank = RANK[step];
      if (rank > position) return { step, state: "future", at: null };
      return {
        step,
        state: rank === position ? "current" : "done",
        at: firstEntry.get(step) ?? null,
      };
    }),
    cancelledAt: null,
  };
}

const OrderRow = z.object({
  mode: z.enum(["demo", "test", "live"]),
  delivery_date: z.iso.date(),
  city: z.string().nullable(),
  projection: z.string(),
  zone: z.string().min(1),
});

const EventRow = z.object({
  projection: z.string(),
  occurred_at: z.coerce.date(),
});

const CancellationRow = z.object({
  actor: z.string(),
  reason: z.string().nullable(),
});

const PendingRow = z.object({
  amount_minor: z.coerce.number().int().nonnegative(),
  currency_code: CurrencyCodeSchema.nullable(),
});

const FactsRow = z.object({
  in_production: z.boolean(),
  photo_uploaded_at: z.coerce.date().nullable(),
  photo_retention_days: z.coerce.number().int().positive().nullable(),
  photo_taken_at: z.coerce.date().nullable(),
  florist_first_name: z.string().nullable(),
  florist_city: z.string().nullable(),
  substitution: z.string().nullable(),
});

/** A trimmed, non-empty string, or `null`. */
function text(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

const DAY_MS = 86_400_000;

/** What `getTrackingView` reads with: the connection, and where the refund lines come from. */
export interface TrackingViewOptions extends EngineConnection {
  /** `buyerRefundLines` (`./buyer-refund-lines.ts`) in production. */
  readonly refundLines: RefundLinesSource;
}

/** The tracking view of an order. Throws when the order does not exist. */
export async function getTrackingView(
  orderId: string,
  options: TrackingViewOptions,
): Promise<TrackingView> {
  const id = z.uuid().parse(orderId);
  return withExecutor(options, "orders.tracking_view", async (executor) => {
    const [orderRaw] = await executor.execute(sql`
      SELECT o.mode, o.delivery_date::text AS delivery_date,
             nullif(btrim(o.recipient_snapshot ->> 'city'), '') AS city,
             s.buyer_projection AS projection,
             coalesce(ci.iana_zone, c.iana_zone) AS zone
      FROM "order" o
      JOIN order_status s ON s.key = o.status
      JOIN country c ON c.id = o.destination_country_id
      LEFT JOIN city ci ON ci.id = o.destination_city_id
      WHERE o.id = ${id}`);
    if (orderRaw === undefined) throw new Error("tracking: no such order");
    const order = OrderRow.parse(orderRaw);

    // Status-changing events only, by their target status's projection: the type is not read.
    const events = (
      await executor.execute(sql`
        SELECT s.buyer_projection AS projection, e.occurred_at
        FROM order_event e
        JOIN order_status s ON s.key = e.to_status
        WHERE e.order_id = ${id}
        ORDER BY e.seq`)
    ).map((row) => EventRow.parse(row));

    const [factsRaw] = await executor.execute(sql`
      SELECT
        EXISTS (SELECT 1 FROM order_event e
                WHERE e.order_id = ${id} AND e.to_status = 'in_production') AS in_production,
        (SELECT min(e.occurred_at) FROM order_event e
          WHERE e.order_id = ${id} AND e.to_status = 'photo_uploaded') AS photo_uploaded_at,
        (SELECT r.retention_days FROM retention_policy r
          WHERE r.key = 'delivery_photo') AS photo_retention_days,
        (SELECT max(p.uploaded_at) FROM delivery_proof p
          WHERE p.order_id = ${id}) AS photo_taken_at,
        f.display_first_name AS florist_first_name,
        f.city_label AS florist_city,
        (SELECT n.proposal_md FROM substitution_note n
          WHERE n.order_id = ${id} AND n.resolution IN ('accepted', 'auto_accepted')
          ORDER BY n.resolved_at DESC, n.created_at DESC LIMIT 1) AS substitution
      FROM (SELECT 1) one
      LEFT JOIN LATERAL (
        SELECT p.display_first_name, p.city_label
        FROM order_assignment a
        JOIN fulfillment_partner p ON p.id = a.partner_id
        WHERE a.order_id = ${id} AND a.response = 'accept'
        ORDER BY a.attempt DESC LIMIT 1
      ) f ON true`);
    const facts = FactsRow.parse(factsRaw);

    const projection = buyerStep(order.projection);
    const refundLines = await options.refundLines(id, { executor });

    let cancelledBy: CancelledBy | null = null;
    let refundPending: z.infer<typeof MinorAmountSchema> | null = null;
    if (projection === "cancelled") {
      // The latest entry into `cancelled` or `cancelled_refunded` (`order.cancelled`, row 13, 39,
      // 40; `order.cancelled_refunded`, row 24), for its actor class and reason only. Found by
      // its status pair, never its type; `payment_failed` and `abandoned` have no such entry.
      const [cancellation] = await executor.execute(sql`
        SELECT e.actor, e.payload ->> 'reason' AS reason
        FROM order_event e
        WHERE e.order_id = ${id}
          AND e.to_status IN ('cancelled', 'cancelled_refunded')
          AND e.from_status IS DISTINCT FROM e.to_status
        ORDER BY e.seq DESC LIMIT 1`);
      if (cancellation !== undefined) {
        const row = CancellationRow.parse(cancellation);
        cancelledBy = cancelledByOf(row.actor, row.reason);
      }
      const [pendingRaw] = await executor.execute(sql`
        SELECT coalesce(sum(r.amount_minor), 0) AS amount_minor,
               min(r.currency_code) AS currency_code
        FROM refund r
        WHERE r.order_id = ${id} AND r.status IN ('requested', 'pending')`);
      const pending = PendingRow.parse(pendingRaw);
      if (pending.amount_minor > 0 && pending.currency_code !== null) {
        refundPending = {
          amountMinor: pending.amount_minor,
          currencyCode: pending.currency_code,
        };
      }
    }
    const florist = facts.in_production;
    const photoState: PhotoState =
      facts.photo_taken_at !== null
        ? { kind: "available", takenAt: facts.photo_taken_at }
        : facts.photo_uploaded_at !== null &&
            facts.photo_retention_days !== null
          ? {
              kind: "deleted",
              deletedOn: new Date(
                facts.photo_uploaded_at.getTime() +
                  facts.photo_retention_days * DAY_MS,
              ),
            }
          : { kind: "none" };

    return TrackingViewSchema.parse({
      reference: orderReference(id),
      projection,
      timeline: foldTimeline(
        events.map((event) => ({
          projection: event.projection,
          occurredAt: event.occurred_at,
        })),
        order.projection,
        order.zone,
      ),
      refundLines,
      refundPending,
      cancelledBy,
      deliveryDate: order.delivery_date,
      destinationCity: order.city,
      floristFirstName: florist ? text(facts.florist_first_name) : null,
      floristCity: florist ? text(facts.florist_city) : null,
      substitution: text(facts.substitution),
      photoState,
      canShare: order.mode === "live",
      demo: order.mode === "live" ? null : order.mode,
    } satisfies TrackingView);
  });
}

/** The newest delivery photo of an order, as a storage location, or `null`. */
export async function trackingPhotoLocation(
  orderId: string,
  options?: EngineConnection,
): Promise<{
  readonly bucket: string;
  readonly objectKey: string;
  readonly mime: string;
} | null> {
  const id = z.uuid().parse(orderId);
  return withExecutor(options, "orders.tracking_photo", async (executor) => {
    const [row] = await executor.execute(sql`
      SELECT a.bucket, a.object_key, a.mime
      FROM delivery_proof p
      JOIN media_asset a ON a.id = p.media_asset_id
      WHERE p.order_id = ${id}
      ORDER BY p.uploaded_at DESC, p.id DESC
      LIMIT 1`);
    if (row === undefined) return null;
    const parsed = z
      .object({ bucket: z.string(), object_key: z.string(), mime: z.string() })
      .parse(row);
    return {
      bucket: parsed.bucket,
      objectKey: parsed.object_key,
      mime: parsed.mime,
    };
  });
}
