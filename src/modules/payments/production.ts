/**
 * Production starts on the delivery morning (spec 013 §5.2 "Production start on the delivery
 * morning"; spec 002 §14 A10.1; the founder's "2 B" of 2026-10-14; AC-44, AC-45; TASK-258).
 *
 * An order a florist accepted days ahead stays `paid` ("confirmed" to the buyer, who may still
 * cancel for free, rows 39 and 40) until 06:00 destination-local on its delivery date. Then:
 *
 *  - `productionStartAt(order)`: that instant, computed in the destination's zone
 *    (`city.iana_zone`, else `country.iana_zone`), from `PRODUCTION_START_LOCAL_TIME`. Pure; both
 *    DST nights give 06:00 local, because the wall clock is read in the zone, never offset by a
 *    fixed number of hours.
 *  - `runProductionStart()` (`payments.production_start`, every minute): each `test` or `live`
 *    order in `paid` whose instant has passed is locked `FOR UPDATE SKIP LOCKED`, re-read under
 *    the lock, and given row 16 (`order.in_production`) by `system:payments.production_start`
 *    through spec 010's engine (ADR-0009). An order locked by a concurrent cancel is skipped this
 *    tick and found `cancelled` on the next; one the job locked first refuses the cancel with
 *    `ORDER_TRANSITION_ILLEGAL` (AC-45). `demo` orders are never touched (spec 011's demo effect).
 *  - `startProduction(orderId, actor)`: the same write for one order, refused with
 *    `PRODUCTION_NOT_DUE` before the delivery date has begun in the destination's zone. Spec 011's
 *    dispatch command calls it in its own transaction (TASK-259 wires it).
 *
 * Logs carry ids and counts only.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { PRODUCTION_START_LOCAL_TIME } from "@/config/orders";
import { logger } from "@/lib/logger";
import { zonedClock } from "@/modules/i18n";
import {
  isOrderEngineError,
  transition,
  withExecutor,
  type EngineConnection,
  type OrderErrorCode,
  type OrderExecutor,
} from "@/modules/orders";

import "./events";
import type { PaymentTransaction } from "./context.ts";

/** The job's actor, and the one spec 011's dispatch command passes (spec 013 §12). */
export const PRODUCTION_START_ACTOR = "system:payments.production_start";

const LOCAL_TIME = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/u;
const ISO_DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

/** What `productionStartAt` reads from an order: its delivery date and its destination's zone. */
export interface ProductionTiming {
  /** `order.delivery_date`, `YYYY-MM-DD`. */
  readonly deliveryDate: string;
  /** `city.iana_zone` of the destination city, else `country.iana_zone`. */
  readonly zone: string;
}

function wallClockMs(instant: Date, zone: string): number {
  const clock = zonedClock(instant, zone);
  return Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
}

/**
 * The production-start instant: `localTime` (default `PRODUCTION_START_LOCAL_TIME`) on
 * `deliveryDate` in `zone`. Throws a `RangeError` for a malformed date or time, or for a local
 * time that does not exist that day in that zone (a DST gap: never 06:00 in Europe).
 */
export function productionStartAt(
  order: ProductionTiming,
  localTime: string = PRODUCTION_START_LOCAL_TIME,
): Date {
  const date = ISO_DATE.exec(order.deliveryDate)?.groups;
  const time = LOCAL_TIME.exec(localTime)?.groups;
  if (date === undefined || time === undefined) {
    throw new RangeError("productionStartAt: malformed date or local time");
  }
  // The wall clock we want, written as if it were UTC; then remove the zone's offset at that
  // moment. Two passes settle the offset on both sides of a DST change.
  const target = Date.UTC(
    Number(date["year"]),
    Number(date["month"]) - 1,
    Number(date["day"]),
    Number(time["hour"]),
    Number(time["minute"]),
  );
  let instant = target;
  for (let pass = 0; pass < 3; pass += 1) {
    const offset = wallClockMs(new Date(instant), order.zone) - instant;
    instant = target - offset;
  }
  if (wallClockMs(new Date(instant), order.zone) !== target) {
    throw new RangeError(
      "productionStartAt: the local time does not exist that day",
    );
  }
  return new Date(instant);
}

/** True once the delivery date has begun in the destination's zone (`startProduction`'s rule). */
function deliveryDayBegun(order: ProductionTiming, now: Date): boolean {
  const clock = zonedClock(now, order.zone);
  const today = `${String(clock.year).padStart(4, "0")}-${String(clock.month).padStart(2, "0")}-${String(clock.day).padStart(2, "0")}`;
  return today >= order.deliveryDate;
}

const TimingRow = z.object({
  id: z.uuid(),
  status: z.string().min(1),
  mode: z.enum(["demo", "test", "live"]),
  delivery_date: z.string().regex(ISO_DATE),
  zone: z.string().min(1),
});
type Timing = z.infer<typeof TimingRow>;

