/**
 * The one way a test sets an order's state (spec 002 §14 A6.7 (b), spec 001 §14 A20; AC-36,
 * T-37; TASK-020).
 *
 * `0008`'s triggers refuse a status write unless the transaction-local switch
 * `app.allow_status_write = 'on'` and the event `app.transition_event` name a row of
 * `order_transition` for `(old status, event, new status)`. Integration tests are not policed by
 * the `fo/no-direct-order-status-write` lint rule (spec 001 AC-60 (5)), so this file is the
 * documented path instead: it walks the order through **legal rows only**, one transition at a
 * time, exactly as spec 010's `orderService.transition` does — switch and event set with
 * `set_config(…, true)`, one `UPDATE`, both reset to `''`, and the `order_event` row with the next
 * `seq`. It never switches a trigger off, removes or redefines one, and never changes the
 * replication role (`tests/unit/order-integrity.test.ts` scans `tests/` for all four, AC-36).
 *
 * `insertPlacedOrder` is the same idea for creation: spec 010's `orderService.place` is the only
 * writer of `"order"` rows, so a test sets the switch transaction-locally for its one insert and
 * appends `order.placed` at seq 1.
 */
import { randomBytes } from "node:crypto";

import type postgres from "postgres";

type Tx = postgres.TransactionSql;

/** The actor every step is recorded under (`plan/11` §1's `system:{job}` convention). */
export const FIXTURE_ACTOR = "system:test_fixture";

interface Edge {
  readonly from: string;
  readonly event: string;
  readonly to: string;
}

/** Shortest path of `order_transition` rows from `from` to `to`, or undefined if unreachable. */
export function shortestPath(
  edges: readonly Edge[],
  from: string,
  to: string,
): Edge[] | undefined {
  if (from === to) return [];
  const previous = new Map<string, Edge>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const state = queue.shift() as string;
    for (const edge of edges) {
      if (edge.from !== state || edge.to === edge.from || seen.has(edge.to))
        continue;
      seen.add(edge.to);
      previous.set(edge.to, edge);
      if (edge.to === to) {
        const path: Edge[] = [];
        let cursor: string = to;
        while (cursor !== from) {
          const step = previous.get(cursor) as Edge;
          path.unshift(step);
          cursor = step.from;
        }
        return path;
      }
      queue.push(edge.to);
    }
  }
  return undefined;
}

/**
 * Applies one legal transition the way the engine does. Returns nothing; throws what Postgres
 * throws. `occurredAt` sets the event's instant (`order_event` is append-only, so a suite that
 * needs a photo 72 hours ago writes it so; spec 022a T-02); without it, `now()`.
 */
export async function applyTransition(
  tx: Tx,
  orderId: string,
  event: string,
  to: string,
  occurredAt?: Date,
): Promise<void> {
  const [current] = await tx<{ status: string; seq: number | null }[]>`
    SELECT o.status, (SELECT max(seq) FROM order_event e WHERE e.order_id = o.id) AS seq
    FROM "order" o WHERE o.id = ${orderId} FOR UPDATE`;
  if (current === undefined) throw new Error(`no order ${orderId}`);
  await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
  await tx`SELECT set_config('app.transition_event', ${event}, true)`;
  await tx`UPDATE "order" SET status = ${to} WHERE id = ${orderId}`;
  await tx`SELECT set_config('app.allow_status_write', '', true)`;
  await tx`SELECT set_config('app.transition_event', '', true)`;
  await tx`
    INSERT INTO order_event (order_id, seq, type, from_status, to_status, actor, payload,
                             payload_version, occurred_at)
    VALUES (${orderId}, ${(current.seq ?? 0) + 1}, ${event}, ${current.status}, ${to},
            ${FIXTURE_ACTOR}, '{}'::jsonb, 1,
            COALESCE(${occurredAt?.toISOString() ?? null}::timestamptz, now()))`;
}

/**
 * Walks `orderId` from its current status to `target` along the shortest path of rows, and
 * returns the events applied, in order. Throws when `target` is unreachable.
 */
