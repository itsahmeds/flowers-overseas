/**
 * Loading the `payments` barrel registers spec 013's event schemas in spec 010's registry
 * (spec 013 §5.2 "Events this spec registers", AC-19; TASK-254's hand-off to TASK-255). This file
 * imports the barrel and the registry only, never `events.ts`, so the barrel's own import is the
 * one under test: without `import "./events"` every case is red.
 */
import { describe, expect, it } from "vitest";

import { registeredEventTypes } from "@/modules/orders";
import "@/modules/payments";

const PAYMENT_EVENT_TYPES = [
  "order.payment_failed",
  "order.abandoned",
  "order.cancelled",
  "order.refunded_partial",
  "order.refunded_full",
  "order.chargeback_opened",
  "order.chargeback_won",
  "order.chargeback_lost",
  "order.refund_requested",
  "order.payment_attempt_failed",
] as const;

describe("the payments barrel registers the payment event schemas", () => {
  it.each(PAYMENT_EVENT_TYPES)(
    "%s is registered once the barrel is loaded",
    (type) => {
      expect(registeredEventTypes()).toContain(type);
    },
  );
});
