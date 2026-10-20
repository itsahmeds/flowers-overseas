/**
 * T-20, connected half (spec 013 AC-20, §5.2 "The dispatcher", §11 `outbox.dead`; spec 002 §14
 * A7.7; spec 010 AC-20; TASK-254).
 *
 * On a migrated PG16 scratch database (`support/scratch-db.ts`; never the shared database):
 *
 *  - an `outbox` row with two targets gets two `outbox_delivery` rows from the `0016` trigger;
 *  - the dispatcher delivers each once and marks it `sent`; a throwing handler is retried with
 *    every attempt in `outbox_attempt` carrying its `target`; the 8th failure marks that delivery
 *    `dead` and raises `outbox.dead`, while the other target of the same row is delivered once
 *    and never re-run;
 *  - a handler runs in the delivery's transaction: what it wrote is kept with `sent` and undone
 *    with a throw;
 *  - the backoff holds a failed delivery back until it is due;
 *  - the engine's own writes reach it: a `test` order's `order.captured` (row 2) becomes one
 *    `routing` delivery with the event as `order_event` holds it, and a `demo` order still writes
 *    no outbox row (spec 010 AC-20).
 *
 * Each case runs in a transaction that is rolled back; the dispatcher's per-delivery transaction
 * is a savepoint of it (`savepoints(tx)`), so the cases see their own writes and leave nothing.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger, type Logger } from "@/lib/logger";
import "@/modules/payments/events";
import {
  dispatchOutbox,
  notConfiguredHandler,
  transition,
  type AlertRaiser,
  type DeliveryTransaction,
  type HandlerRegistry,
  type OutboxDeliveryEvent,
  type OutboxHandler,
} from "@/modules/orders";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { orderParents } from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
/** Spec 013 §5.2: "after 8 attempts `dead`". The literal, not the constant, so changing one fails. */
const MAX_ATTEMPTS = 8;
// Spec 013's own schemas are registered by the import above; the rest (spec 011's
// `order.captured` among them) get the fixture's `{ mode }` schema.
registerFixtureEventSchemas();

/** Each delivery's transaction is a savepoint of the case's transaction. */
function savepoints(tx: Tx): DeliveryTransaction {
  return <T>(fn: (executor: ReturnType<typeof runnerOf>) => Promise<T>) =>
    tx.savepoint((sp) => fn(runnerOf(sp))) as Promise<T>;
}

