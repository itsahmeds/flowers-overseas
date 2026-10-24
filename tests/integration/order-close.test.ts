/**
 * The close sweep on a database (spec 022a §10 T-02, T-03, T-04, T-05 connected half; AC-2 to
 * AC-5; §11 `alert=orders.close_backlog`; TASK-369).
 *
 * On a migrated PG16 scratch database (`support/scratch-db.ts`; never the shared database):
 *
 *  - T-02: a `photo_uploaded` order whose photo is 72 h + 1 s old closes with one `order.closed`
 *    (actor `system:order.close`, payload `{ mode, from: 'photo_uploaded' }`) through the engine;
 *    one 72 h − 1 s old is untouched; `resolved` and `refunded_full` close at once;
 *  - T-03: a `pending` or `requested` refund holds the close back; once it is `succeeded` or
 *    `failed`, the next sweep closes the order;
 *  - T-04: two sweeps on two connections, both past their select and waiting on the order's lock,
 *    write one `order.closed`; an order moved to `disputed` after the select and before the lock
 *    is skipped with no event and no error;
 *  - T-05: a close writes no outbox row (no notification target) and no `notification_delivery`;
 *  - §11: more than 20 due orders left after a run raises `orders.close_backlog` once; 20 do not;
 *    the oldest due order closes first.
 *
 * Every case but the concurrent one runs in a transaction that is rolled back, each sweep
 * transaction a savepoint of it. The concurrent case commits (it needs two real connections); it
 * runs last and leaves only closed orders behind.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger, type Logger } from "@/lib/logger";
import "@/modules/payments/events";
import type { AlertRaiser } from "@/modules/orders";
import {
  CLOSE_ACTOR,
  runCloseSweep,
  type SweepTransaction,
} from "@/modules/orders/close";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import { orderParents } from "./support/rows.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
// `order.closed` is registered by the close module (imported above); the events the fixture walk
// never sends through the engine get the fixture's `{ mode }` schema.
registerFixtureEventSchemas();

const HOUR = 3_600_000;
const WINDOW = 72 * HOUR;
/** The sweep's clock in every case: fixed, so "72 h ± 1 s" is exact. */
const NOW = new Date("2027-04-10T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function savepoints(tx: Tx): SweepTransaction {
  return <T>(fn: (executor: ReturnType<typeof runnerOf>) => Promise<T>) =>
    tx.savepoint((sp) => fn(runnerOf(sp))) as Promise<T>;
}

