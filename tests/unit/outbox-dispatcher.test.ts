/**
 * T-20, unit and type halves (spec 013 AC-20, §5.2 "Outbox routes this spec adds", "The
 * dispatcher"; spec 010 AC-20, AC-24; TASK-254).
 *
 *  - **type:** `HandlerRegistry` is `Record<OutboxTargetName, OutboxHandler>`, so a registry that
 *    misses a target does not compile. The `@ts-expect-error` below is the test: if the type ever
 *    stops requiring every target (a `Partial`, an index signature), the directive is unused and
 *    `pnpm typecheck` fails.
 *  - **routes:** spec 013's rows of `outboxTargets(event, mode)`, exactly; `demo` gets none; no
 *    route reaches a buyer or a recipient.
 *  - **registry:** a target nobody registered throws `<TARGET>_NOT_CONFIGURED`; a second
 *    registration of one target is refused.
 *
 * The connected half (trigger, delivery, retries, `dead`, the alert) is
 * `tests/integration/outbox-dispatcher.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  isOutboxHandlerRegistered,
  notConfiguredHandler,
  ORDER_EVENT_TYPES,
  ORDER_MODES,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_TARGET_NAMES,
  outboxHandlers,
  outboxTargets,
  OutboxTargetNotConfigured,
  paymentOutboxTargets,
  registerOutboxHandler,
  type HandlerRegistry,
  type OutboxDeliveryEvent,
  type OutboxHandler,
  type OutboxHandlerContext,
} from "@/modules/orders";

const noop: OutboxHandler = () => Promise.resolve();

// The type test (AC-20): every target needs a handler.
// @ts-expect-error -- `routing` has no handler, so this must not compile.
const missingRouting: HandlerRegistry = { payments: noop };
// @ts-expect-error -- `payments` has no handler, so this must not compile.
const missingPayments: HandlerRegistry = { routing: noop };
const complete: HandlerRegistry = { payments: noop, routing: noop };

const EVENT: OutboxDeliveryEvent = {
  eventId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  orderId: "3f0a6f8e-2c1b-4d5e-9f7a-8b6c5d4e3f21",
  type: "order.captured",
  seq: 2,
  fromStatus: "placed",
  toStatus: "paid_unrouted",
  mode: "test",
};

describe("HandlerRegistry (AC-20, type half)", () => {
  it("names exactly the targets of OUTBOX_TARGET_NAMES", () => {
    expect([...OUTBOX_TARGET_NAMES].sort()).toEqual(["payments", "routing"]);
    expect(Object.keys(complete).sort()).toEqual(
      [...OUTBOX_TARGET_NAMES].sort(),
    );
    // The two incomplete registries exist only for the compiler.
    expect(Object.keys(missingRouting)).toEqual(["payments"]);
    expect(Object.keys(missingPayments)).toEqual(["routing"]);
  });
});

describe("spec 013's outbox routes (§5.2)", () => {
  const TABLE: Readonly<Record<string, string>> = {
    "order.authorised": "routing",
    "order.captured": "routing",
    "assignment.accepted": "payments",
    "order.cancelled": "payments",
    "order.cancelled_refunded": "payments",
  };

  it("routes exactly §5.2's five events, the same target for test and live", () => {
    for (const event of ORDER_EVENT_TYPES) {
      for (const mode of ["test", "live"] as const) {
        const names = paymentOutboxTargets(event, mode).map((t) => t.name);
        expect(names, `${event} ${mode}`).toEqual(
          TABLE[event] === undefined ? [] : [TABLE[event]],
        );
      }
    }
  });

  it("gives a demo order no target at all (spec 010 AC-20: zero outbox rows)", () => {
    for (const event of ORDER_EVENT_TYPES) {
      expect(paymentOutboxTargets(event, "demo"), event).toEqual([]);
      expect(outboxTargets(event, "demo"), event).toEqual([]);
    }
  });

  it("reaches outboxTargets, once per name, and never a buyer or a recipient (spec 010 AC-24)", () => {
    for (const event of ORDER_EVENT_TYPES) {
      for (const mode of ORDER_MODES) {
        const targets = outboxTargets(event, mode);
        const names = targets.map((t) => t.name);
        expect(new Set(names).size, `${event} ${mode}`).toBe(names.length);
        for (const target of targets) {
          expect(["buyer", "recipient"], `${event} ${mode}`).not.toContain(
            target.audience,
          );
        }
      }
    }
    expect(outboxTargets("order.captured", "live").map((t) => t.name)).toEqual([
      "routing",
    ]);
    expect(
      outboxTargets("assignment.accepted", "test").map((t) => t.name),
    ).toEqual(["payments"]);
  });
});

describe("the handler registry (AC-20; AC-12's ROUTING_NOT_CONFIGURED)", () => {
  const context = (target: "payments" | "routing"): OutboxHandlerContext => ({
    deliveryId: "0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
    outboxId: "1c9f8e7d-6b5a-4f4e-9d3c-2b1a0f9e8d7c",
    target,
    attempt: 1,
    executor: { execute: () => Promise.resolve([]) },
  });

  it("a target with no registered handler throws its NOT_CONFIGURED code", async () => {
    for (const target of OUTBOX_TARGET_NAMES) {
      const error = await notConfiguredHandler(target)(
        EVENT,
        context(target),
      ).then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(OutboxTargetNotConfigured);
      expect((error as OutboxTargetNotConfigured).code).toBe(
        `${target.toUpperCase()}_NOT_CONFIGURED`,
      );
      expect((error as Error).message).toContain(
        `${target.toUpperCase()}_NOT_CONFIGURED`,
      );
    }
  });

  it("the job's registry stands in for an unregistered target, uses a registered one, and refuses a second registration", async () => {
    expect(isOutboxHandlerRegistered("routing")).toBe(false);
    await expect(
      outboxHandlers().routing(EVENT, context("routing")),
    ).rejects.toThrow("ROUTING_NOT_CONFIGURED");

    const calls: OutboxDeliveryEvent[] = [];
    registerOutboxHandler("routing", (event) => {
      calls.push(event);
      return Promise.resolve();
    });
    expect(isOutboxHandlerRegistered("routing")).toBe(true);
    await outboxHandlers().routing(EVENT, context("routing"));
    expect(calls).toEqual([EVENT]);
    expect(() => registerOutboxHandler("routing", noop)).toThrow(
      "already registered",
    );
    // `payments` is still the stand-in.
    expect(isOutboxHandlerRegistered("payments")).toBe(false);
    await expect(
      outboxHandlers().payments(EVENT, context("payments")),
    ).rejects.toThrow("PAYMENTS_NOT_CONFIGURED");
  });

  it("goes dead after 8 attempts (spec 013 §5.2)", () => {
    expect(OUTBOX_MAX_ATTEMPTS).toBe(8);
  });
});