function silentLogger(): Logger & {
  lines: { msg: string; [key: string]: unknown }[];
} {
  const lines: { msg: string; [key: string]: unknown }[] = [];
  const log = createLogger({
    level: "debug",
    write: (line) => {
      lines.push(JSON.parse(line) as { msg: string });
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

/** A handler that records every event it is handed. */
function recording(): OutboxHandler & { calls: OutboxDeliveryEvent[] } {
  const calls: OutboxDeliveryEvent[] = [];
  const handler: OutboxHandler = (event) => {
    calls.push(event);
    return Promise.resolve();
  };
  return Object.assign(handler, { calls });
}

/** A handler that always throws, counting its calls. */
function throwing(): OutboxHandler & { calls: number } {
  const state = { calls: 0 };
  const inner = notConfiguredHandler("routing");
  const handler: OutboxHandler = (event, context) => {
    state.calls += 1;
    return inner(event, context);
  };
  return Object.defineProperty(handler, "calls", {
    get: () => state.calls,
  }) as OutboxHandler & {
    calls: number;
  };
}

/** A `test` order at `paid_unrouted` (row 2, through the engine) with its outbox row. */
async function paidTestOrder(
  tx: Tx,
): Promise<{ orderId: string; eventId: string; outboxId: string }> {
  const orderId = await insertPlacedOrder(tx, {
    ...(await orderParents(tx)),
    mode: "test",
  });
  const result = await transition(
    orderId,
    "order.captured",
    "system:payments",
    { mode: "test" },
    { executor: runnerOf(tx) },
  );
  return { orderId, eventId: result.eventId, outboxId: result.outboxId ?? "" };
}

/** An outbox row for `orderId`'s seq-1 event naming both targets, as a writer with two routes would. */
async function twoTargetRow(tx: Tx, orderId: string): Promise<string> {
  const [event] = await tx<{ id: string }[]>`
    SELECT id FROM order_event WHERE order_id = ${orderId} AND seq = 1`;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
    VALUES (${event?.id ?? ""}, ${orderId}, '{routing,payments}', '{}', 1)
    RETURNING id`;
  return row?.id ?? "";
}

interface DeliveryRow {
  target: string;
  status: string;
  attempts: number;
  last_error: string | null;
  sent: boolean;
}

async function deliveries(tx: Tx, outboxId: string): Promise<DeliveryRow[]> {
  return tx<DeliveryRow[]>`
    SELECT target, status, attempts, last_error, sent_at IS NOT NULL AS sent
    FROM outbox_delivery WHERE outbox_id = ${outboxId} ORDER BY target`;
}

describe.skipIf(server.url === undefined)(
  `T-20 — the outbox dispatcher${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "outbox");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-20: two targets, two deliveries; one delivered once and sent, the other retried 8 times with its target on every attempt, then dead with outbox.dead", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const orderId = await insertPlacedOrder(tx, {
          ...(await orderParents(tx)),
          mode: "live",
        });
        const outboxId = await twoTargetRow(tx, orderId);
        const created = await deliveries(tx, outboxId);

        const payments = recording();
        const routing = throwing();
        const handlers: HandlerRegistry = { payments, routing };
        const alert = alerts();
        const log = silentLogger();
        const runs = [];
        for (let run = 0; run < MAX_ATTEMPTS + 2; run += 1) {
          runs.push(
            await dispatchOutbox({
              handlers,
              transaction: savepoints(tx),
              retryBaseSeconds: 0,
              batchSize: 1,
              alert,
              log,
            }),
          );
        }
        const attempts = await tx<
          {
            attempt: number;
            status: string;
            target: string | null;
            error: string | null;
          }[]
        >`
          SELECT attempt, status, target, error FROM outbox_attempt
          WHERE outbox_id = ${outboxId} ORDER BY attempt`;
        const [outbox] = await tx<{ status: string; attempts: number }[]>`
          SELECT status, attempts FROM outbox WHERE id = ${outboxId}`;
        return {
          orderId,
          created,
          settled: await deliveries(tx, outboxId),
          paymentsCalls: payments.calls.length,
          routingCalls: routing.calls,
          attempts,
          outbox,
          runs,
          raised: alert.raised,
          deadLines: log.lines.filter((line) => line.msg === "outbox.dead"),
        };
      });

      expect(result.created).toEqual([
        {
          target: "payments",
          status: "pending",
          attempts: 0,
          last_error: null,
          sent: false,
        },
        {
          target: "routing",
          status: "pending",
          attempts: 0,
          last_error: null,
          sent: false,
        },
      ]);
      expect(result.paymentsCalls).toBe(1);
      expect(result.routingCalls).toBe(MAX_ATTEMPTS);
      expect(result.settled[0]).toEqual({
        target: "payments",
        status: "sent",
        attempts: 1,
        last_error: null,
        sent: true,
      });
      expect(result.settled[1]).toMatchObject({
        target: "routing",
        status: "dead",
        attempts: MAX_ATTEMPTS,
        sent: false,
      });
      expect(result.settled[1]?.last_error).toContain("ROUTING_NOT_CONFIGURED");
      // Every attempt is recorded, with its target, numbered once per outbox row.
      expect(result.attempts.map((a) => a.attempt)).toEqual(
        Array.from({ length: MAX_ATTEMPTS + 1 }, (_, i) => i + 1),
      );
      expect(result.attempts.filter((a) => a.target === "payments")).toEqual([
        expect.objectContaining({ status: "sent", error: null }),
      ]);
      const routingAttempts = result.attempts.filter(
        (a) => a.target === "routing",
      );
      expect(routingAttempts).toHaveLength(MAX_ATTEMPTS);
      for (const attempt of routingAttempts) {
        expect(attempt.status).toBe("failed");
        expect(attempt.error).toContain("ROUTING_NOT_CONFIGURED");
      }
      expect(result.attempts.every((a) => a.target !== null)).toBe(true);
      expect(result.outbox).toEqual({
        status: "dead",
        attempts: MAX_ATTEMPTS + 1,
      });
      // Exactly one alert, on the 8th failure, naming the order; the last two runs found nothing.
      expect(result.raised).toEqual([
        {
          alert: "outbox.dead",
          fields: expect.objectContaining({
            order_id: result.orderId,
            target: "routing",
          }) as Record<string, unknown>,
        },
      ]);
      expect(result.deadLines).toHaveLength(1);
      expect(result.runs.filter((run) => run.dead === 1)).toHaveLength(1);
      expect(result.runs.slice(-1)[0]).toEqual({
        claimed: 0,
        sent: 0,
        failed: 0,
        dead: 0,
      });
    });

    it("AC-20: both targets succeed → both sent once, the outbox row sent; a second run delivers nothing again", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const orderId = await insertPlacedOrder(tx, {
          ...(await orderParents(tx)),
          mode: "test",
        });
        const outboxId = await twoTargetRow(tx, orderId);
        const payments = recording();
        const routing = recording();
        const options = {
          handlers: { payments, routing },
          transaction: savepoints(tx),
          alert: alerts(),
          log: silentLogger(),
        };
        const first = await dispatchOutbox(options);
        const second = await dispatchOutbox(options);
        const [outbox] = await tx<{ status: string }[]>`
          SELECT status FROM outbox WHERE id = ${outboxId}`;
        return {
          first,
          second,
          calls: [payments.calls.length, routing.calls.length],
          settled: await deliveries(tx, outboxId),
          outbox,
        };
      });
      expect(result.first).toEqual({ claimed: 2, sent: 2, failed: 0, dead: 0 });
      expect(result.second).toEqual({
        claimed: 0,
        sent: 0,
        failed: 0,
        dead: 0,
      });
      expect(result.calls).toEqual([1, 1]);
      expect(
        result.settled.map((d) => [d.target, d.status, d.attempts, d.sent]),
      ).toEqual([
        ["payments", "sent", 1, true],
        ["routing", "sent", 1, true],
      ]);
      expect(result.outbox?.status).toBe("sent");
    });

    it("runs the handler in the delivery's transaction: its writes commit with sent and are undone with a throw", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const orderId = await insertPlacedOrder(tx, {
          ...(await orderParents(tx)),
          mode: "live",
        });
        await twoTargetRow(tx, orderId);
        const write =
          (label: string, fail: boolean): OutboxHandler =>
          async (_event, context) => {
            await context.executor.execute(
              // A row the test can count, written through the delivery's own executor.
              sql`
                INSERT INTO audit_log (actor_label, action, entity_table, entity_id, after, request_id)
                VALUES ('system:test', ${label}, 'outbox', ${context.deliveryId}, '{}', 'req-outbox')`,
            );
            if (fail) throw new Error("injected after the write");
          };
        await dispatchOutbox({
          handlers: {
            payments: write("kept", false),
            routing: write("undone", true),
          },
          transaction: savepoints(tx),
          batchSize: 2,
          alert: alerts(),
          log: silentLogger(),
        });
        return tx<{ action: string }[]>`
          SELECT action FROM audit_log WHERE request_id = 'req-outbox' ORDER BY action`;
      });
      expect(result.map((row) => row.action)).toEqual(["kept"]);
    });

    it("holds a failed delivery back until its backoff has passed", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const orderId = await insertPlacedOrder(tx, {
          ...(await orderParents(tx)),
          mode: "live",
        });
        const outboxId = await twoTargetRow(tx, orderId);
        const routing = throwing();
        const base = {
          handlers: { payments: recording(), routing },
          transaction: savepoints(tx),
          alert: alerts(),
          log: silentLogger(),
        };
        const start = Date.now();
        const first = await dispatchOutbox({
          ...base,
          now: () => new Date(start),
        });
        const tooSoon = await dispatchOutbox({
          ...base,
          now: () => new Date(start + 10_000),
        });
        const due = await dispatchOutbox({
          ...base,
          now: () => new Date(start + 31_000),
        });
        return {
          first,
          tooSoon,
          due,
          calls: routing.calls,
          settled: await deliveries(tx, outboxId),
        };
      });
      expect(result.first).toEqual({ claimed: 2, sent: 1, failed: 1, dead: 0 });
      expect(result.tooSoon.claimed).toBe(0);
      expect(result.due).toEqual({ claimed: 1, sent: 0, failed: 1, dead: 0 });
      expect(result.calls).toBe(2);
      expect(result.settled.find((d) => d.target === "routing")?.attempts).toBe(
        2,
      );
    });

    it("the engine's writes reach it: a test order's row 2 is one routing delivery with the event as order_event holds it; a demo order writes no outbox row", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const paid = await paidTestOrder(tx);
        const created = await tx<{ target: string }[]>`
          SELECT d.target FROM outbox_delivery d WHERE d.outbox_id = ${paid.outboxId}`;
        const routing = recording();
        const counts = await dispatchOutbox({
          handlers: { payments: recording(), routing },
          transaction: savepoints(tx),
          orderId: paid.orderId,
          alert: alerts(),
          log: silentLogger(),
        });
        const demoId = await insertPlacedOrder(tx, {
          ...(await orderParents(tx)),
          mode: "demo",
        });
        await transition(
          demoId,
          "order.authorised",
          "system:demo_guard",
          { mode: "demo" },
          { executor: runnerOf(tx) },
        );
        const [demoOutbox] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM outbox WHERE order_id = ${demoId}`;
        return {
          paid,
          created,
          counts,
          calls: routing.calls,
          demoOutbox: demoOutbox?.n,
        };
      });
      expect(result.created).toEqual([{ target: "routing" }]);
      expect(result.counts).toEqual({
        claimed: 1,
        sent: 1,
        failed: 0,
        dead: 0,
      });
      expect(result.calls).toEqual([
        {
          eventId: result.paid.eventId,
          orderId: result.paid.orderId,
          type: "order.captured",
          seq: 2,
          fromStatus: "placed",
          toStatus: "paid_unrouted",
          mode: "test",
        },
      ]);
      expect(result.demoOutbox).toBe(0);
    });

    it("takes only the named order's deliveries when asked for one order", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const first = await paidTestOrder(tx);
        const second = await paidTestOrder(tx);
        const routing = recording();
        const counts = await dispatchOutbox({
          handlers: { payments: recording(), routing },
          transaction: savepoints(tx),
          orderId: second.orderId,
          alert: alerts(),
          log: silentLogger(),
        });
        const left = await deliveries(tx, first.outboxId);
        return {
          counts,
          orders: routing.calls.map((c) => c.orderId),
          second,
          left,
        };
      });
      expect(result.counts.claimed).toBe(1);
      expect(result.orders).toEqual([result.second.orderId]);
      expect(result.left.map((d) => d.status)).toEqual(["pending"]);
    });

    it("an admin's transaction fans out deliveries it cannot read (SECURITY DEFINER trigger, system-only table)", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const orderId = await insertPlacedOrder(tx, {
          ...(await orderParents(tx)),
          mode: "live",
        });
        const [event] = await tx<{ id: string }[]>`
          SELECT id FROM order_event WHERE order_id = ${orderId} AND seq = 1`;
        await asApp(tx, { role: "admin" });
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
          VALUES (${event?.id ?? ""}, ${orderId}, '{payments}', '{}', 1) RETURNING id`;
        const [seenByAdmin] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM outbox_delivery WHERE outbox_id = ${row?.id ?? ""}`;
        await tx.unsafe("RESET ROLE");
        const [actual] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM outbox_delivery WHERE outbox_id = ${row?.id ?? ""}`;
        return { seenByAdmin: seenByAdmin?.n, actual: actual?.n };
      });
      expect(result).toEqual({ seenByAdmin: 0, actual: 1 });
    });
  },
);