function silentLogger(): Logger & { lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const log = createLogger({
    level: "debug",
    write: (line) => {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  return Object.assign(log, { lines });
}

function alerts(): AlertRaiser & {
  raised: { alert: string; fields: Record<string, unknown> }[];
} {
  const raised: { alert: string; fields: Record<string, unknown> }[] = [];
  const raise: AlertRaiser = (alert, fields) => {
    raised.push({ alert, fields: { ...fields } });
  };
  return Object.assign(raise, { raised });
}

/** A `live` order walked to `photo_uploaded`, its photo event at `photoAt`. */
async function photoOrder(tx: Tx, photoAt: Date): Promise<string> {
  const orderId = await insertPlacedOrder(tx, {
    ...(await orderParents(tx)),
    mode: "live",
  });
  await walkOrderTo(tx, orderId, "delivered");
  await applyTransition(
    tx,
    orderId,
    "order.photo_uploaded",
    "photo_uploaded",
    photoAt,
  );
  return orderId;
}

interface EventRow {
  type: string;
  actor: string;
  from_status: string | null;
  to_status: string | null;
  payload: Record<string, unknown>;
}

async function closeEvents(tx: Tx | postgres.Sql, orderId: string) {
  return tx<EventRow[]>`
    SELECT type, actor, from_status, to_status, payload FROM order_event
    WHERE order_id = ${orderId} AND type = 'order.closed' ORDER BY seq`;
}

async function statusOf(tx: Tx | postgres.Sql, orderId: string) {
  const [row] = await tx<{ status: string }[]>`
    SELECT status FROM "order" WHERE id = ${orderId}`;
  return row?.status;
}

/** A captured `live` payment of `orderId` and one refund of it in `status`. */
async function refundOf(
  tx: Tx,
  orderId: string,
  status: "requested" | "pending",
): Promise<string> {
  const [payment] = await tx<{ id: string }[]>`
    INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor,
                         currency_code, livemode, capture_method, amount_captured_minor,
                         captured_at)
    VALUES (${orderId}, 'stripe', ${`pi_${crypto.randomUUID().slice(0, 12)}`}, 'captured',
            'card', 18900, 'PLN', true, 'automatic', 18900, now())
    RETURNING id`;
  const [refund] = await tx<{ id: string }[]>`
    INSERT INTO refund (payment_id, provider_ref, amount_minor, currency_code, reason, status,
                        requested_by)
    VALUES (${payment?.id ?? ""},
            ${status === "pending" ? `re_${crypto.randomUUID().slice(0, 12)}` : null},
            500, 'PLN', 'quality', ${status}, 'system:payments')
    RETURNING id`;
  return refund?.id ?? "";
}

describe.skipIf(server.url === undefined)(
  `spec 022a — the close sweep${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "close");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-02 (AC-2): 72 h + 1 s closes with one order.closed through the engine; 72 h − 1 s is untouched", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const due = await photoOrder(tx, ago(WINDOW + 1000));
        const early = await photoOrder(tx, ago(WINDOW - 1000));
        const log = silentLogger();
        const counts = await runCloseSweep({
          transaction: savepoints(tx),
          now: () => NOW,
          alert: alerts(),
          log,
        });
        return {
          counts,
          dueStatus: await statusOf(tx, due),
          dueEvents: await closeEvents(tx, due),
          earlyStatus: await statusOf(tx, early),
          earlyEvents: await closeEvents(tx, early),
          lines: log.lines
            .filter((line) => line["msg"] === "order.close")
            .map((line) => ({
              order_id: line["order_id"],
              from: line["from"],
              outcome: line["outcome"],
              due: line["order_id"] === due,
            })),
        };
      });
      expect(result.counts).toEqual({
        selected: 1,
        closed: 1,
        held: 0,
        moved: 0,
        failed: 0,
        remaining: 0,
      });
      expect(result.dueStatus).toBe("closed");
      expect(result.dueEvents).toEqual([
        {
          type: "order.closed",
          actor: CLOSE_ACTOR,
          from_status: "photo_uploaded",
          to_status: "closed",
          payload: { mode: "live", from: "photo_uploaded" },
        },
      ]);
      expect(CLOSE_ACTOR).toBe("system:order.close");
      expect(result.earlyStatus).toBe("photo_uploaded");
      expect(result.earlyEvents).toEqual([]);
      expect(result.lines).toEqual([
        {
          order_id: expect.any(String),
          from: "photo_uploaded",
          outcome: "closed",
          due: true,
        },
      ]);
    });

    it("AC-1 on the database: resolved and refunded_full close at once, with their own `from`", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const resolved = await photoOrder(tx, ago(HOUR));
        await walkOrderTo(tx, resolved, "disputed");
        await applyTransition(
          tx,
          resolved,
          "order.resolved",
          "resolved",
          ago(1000),
        );
        const refunded = await photoOrder(tx, ago(HOUR));
        await applyTransition(
          tx,
          refunded,
          "order.refunded_full",
          "refunded_full",
          ago(1000),
        );
        const counts = await runCloseSweep({
          transaction: savepoints(tx),
          now: () => NOW,
          alert: alerts(),
          log: silentLogger(),
        });
        return {
          counts,
          resolved: await closeEvents(tx, resolved),
          refunded: await closeEvents(tx, refunded),
        };
      });
      expect(result.counts.closed).toBe(2);
      expect(result.resolved.map((event) => event.payload)).toEqual([
        { mode: "live", from: "resolved" },
      ]);
      expect(result.refunded.map((event) => event.payload)).toEqual([
        { mode: "live", from: "refunded_full" },
      ]);
    });

    it.each(["pending", "requested"] as const)(
      "T-03 (AC-3): a %s refund holds the close; settled, the next sweep closes it",
      async (status) => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const orderId = await photoOrder(tx, ago(WINDOW + HOUR));
          const refundId = await refundOf(tx, orderId, status);
          const options = {
            transaction: savepoints(tx),
            now: () => NOW,
            alert: alerts(),
            log: silentLogger(),
          };
          const first = await runCloseSweep(options);
          const afterFirst = {
            status: await statusOf(tx, orderId),
            events: await closeEvents(tx, orderId),
          };
          if (status === "pending") {
            await tx`UPDATE refund SET status = 'succeeded', succeeded_at = now()
                     WHERE id = ${refundId}`;
          } else {
            await tx`UPDATE refund SET status = 'failed', failure_code = 'expired_card'
                     WHERE id = ${refundId}`;
          }
          const second = await runCloseSweep(options);
          return {
            first,
            afterFirst,
            second,
            status: await statusOf(tx, orderId),
            events: await closeEvents(tx, orderId),
          };
        });
        expect(result.first).toEqual({
          selected: 1,
          closed: 0,
          held: 1,
          moved: 0,
          failed: 0,
          remaining: 1,
        });
        expect(result.afterFirst).toEqual({
          status: "photo_uploaded",
          events: [],
        });
        expect(result.second.closed).toBe(1);
        expect(result.status).toBe("closed");
        expect(result.events).toHaveLength(1);
      },
    );

    it("T-04 (AC-4): an order moved to disputed between the select and the lock is skipped, no event, no error", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const orderId = await photoOrder(tx, ago(WINDOW + HOUR));
        let calls = 0;
        // The first transaction is the select; before the second (the order's own) takes its
        // lock, a buyer's dispute lands.
        const transaction: SweepTransaction = async (fn) => {
          calls += 1;
          if (calls === 2) await walkOrderTo(tx, orderId, "disputed");
          return savepoints(tx)(fn);
        };
        const counts = await runCloseSweep({
          transaction,
          now: () => NOW,
          alert: alerts(),
          log: silentLogger(),
        });
        return {
          counts,
          status: await statusOf(tx, orderId),
          events: await closeEvents(tx, orderId),
        };
      });
      expect(result.counts).toEqual({
        selected: 1,
        closed: 0,
        held: 0,
        moved: 1,
        failed: 0,
        remaining: 0,
      });
      expect(result.status).toBe("disputed");
      expect(result.events).toEqual([]);
    });

    it("T-05 (AC-5): a close writes no outbox row and no notification_delivery row", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const orderId = await photoOrder(tx, ago(WINDOW + HOUR));
        const [table] = await tx<{ exists: boolean }[]>`
          SELECT to_regclass('public.notification_delivery') IS NOT NULL AS exists`;
        const deliveries = async () => {
          if (table?.exists !== true) return 0;
          const [row] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM notification_delivery`;
          return row?.n ?? -1;
        };
        const deliveriesBefore = await deliveries();
        const counts = await runCloseSweep({
          transaction: savepoints(tx),
          now: () => NOW,
          alert: alerts(),
          log: silentLogger(),
        });
        const [outbox] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM outbox o
          JOIN order_event e ON e.id = o.event_id
          WHERE e.order_id = ${orderId} AND e.type = 'order.closed'`;
        return {
          closed: counts.closed,
          outbox: outbox?.n,
          deliveriesBefore,
          deliveriesAfter: await deliveries(),
        };
      });
      expect(result.closed).toBe(1);
      expect(result.outbox).toBe(0);
      expect(result.deliveriesAfter).toBe(result.deliveriesBefore);
    });

    it("§11: 21 due orders left raise orders.close_backlog once; 20 do not; the oldest closes first", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const ids: string[] = [];
        for (let index = 0; index < 21; index += 1) {
          // index 0 is the oldest due photo.
          ids.push(await photoOrder(tx, ago(WINDOW + (30 - index) * HOUR)));
        }
        const none = alerts();
        const held = await runCloseSweep({
          transaction: savepoints(tx),
          now: () => NOW,
          limit: 0,
          alert: none,
          log: silentLogger(),
        });
        const one = alerts();
        const first = await runCloseSweep({
          transaction: savepoints(tx),
          now: () => NOW,
          limit: 1,
          alert: one,
          log: silentLogger(),
        });
        return {
          held,
          heldAlerts: none.raised,
          first,
          firstAlerts: one.raised,
          oldest: await statusOf(tx, ids[0] ?? ""),
          next: await statusOf(tx, ids[1] ?? ""),
        };
      });
      expect(result.held.remaining).toBe(21);
      expect(result.heldAlerts).toEqual([
        { alert: "orders.close_backlog", fields: { remaining: 21 } },
      ]);
      expect(result.first.closed).toBe(1);
      expect(result.first.remaining).toBe(20);
      expect(result.firstAlerts).toEqual([]);
      expect(result.oldest).toBe("closed");
      expect(result.next).toBe("photo_uploaded");
    });

    it("T-04 (AC-4): two sweeps on two connections, both waiting on the order's lock, write one order.closed", async () => {
      const orderId = await scratch.sql.begin((tx) =>
        photoOrder(tx, ago(WINDOW + HOUR)),
      );
      const side = postgres(scratch.url, { max: 2, onnotice: () => undefined });
      const holder = await side.reserve();
      try {
        await holder`BEGIN`;
        await holder`SELECT id FROM "order" WHERE id = ${orderId} FOR UPDATE`;
        const committed: SweepTransaction = (fn) =>
          scratch.sql.begin((tx) => fn(runnerOf(tx))) as never;
        const sweep = () =>
          runCloseSweep({
            transaction: committed,
            now: () => NOW,
            alert: alerts(),
            log: silentLogger(),
          });
        const both = Promise.all([sweep(), sweep()]);
        // Both sweeps are past their select and blocked on the row lock before it is released.
        const deadline = Date.now() + 20_000;
        for (;;) {
          const [row] = await side<{ n: number }[]>`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`;
          if ((row?.n ?? 0) >= 2) break;
          if (Date.now() > deadline)
            throw new Error("the two sweeps never met the lock");
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await holder`COMMIT`;
        const [a, b] = await both;
        expect([a.closed, b.closed].sort()).toEqual([0, 1]);
        expect([a.moved, b.moved].sort()).toEqual([0, 1]);
        expect(a.failed + b.failed).toBe(0);
        expect(await closeEvents(scratch.sql, orderId)).toHaveLength(1);
        expect(await statusOf(scratch.sql, orderId)).toBe("closed");
      } finally {
        holder.release();
        await side.end({ timeout: 5 });
      }
    }, 60_000);
  },
);
