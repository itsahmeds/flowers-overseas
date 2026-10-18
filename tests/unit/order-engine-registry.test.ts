/**
 * The engine with only spec 010's own event schemas registered (hole 6 of the breaker's round 1
 * on PR 243; spec 010 §5.2 "Payload and actor are parsed before any write"; TASK-202).
 *
 * `tests/unit/order-engine.test.ts` registers a fixture schema for every catalogue event, so it
 * cannot see the refusal of an event nobody has registered. This file registers nothing.
 */
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  isOrderEngineError,
  registerEventSchema,
  OrderAuthorisedV1,
  type OrderExecutor,
} from "@/modules/orders";
import { appendEventWith } from "@/modules/orders/service/append-event";
import { transitionWith } from "@/modules/orders/service/transition";

const ORDER_ID = "3f0a6f8e-2c1b-4d5e-9f7a-8b6c5d4e3f21";

function silent(): { calls: SQL[]; executor: OrderExecutor } {
  const calls: SQL[] = [];
  return {
    calls,
    executor: {
      async execute(query: SQL) {
        calls.push(query);
        await Promise.resolve();
        return [];
      },
    },
  };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isOrderEngineError(error)) return error.code;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("an event with no registered schema", () => {
  it("is refused by transition before any statement", async () => {
    const { calls, executor } = silent();
    expect(
      await code(
        transitionWith(executor, ORDER_ID, "order.delivered", "system:x", {
          mode: "demo",
        }),
      ),
    ).toBe("ORDER_EVENT_UNREGISTERED");
    expect(calls).toEqual([]);
  });

  it("is refused by appendEvent before any write", async () => {
    const { calls, executor } = silent();
    expect(
      await code(
        appendEventWith(
          executor,
          ORDER_ID,
          "order.refund_requested",
          "admin:" + ORDER_ID,
          { mode: "demo" },
        ),
      ),
    ).toBe("ORDER_EVENT_UNREGISTERED");
    expect(calls).toHaveLength(1);
  });

  it("a name outside the catalogue is refused, and a second registration of a name throws", async () => {
    const { executor } = silent();
    expect(
      await code(
        transitionWith(executor, ORDER_ID, "order.accept", "system:x", {
          mode: "demo",
        }),
      ),
    ).toBe("ORDER_EVENT_UNREGISTERED");
    expect(() =>
      registerEventSchema("order.authorised", 2, OrderAuthorisedV1),
    ).toThrow(/already registered/);
  });
});
