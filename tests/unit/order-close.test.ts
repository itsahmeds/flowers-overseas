/**
 * The close, without a database (spec 022a §10 T-01, T-02 source half, T-05 unit half; AC-1,
 * AC-2, AC-5; TASK-369).
 *
 *  - T-01: `closeDueAt` over all 26 statuses of spec 002 A6.4, with the photo instant 2027-03-27
 *    10:00 Europe/Warsaw (+01:00), 72 hours across the 28 March clock change: 2027-03-30 11:00
 *    (+02:00), not 10:00 (three calendar days);
 *  - AC-2's source scan: nothing under `src/modules/orders/close/` writes a status;
 *  - AC-5: `order.closed` has no outbox target in any mode, so a close writes no outbox row and no
 *    notification (spec 016's `notificationsFor` row assertion is a carry-forward on TASK-331);
 *  - the `order.closed` payload schema: registered at version 1, `{ mode, from }` only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COMPLAINT_WINDOW_HOURS } from "@/config/company";
import { eventSchema, ORDER_MODES, outboxTargets } from "@/modules/orders";
import {
  CLOSABLE_STATUSES,
  CLOSE_ACTOR,
  closeDueAt,
  OrderClosedV1,
} from "@/modules/orders/close";

import { STATES } from "../fixtures/order-machine.ts";

/** 2027-03-27 10:00 in Warsaw, the day before the clock goes forward (+01:00 → +02:00). */
const PHOTO_WARSAW = new Date("2027-03-27T10:00:00+01:00");

/** Wall-clock time of `instant` in Warsaw, `YYYY-MM-DD HH:mm`. */
function warsaw(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

describe("T-01 closeDueAt (AC-1)", () => {
  it("covers exactly the 26 statuses of A6.4", () => {
    expect(STATES).toHaveLength(26);
  });

  it("photo_uploaded: the photo instant plus exactly 72 × 3600 s, across the Warsaw DST change", () => {
    expect(COMPLAINT_WINDOW_HOURS).toBe(72);
    const due = closeDueAt({
      status: "photo_uploaded",
      enteredAt: PHOTO_WARSAW,
    });
    expect(due?.toISOString()).toBe("2027-03-30T09:00:00.000Z");
    expect(due?.getTime()).toBe(PHOTO_WARSAW.getTime() + 72 * 3600 * 1000);
    expect(warsaw(PHOTO_WARSAW)).toBe("2027-03-27 10:00");
    expect(warsaw(due as Date)).toBe("2027-03-30 11:00");
  });

  it("resolved and refunded_full: the entering event's instant itself", () => {
    const entered = new Date("2027-05-02T13:14:15.678Z");
    expect(
      closeDueAt({ status: "resolved", enteredAt: entered })?.toISOString(),
    ).toBe("2027-05-02T13:14:15.678Z");
    expect(
      closeDueAt({
        status: "refunded_full",
        enteredAt: entered,
      })?.toISOString(),
    ).toBe("2027-05-02T13:14:15.678Z");
  });

  it("null for each of the other 23 statuses", () => {
    const others = STATES.map((state) => state.key).filter(
      (key) => !(CLOSABLE_STATUSES as readonly string[]).includes(key),
    );
    expect(others).toHaveLength(23);
    for (const status of others) {
      expect(closeDueAt({ status, enteredAt: PHOTO_WARSAW }), status).toBe(
        null,
      );
    }
  });

  it("null for a status the machine does not know", () => {
    expect(closeDueAt({ status: "nonsense", enteredAt: PHOTO_WARSAW })).toBe(
      null,
    );
  });
});

describe("order.closed v1 (spec 022a §5.2)", () => {
  it("is registered at version 1 as OrderClosedV1, with mode and from only", () => {
    const registered = eventSchema("order.closed");
    expect(registered?.version).toBe(1);
    expect(registered?.schema).toBe(OrderClosedV1);
    expect(Object.keys(OrderClosedV1.shape).sort()).toEqual(["from", "mode"]);
  });

  it("from is exactly the three closable statuses", () => {
    expect([...OrderClosedV1.shape.from.options].sort()).toEqual([
      "photo_uploaded",
      "refunded_full",
      "resolved",
    ]);
    expect(
      OrderClosedV1.safeParse({ mode: "live", from: "disputed" }).success,
    ).toBe(false);
    expect(
      OrderClosedV1.safeParse({ mode: "live", from: "resolved", note: "x" })
        .success,
    ).toBe(false);
  });

  it("the actor is system:order.close", () => {
    expect(CLOSE_ACTOR).toBe("system:order.close");
  });
});

describe("T-05 unit half: order.closed messages nobody (AC-5)", () => {
  it("has no outbox target in any mode, so a close writes no outbox row", () => {
    for (const mode of ORDER_MODES) {
      expect(outboxTargets("order.closed", mode), mode).toEqual([]);
    }
  });
});

describe("T-02 source half: no status write in the close module (AC-2)", () => {
  const folder = resolve(import.meta.dirname, "../../src/modules/orders/close");
  const files = readdirSync(folder).filter((name) => name.endsWith(".ts"));

  it("scans every file of the module", () => {
    expect(files.sort()).toEqual([
      "due.ts",
      "events.ts",
      "index.ts",
      "sweep.ts",
    ]);
  });

  it.each(files)("%s writes no status and touches no status switch", (name) => {
    const source = readFileSync(join(folder, name), "utf8");
    expect(source).not.toMatch(/UPDATE\s+"?order"?\b/i);
    expect(source).not.toMatch(/SET\s+status\b/i);
    expect(source).not.toMatch(/allow_status_write|transition_event/);
  });
});