export async function walkOrderTo(
  tx: Tx,
  orderId: string,
  target: string,
): Promise<string[]> {
  const edges = await tx<Edge[]>`
    SELECT from_status AS "from", event, to_status AS "to" FROM order_transition
    ORDER BY from_status, event`;
  const [order] = await tx<{ status: string }[]>`
    SELECT status FROM "order" WHERE id = ${orderId}`;
  if (order === undefined) throw new Error(`no order ${orderId}`);
  const path = shortestPath(edges, order.status, target);
  if (path === undefined) {
    throw new Error(
      `no path of order_transition rows from ${order.status} to ${target}`,
    );
  }
  for (const step of path) {
    await applyTransition(tx, orderId, step.event, step.to);
  }
  return path.map((step) => step.event);
}

export interface PlacedOrder {
  readonly customerId: string;
  readonly recipientId: string;
  readonly countryId: string;
  readonly mode?: "demo" | "test" | "live";
  readonly currencyCode?: string;
  readonly totalMinor?: number;
  /**
   * An existing purchase to join (spec 013 §14 A-founder-2026-10-22, TASK-350): the caller wrote
   * it with the sum of its orders' totals, checked at commit by `purchase_total_check`. Without
   * it the order gets a purchase of its own.
   */
  readonly purchaseId?: string;
}

/**
 * Inserts one `placed` order the way `orderService.place` does, with `order.placed` at seq 1. The
 * token is 16 random bytes as base64url (22 characters), the shape `0021`'s exact check and its
 * column default give (spec 018 AC-2). It is named here, unlike in `place`, because the rollback
 * suites also insert orders into schemas from before `0021`, where the column has no default.
 */
export async function insertPlacedOrder(
  tx: Tx,
  input: PlacedOrder,
): Promise<string> {
  const token = randomBytes(16).toString("base64url");
  const currency = input.currencyCode ?? "PLN";
  const mode = input.mode ?? "demo";
  // Spec 010 §14 A-founder-2026-10-22 (`0019`): every order belongs to a purchase; this one's
  // purchase holds it alone, at its total. A suite rolled back below `0019` has no such table,
  // and its orders have no such column.
  const [has] = await tx<{ purchase: boolean }[]>`
    SELECT to_regclass('public.purchase') IS NOT NULL AS purchase`;
  let purchaseId: string | null = input.purchaseId ?? null;
  if (has?.purchase === true && purchaseId === null) {
    const [purchase] = await tx<{ id: string }[]>`
      INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
      VALUES (${mode}, ${currency}, ${input.totalMinor ?? 18900}, 'en', ${input.customerId})
      RETURNING id`;
    purchaseId = purchase?.id ?? null;
  }
  await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO "order" (public_token, mode, customer_id, recipient_id, destination_country_id,
                         delivery_date, buyer_currency_code, buyer_total_minor,
                         base_currency_code, base_total_minor, terms_version,
                         buyer_snapshot, recipient_snapshot
                         ${purchaseId === null ? tx`` : tx`, purchase_id`})
    VALUES (${token}, ${mode}, ${input.customerId}, ${input.recipientId}, ${input.countryId},
            DATE '2027-02-14', ${currency}, ${input.totalMinor ?? 18900}, ${currency},
            ${input.totalMinor ?? 18900}, ${mode === "live" ? "2026-10" : null},
            '{"name": "Test Buyer"}'::jsonb, '{"city": "Warszawa"}'::jsonb
            ${purchaseId === null ? tx`` : tx`, ${purchaseId}`})
    RETURNING id`;
  await tx`SELECT set_config('app.allow_status_write', '', true)`;
  const id = row?.id ?? "";
  await tx`
    INSERT INTO order_event (order_id, seq, type, actor, payload, payload_version)
    VALUES (${id}, 1, 'order.placed', ${FIXTURE_ACTOR}, '{}'::jsonb, 1)`;
  return id;
}
