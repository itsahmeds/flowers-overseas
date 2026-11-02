/**
 * The no-partner path's shared reads (spec 016 §5.2 "Jobs" `order.no_partner_expire`, "The
 * `routing` outbox handler"; §13 O-3 ruling; AC-11, AC-12; TASK-329).
 *
 * **No charged order may wait without an end.** Every write of `order.no_partner_available` (the
 * router's exhaustion, and the `routing` handler with `routing.auto` off) schedules
 * `order.no_partner_expire` at `graceEnd` in the same transaction, through
 * `scheduleNoPartnerExpiry`. The instant is computed from the **order's latest
 * `order.no_partner_available` event** (its `occurred_at` is `exhaustedAt`), the delivery date
 * and the destination, so the expiry job, the founder's A1 email (`graceEnd` of the same event)
 * and the admin panel cannot disagree.
 *
 * `routingAutoOn` reads `routing.auto` for the order's destination inside the caller's
 * transaction (not through `src/lib/flags.ts`'s 60 s cache), so a flip in admin applies to the
 * next paid order at once: the `country` scope row if one exists, else the flag's default. A
 * database with no `routing.auto` row reads as on, the registry's default.
 *
 * Reads only ids, dates, zones and a flag: no name, address or postcode.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OrderExecutor } from "../service/executor";

import type { RoutingScheduler } from "./schedule";
import { graceEnd, type RoutingDestination } from "./windows";

const Instant = z.union([z.date(), z.string()]).transform((value, ctx) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "not an instant" });
    return z.NEVER;
  }
  return date;
});

const ExhaustionRow = z.object({
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  iana_zone: z.string().min(1),
  same_day_cutoff_local: z
    .string()
    .regex(/^\d{2}:\d{2}$/u)
    .nullable(),
  exhausted_at: Instant.nullable(),
});

/** When an order entered `no_partner_available` and the destination its grace end is read in. */
export interface Exhaustion {
  /** The latest `order.no_partner_available` event's time; null when there is none. */
  readonly exhaustedAt: Date | null;
  readonly deliveryDate: string;
  /** Null when the destination has no agreed operations (no same-day cutoff). */
  readonly destination: RoutingDestination | null;
}

/** The order's latest exhaustion; undefined when the order does not exist. */
export async function readExhaustion(
  executor: OrderExecutor,
  orderId: string,
): Promise<Exhaustion | undefined> {
  const [row] = await executor.execute(sql`
    SELECT o.delivery_date::text AS delivery_date,
           coalesce(ci.iana_zone, c.iana_zone) AS iana_zone,
           to_char(c.same_day_cutoff_local, 'HH24:MI') AS same_day_cutoff_local,
           (SELECT max(e.occurred_at) FROM order_event e
            WHERE e.order_id = o.id AND e.type = 'order.no_partner_available') AS exhausted_at
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    WHERE o.id = ${orderId}`);
  if (row === undefined) return undefined;
  const parsed = ExhaustionRow.parse(row);
  return {
    exhaustedAt: parsed.exhausted_at,
    deliveryDate: parsed.delivery_date,
    destination:
      parsed.same_day_cutoff_local === null
        ? null
        : {
            ianaZone: parsed.iana_zone,
            sameDayCutoffLocal: parsed.same_day_cutoff_local,
          },
  };
}

/** `graceEnd` of an exhaustion, or null when it has no exhaustion time or no destination. */
export function graceEndOf(exhaustion: Exhaustion): Date | null {
  if (exhaustion.exhaustedAt === null || exhaustion.destination === null) {
    return null;
  }
  return graceEnd(
    exhaustion.exhaustedAt,
    exhaustion.deliveryDate,
    exhaustion.destination,
  );
}

/**
 * Schedules `order.no_partner_expire` at the order's `graceEnd`, inside the caller's transaction
 * (before its commit, as every routing enqueue is). Returns the instant, or null when none can be
 * computed (a destination with no cutoff: the caller logs it; spec 009 does not open such a
 * country for orders).
 */
export async function scheduleNoPartnerExpiry(
  executor: OrderExecutor,
  orderId: string,
  schedule: RoutingScheduler,
): Promise<Date | null> {
  const exhaustion = await readExhaustion(executor, orderId);
  if (exhaustion === undefined) return null;
  const at = graceEndOf(exhaustion);
  if (at === null) return null;
  await schedule([
    { name: "order.no_partner_expire", orderId, startAfter: at },
  ]);
  return at;
}

const FlagRow = z.object({ enabled: z.boolean().nullable() });

/**
 * `routing.auto` for the order's destination country, read in the caller's transaction: the
 * `country` scope row if one exists, else the flag's default; no flag row reads as on.
 */
export async function routingAutoOn(
  executor: OrderExecutor,
  orderId: string,
): Promise<boolean> {
  const [row] = await executor.execute(sql`
    SELECT coalesce(
             (SELECT s.enabled FROM feature_flag_scope s
              WHERE s.flag_key = f.key AND s.scope = 'country' AND s.scope_ref = c.iso2),
             f.enabled_default) AS enabled
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    CROSS JOIN feature_flag f
    WHERE o.id = ${orderId} AND f.key = 'routing.auto'`);
  if (row === undefined) return true;
  return FlagRow.parse(row).enabled !== false;
}
