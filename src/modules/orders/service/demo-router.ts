/**
 * `demoRoute(orderId, opts?)` — the demo's routing (spec 010 §2 "A demo order walks the real
 * arrows", §5.2; AC-20; TASK-202).
 *
 * `demo` and `test` orders only; a `live` order is refused (`DEMO_ROUTE_LIVE_ORDER`) — real
 * routing with SLAs, capacity and re-offers is spec 016's. The florist is:
 *
 *   1. `opts.partnerId`, when spec 011's `placeDemoOrder` names one (it must be a `demo` florist);
 *   2. else the first `demo` florist, by code, covering the order's postcode zone (the longest
 *      matching prefix of `postcode_zone` in the destination country);
 *   3. else the first `demo` florist, by code, in the destination country.
 *
 * The florist is chosen before anything is written (`DEMO_ROUTE_NO_PARTNER` writes nothing).
 * Then, in the same transaction: `order.routed` through `transition` by `system:demo_router`,
 * one `order_assignment` with the 60-minute answer window of `plan/06` §5.2, and
 * `assignment.offered` through `appendEvent` (`from_status = to_status = 'routed'`, so `0008`'s
 * status trigger is not involved). `0008`'s `ASSIGNMENT_MODE_MISMATCH` trigger is the database's
 * second line: a demo order can never reach an `active` florist.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { DEMO_ROUTER_ACTOR } from "./actor";
import { appendEventWith } from "./append-event";
import { OrderEngineError } from "./errors";
import { withExecutor, type OrderExecutor } from "./executor";
import type { OutboxTargetResolver } from "./outbox";
import { transitionWith, type EngineOptions } from "./transition";

/** `plan/06` §5.2: a florist has 60 minutes to answer an offer. */
export const ANSWER_WINDOW_MINUTES = 60;

export const DemoRouteOptionsSchema = z
  .object({ partnerId: z.uuid().optional() })
  .strict();

export interface DemoRouteOptions extends EngineOptions {
  readonly partnerId?: string;
}

export interface DemoRouteResult {
  readonly assignmentId: string;
  readonly partnerId: string;
}

const OrderRow = z.object({
  mode: z.enum(["demo", "test", "live"]),
  destination_country_id: z.uuid(),
  destination_postcode: z.string().nullable(),
});
const IdRow = z.object({ id: z.uuid() });
const AssignmentRow = z.object({
  id: z.uuid(),
  attempt: z.coerce.number().int().positive(),
});

async function pickPartner(
  executor: OrderExecutor,
  order: z.infer<typeof OrderRow>,
  partnerId: string | undefined,
  orderId: string,
): Promise<string> {
  if (partnerId !== undefined) {
    const [named] = await executor.execute(sql`
      SELECT id FROM fulfillment_partner WHERE id = ${partnerId} AND status = 'demo'`);
    if (named === undefined) {
      throw new OrderEngineError("DEMO_ROUTE_PARTNER_INVALID", {
        orderId,
        event: "order.routed",
      });
    }
    return IdRow.parse(named).id;
  }
  if (order.destination_postcode !== null) {
    const [byZone] = await executor.execute(sql`
      SELECT p.id
      FROM postcode_zone z
      JOIN partner_coverage c ON c.postcode_zone_id = z.id
      JOIN fulfillment_partner p ON p.id = c.partner_id
      WHERE z.country_id = ${order.destination_country_id}
        AND starts_with(upper(${order.destination_postcode}), z.prefix)
        AND p.status = 'demo'
      ORDER BY length(z.prefix) DESC, p.code
      LIMIT 1`);
    if (byZone !== undefined) return IdRow.parse(byZone).id;
  }
  const [byCountry] = await executor.execute(sql`
    SELECT id FROM fulfillment_partner
    WHERE country_id = ${order.destination_country_id} AND status = 'demo'
    ORDER BY code
    LIMIT 1`);
  if (byCountry === undefined) {
    throw new OrderEngineError("DEMO_ROUTE_NO_PARTNER", {
      orderId,
      event: "order.routed",
    });
  }
  return IdRow.parse(byCountry).id;
}

export async function demoRouteWith(
  executor: OrderExecutor,
  orderId: string,
  options: { readonly partnerId?: string } = {},
  resolver?: OutboxTargetResolver,
): Promise<DemoRouteResult> {
  const opts = DemoRouteOptionsSchema.parse(
    options.partnerId === undefined ? {} : { partnerId: options.partnerId },
  );
  if (!z.uuid().safeParse(orderId).success) {
    throw new OrderEngineError("ORDER_NOT_FOUND", { event: "order.routed" });
  }
  const [row] = await executor.execute(sql`
    SELECT mode, destination_country_id, destination_postcode
    FROM "order" WHERE id = ${orderId} FOR UPDATE`);
  if (row === undefined) {
    throw new OrderEngineError("ORDER_NOT_FOUND", {
      orderId,
      event: "order.routed",
    });
  }
  const order = OrderRow.parse(row);
  if (order.mode === "live") {
    throw new OrderEngineError("DEMO_ROUTE_LIVE_ORDER", {
      orderId,
      event: "order.routed",
    });
  }
  const partnerId = await pickPartner(executor, order, opts.partnerId, orderId);

  await transitionWith(
    executor,
    orderId,
    "order.routed",
    DEMO_ROUTER_ACTOR,
    { mode: order.mode, partnerId },
    resolver,
  );

  const [assignment] = await executor.execute(sql`
    INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at, attempt)
    SELECT ${orderId}, ${partnerId}, now(),
           now() + make_interval(mins => ${ANSWER_WINDOW_MINUTES}),
           coalesce(max(a.attempt), 0) + 1
    FROM order_assignment a WHERE a.order_id = ${orderId}
    RETURNING id, attempt`);
  const offered = AssignmentRow.parse(assignment);

  await appendEventWith(
    executor,
    orderId,
    "assignment.offered",
    DEMO_ROUTER_ACTOR,
    {
      mode: order.mode,
      assignmentId: offered.id,
      partnerId,
      attempt: offered.attempt,
      answerWindowMinutes: ANSWER_WINDOW_MINUTES,
    },
    resolver,
  );
  return { assignmentId: offered.id, partnerId };
}

/** `demoRoute(orderId, opts?: { partnerId })` (§5.2). */
export async function demoRoute(
  orderId: string,
  options: DemoRouteOptions = {},
): Promise<DemoRouteResult> {
  return withExecutor(options, "orders.demo_route", (executor) =>
    demoRouteWith(
      executor,
      orderId,
      options.partnerId === undefined ? {} : { partnerId: options.partnerId },
      options.outboxTargets,
    ),
  );
}
