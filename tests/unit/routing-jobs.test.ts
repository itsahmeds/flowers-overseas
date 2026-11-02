/**
 * Spec 016's routing jobs, the pure and source halves (§5.2 "Jobs", "The `routing` outbox
 * handler"; AC-1, AC-8, AC-17, AC-31, AC-32; T-31 unit half, T-32 scan half; TASK-328).
 *
 *  - The `routing` handler's dispatch table over a fake executor and a recording scheduler: a
 *    payment secured to `paid_unrouted` enqueues one `order.route`; the same row once the order
 *    has moved on, row 14's `order.captured` to `paid`, `order.authorised` and a `demo` event
 *    enqueue nothing; `order.delivered` enqueues the photo reminder at the event's time plus an
 *    hour.
 *  - The decline effect enqueues `order.route` for `test` and `live`, nothing for `demo`.
 *  - T-31: `expectedFirstOfferAt` for an order secured at 23:00 Warsaw is 07:30 the next morning.
 *  - T-32: the router's sources pass only catalogue event names to the engine, never an arrow
 *    label, and write no status outside `transition`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import {
  createRoutingDeclineEffect,
  PHOTO_REMIND_AFTER_MINUTES,
  ROUTING_WRITTEN_EVENTS,
  routingOutboxHandler,
  type RoutingJob,
} from "../../src/modules/orders/routing/jobs";
import { expectedFirstOfferAt } from "../../src/modules/orders/routing";
import {
  ORDER_EVENT_TYPES,
  eventSchema,
  type OrderEventType,
  type OrderExecutor,
} from "../../src/modules/orders";
import type { OutboxDeliveryEvent } from "../../src/modules/orders";

const dialect = new PgDialect();
const ORDER = "0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
const EVENT = "1c9f8e7d-6b5a-4f4e-9d3c-2b1a0f9e8d7c";

function recorder() {
  const jobs: RoutingJob[] = [];
  const schedule = vi.fn(async (batch: readonly RoutingJob[]) => {
    jobs.push(...batch);
  });
  return { jobs, schedule };
}

/** An executor answering the handler's two reads: the order's status, the event's time. */
function fakeExecutor(state: {
  status?: string;
  occurredAt?: Date;
}): OrderExecutor {
  return {
    execute: vi.fn(async (query) => {
      const text = dialect.sqlToQuery(query).sql;
      if (text.includes("occurred_at")) {
        return state.occurredAt === undefined
          ? []
          : [{ occurred_at: state.occurredAt }];
      }
      return state.status === undefined ? [] : [{ status: state.status }];
    }) as OrderExecutor["execute"],
  };
}

function event(
  type: OrderEventType,
  over: Partial<OutboxDeliveryEvent> = {},
): OutboxDeliveryEvent {
  return {
    eventId: EVENT,
    orderId: ORDER,
    type,
    seq: 3,
    fromStatus: "placed",
    toStatus: "paid_unrouted",
    mode: "live",
    ...over,
  };
}

async function handle(
  delivered: OutboxDeliveryEvent,
  state: { status?: string; occurredAt?: Date },
): Promise<RoutingJob[]> {
  const { jobs, schedule } = recorder();
  await routingOutboxHandler({ schedule })(delivered, {
    deliveryId: EVENT,
    outboxId: EVENT,
    target: "routing",
    attempt: 1,
    executor: fakeExecutor(state),
  });
  return jobs;
}