/** The order's status, mode and timing; `lock` takes the row lock (`skip` skips a locked row). */
async function readTiming(
  executor: OrderExecutor,
  orderId: string,
  lock: "none" | "wait" | "skip",
): Promise<Timing | null> {
  const [row] = await executor.execute(sql`
    SELECT o.id, o.status, o.mode, o.delivery_date::text AS delivery_date,
           coalesce(ci.iana_zone, co.iana_zone) AS zone
    FROM "order" o
    JOIN country co ON co.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    WHERE o.id = ${orderId}
    ${lock === "wait" ? sql`FOR UPDATE OF o` : lock === "skip" ? sql`FOR UPDATE OF o SKIP LOCKED` : sql``}`);
  return row === undefined ? null : TimingRow.parse(row);
}

const timingOf = (row: Timing): ProductionTiming => ({
  deliveryDate: row.delivery_date,
  zone: row.zone,
});

// ---------------------------------------------------------------------------------------------
// startProduction
// ---------------------------------------------------------------------------------------------

export type StartProductionResult =
  | { readonly kind: "started"; readonly eventId: string; readonly seq: number }
  | {
      readonly kind: "refused";
      readonly code:
        | "PRODUCTION_NOT_DUE"
        | Extract<
            OrderErrorCode,
            | "ORDER_NOT_FOUND"
            | "ORDER_TRANSITION_ILLEGAL"
            | "ORDER_ACTOR_NOT_ALLOWED"
            | "ORDER_ACTOR_INVALID"
          >;
    };

export interface StartProductionOptions extends EngineConnection {
  readonly now?: () => Date;
}

const REFUSALS = [
  "ORDER_NOT_FOUND",
  "ORDER_TRANSITION_ILLEGAL",
  "ORDER_ACTOR_NOT_ALLOWED",
  "ORDER_ACTOR_INVALID",
] as const;

/**
 * Writes row 16 for one `paid` order on its delivery date, in the caller's transaction when it
 * passes one (spec 011's dispatch). Refused with `PRODUCTION_NOT_DUE` before the date has begun
 * in the destination's zone; any other state is the engine's refusal, passed through.
 */
export async function startProduction(
  orderId: string,
  actor: string,
  options: StartProductionOptions = {},
): Promise<StartProductionResult> {
  const id = z.uuid().parse(orderId);
  const now = (options.now ?? (() => new Date()))();
  return withExecutor(
    options,
    "payments.production_start",
    async (executor) => {
      const row = await readTiming(executor, id, "wait");
      if (row === null) return { kind: "refused", code: "ORDER_NOT_FOUND" };
      if (!deliveryDayBegun(timingOf(row), now)) {
        return { kind: "refused", code: "PRODUCTION_NOT_DUE" };
      }
      try {
        const written = await transition(
          id,
          "order.in_production",
          actor,
          { mode: row.mode },
          { executor },
        );
        return { kind: "started", eventId: written.eventId, seq: written.seq };
      } catch (error) {
        for (const code of REFUSALS) {
          if (isOrderEngineError(error, code)) return { kind: "refused", code };
        }
        throw error;
      }
    },
  );
}

// ---------------------------------------------------------------------------------------------
// payments.production_start
// ---------------------------------------------------------------------------------------------

export interface ProductionStartDeps {
  /** Defaults to a fresh `system` transaction per order. */
  readonly transaction?: PaymentTransaction;
  readonly now?: () => Date;
}

export interface ProductionStartCounts {
  /** Orders given row 16 this tick. */
  readonly started: number;
  /** Due orders left alone: locked by a concurrent write, or no longer `paid` under the lock. */
  readonly skipped: number;
}

const systemTransaction: PaymentTransaction = (fn) =>
  withExecutor(undefined, "payments.production_start", fn);

/** One tick of `payments.production_start`. Idempotent: a second tick finds nothing `paid`. */
export async function runProductionStart(
  deps: ProductionStartDeps = {},
): Promise<ProductionStartCounts> {
  const transaction = deps.transaction ?? systemTransaction;
  const now = (deps.now ?? (() => new Date()))();

  // Every zone is within a day of UTC, so no due order has a delivery date after tomorrow (UTC);
  // the exact instant is decided below, in the order's own zone.
  const candidates = await transaction(async (executor) => {
    const rows = await executor.execute(sql`
      SELECT o.id, o.status, o.mode, o.delivery_date::text AS delivery_date,
             coalesce(ci.iana_zone, co.iana_zone) AS zone
      FROM "order" o
      JOIN country co ON co.id = o.destination_country_id
      LEFT JOIN city ci ON ci.id = o.destination_city_id
      WHERE o.status = 'paid' AND o.mode IN ('test', 'live')
        AND o.delivery_date <= (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date + 1
      ORDER BY o.delivery_date, o.id`);
    return rows.map((row) => TimingRow.parse(row));
  });
  const due = candidates.filter(
    (row) => productionStartAt(timingOf(row)).getTime() <= now.getTime(),
  );

  let started = 0;
  let skipped = 0;
  for (const candidate of due) {
    const wrote = await transaction(async (executor) => {
      const row = await readTiming(executor, candidate.id, "skip");
      if (row?.status !== "paid" || row.mode === "demo") return false;
      await transition(
        row.id,
        "order.in_production",
        PRODUCTION_START_ACTOR,
        { mode: row.mode },
        { executor },
      );
      return true;
    });
    if (wrote) started += 1;
    else skipped += 1;
  }
  logger.info(
    { started, skipped, at: now.toISOString() },
    "payments.production_start",
  );
  return { started, skipped };
}