describe("the routing outbox handler's dispatch table (AC-1, AC-17)", () => {
  it("a payment secured to paid_unrouted enqueues exactly one order.route for that order, test and live alike", async () => {
    for (const mode of ["test", "live"] as const) {
      expect(
        await handle(event("order.captured", { mode }), {
          status: "paid_unrouted",
        }),
      ).toEqual([{ name: "order.route", orderId: ORDER }]);
    }
  });

  it("the same row once the order has moved on (routed by an earlier run) enqueues nothing", async () => {
    expect(await handle(event("order.captured"), { status: "routed" })).toEqual(
      [],
    );
    expect(await handle(event("order.captured"), {})).toEqual([]);
  });

  it("row 14's order.captured (accepted to paid) enqueues nothing and the handler writes no event", async () => {
    const { schedule } = recorder();
    const executor = fakeExecutor({ status: "paid" });
    await routingOutboxHandler({ schedule })(
      event("order.captured", { fromStatus: "accepted", toStatus: "paid" }),
      {
        deliveryId: EVENT,
        outboxId: EVENT,
        target: "routing",
        attempt: 1,
        executor,
      },
    );
    expect(schedule).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("order.authorised and a demo event enqueue nothing", async () => {
    expect(
      await handle(event("order.authorised", { toStatus: "authorised" }), {
        status: "authorised",
      }),
    ).toEqual([]);
    expect(
      await handle(event("order.captured", { mode: "demo" }), {
        status: "paid_unrouted",
      }),
    ).toEqual([]);
  });

  it("order.delivered enqueues the photo reminder one hour after the event", async () => {
    const deliveredAt = new Date("2026-11-03T10:17:00Z");
    expect(PHOTO_REMIND_AFTER_MINUTES).toBe(60);
    expect(
      await handle(
        event("order.delivered", {
          fromStatus: "out_for_delivery",
          toStatus: "delivered",
        }),
        { occurredAt: deliveredAt },
      ),
    ).toEqual([
      {
        name: "assignment.photo_remind",
        orderId: ORDER,
        startAfter: new Date("2026-11-03T11:17:00Z"),
      },
    ]);
  });
});

describe("spec 016's afterDecline (AC-8)", () => {
  it("enqueues order.route for a test or live order, nothing for a demo one", async () => {
    const { jobs, schedule } = recorder();
    const effect = createRoutingDeclineEffect(schedule);
    await effect.afterDecline({ orderId: ORDER, mode: "test" });
    await effect.afterDecline({ orderId: ORDER, mode: "live" });
    await effect.afterDecline({ orderId: ORDER, mode: "demo" });
    expect(jobs).toEqual([
      { name: "order.route", orderId: ORDER },
      { name: "order.route", orderId: ORDER },
    ]);
  });
});

describe("T-31 unit half: expectedFirstOfferAt for spec 013's unrouted check (AC-31)", () => {
  it("an order secured at 23:00 Warsaw time is due its first offer at 07:30 the next morning", () => {
    const warsaw = { ianaZone: "Europe/Warsaw", sameDayCutoffLocal: "14:00" };
    // 23:00 in Warsaw on 2 Nov 2026 (CET, UTC+1) is 22:00Z.
    expect(
      expectedFirstOfferAt({
        securedAt: new Date("2026-11-02T22:00:00Z"),
        deliveryDate: "2026-11-04",
        destination: warsaw,
      }).toISOString(),
    ).toBe("2026-11-03T06:30:00.000Z");
  });
});

describe("T-32 scan half: catalogue names, no arrow label, no status write (AC-32)", () => {
  const dir = resolve(import.meta.dirname, "../../src/modules/orders/routing");
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
  const ARROW_LABELS = [
    "route",
    "accept",
    "decline",
    "timeout",
    "exhausted",
    "capture",
    "start",
    "refund",
  ];

  it("every event the router hands the engine is a catalogue name with a registered schema", () => {
    const called: string[] = [];
    for (const { text } of sources) {
      for (const match of text.matchAll(
        /\b(?:transition|appendEvent)\(\s*[\w.]+,\s*"([^"]+)"/gu,
      )) {
        called.push(match[1] ?? "");
      }
    }
    expect([...new Set(called)].sort()).toEqual(
      [...ROUTING_WRITTEN_EVENTS].sort(),
    );
    for (const name of called) {
      expect(ORDER_EVENT_TYPES as readonly string[]).toContain(name);
      expect(eventSchema(name), name).toBeDefined();
      expect(ARROW_LABELS).not.toContain(name);
    }
  });

  it("no arrow label is passed as an event, and no status is written outside transition", () => {
    for (const { name, text } of sources) {
      for (const label of ARROW_LABELS) {
        expect(text, `${name}: "${label}" passed as an event`).not.toMatch(
          new RegExp(
            `\\b(?:transition|appendEvent)\\(\\s*[\\w.]+,\\s*"${label}"`,
            "u",
          ),
        );
      }
      expect(text, name).not.toMatch(/UPDATE\s+"?order"?\s+SET/iu);
      expect(text, name).not.toMatch(/INSERT\s+INTO\s+"?order_event/iu);
      expect(text, name).not.toMatch(/INSERT\s+INTO\s+outbox/iu);
      expect(text, name).not.toMatch(/allow_status_write/u);
    }
  });
});
