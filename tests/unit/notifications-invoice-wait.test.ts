/**
 * B1's bounded wait for the invoice, the pure half (spec 016 §5.2 "The invoice rides B1",
 * A-founder-2026-10-14b; AC-43; T-43's clock cases; TASK-334).
 *
 *  - `B1_INVOICE_WAIT` is 5 minutes.
 *  - `b1InvoiceDecision`: nothing pending sends; a pending invoice waits at 2 minutes and at 4:59,
 *    and sends at 5:00 and at 6 minutes; a retry due after the deadline sends now (never a retry
 *    past `B1_INVOICE_WAIT`); the last attempt sends.
 *  - `outboxRetryDueAt`: the dispatcher's own backoff (30 s doubling, capped, null at the 8th).
 *
 * The connected half (the B1 delivery, the link rows, B8) is
 * `tests/integration/invoice-email.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { B1_INVOICE_WAIT } from "@/config/notifications";
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_RETRY_CAP_SECONDS,
  outboxRetryDueAt,
} from "@/modules/orders";
import {
  InvoicePending,
  b1InvoiceDecision,
} from "../../src/modules/notifications/emails";

const CAPTURED = new Date("2026-10-16T09:00:00.000Z");
const at = (minutes: number, seconds = 0): Date =>
  new Date(CAPTURED.getTime() + minutes * 60_000 + seconds * 1000);
const DEADLINE = new Date(CAPTURED.getTime() + B1_INVOICE_WAIT);

describe("B1_INVOICE_WAIT", () => {
  it("is 5 minutes", () => {
    expect(B1_INVOICE_WAIT).toBe(300_000);
  });
});

describe("b1InvoiceDecision", () => {
  const decide = (
    now: Date,
    pending: number,
    retryDueAt: Date | null | undefined = now,
  ) => b1InvoiceDecision({ pending, now, deadline: DEADLINE, retryDueAt });

  it("sends at once when nothing is pending (every invoice stored, or invoice.issue off)", () => {
    expect(decide(at(0), 0)).toBe("send");
  });

  it("waits while an invoice is pending at 2 minutes and at 4:59", () => {
    expect(decide(at(2), 1)).toBe("wait");
    expect(decide(at(4, 59), 1)).toBe("wait");
    expect(decide(at(4, 59), 1, undefined)).toBe("wait");
  });

  it("sends at 5:00 and at 6 minutes, the invoice still pending", () => {
    expect(decide(at(5), 1)).toBe("send");
    expect(decide(at(6), 3)).toBe("send");
  });

  it("sends now when the next retry would be due after the deadline, and on the last attempt", () => {
    expect(decide(at(3, 30), 1, at(7, 30))).toBe("send");
    expect(decide(at(3, 30), 1, at(5, 1))).toBe("send");
    expect(decide(at(3, 30), 1, at(5))).toBe("wait");
    expect(decide(at(1), 1, null)).toBe("send");
  });

  it("InvoicePending carries the code and a count only", () => {
    const error = new InvoicePending(2);
    expect(error.code).toBe("INVOICE_PENDING");
    expect(error.message).toBe(
      "INVOICE_PENDING: 2 invoice(s) of the purchase not stored yet",
    );
  });
});

describe("outboxRetryDueAt", () => {
  it("is the claim's backoff: 30 s doubling per attempt, capped, null on the last", () => {
    expect(outboxRetryDueAt(at(0), 1)).toEqual(at(0, 30));
    expect(outboxRetryDueAt(at(0, 30), 2)).toEqual(at(1, 30));
    expect(outboxRetryDueAt(at(1, 30), 3)).toEqual(at(3, 30));
    expect(outboxRetryDueAt(at(3, 30), 4)).toEqual(at(7, 30));
    expect(outboxRetryDueAt(at(0), 7)?.getTime()).toBe(
      at(0).getTime() + Math.min(30 * 2 ** 6, OUTBOX_RETRY_CAP_SECONDS) * 1000,
    );
    expect(outboxRetryDueAt(at(0), OUTBOX_MAX_ATTEMPTS)).toBeNull();
    expect(outboxRetryDueAt(at(0), 3, 0)).toEqual(at(0));
  });

  it("with the production backoff, a purchase whose invoice never comes in time is sent by its fourth attempt, before 5 minutes", () => {
    let now = at(0);
    for (let attempt = 1; attempt <= OUTBOX_MAX_ATTEMPTS; attempt += 1) {
      const retryDueAt = outboxRetryDueAt(now, attempt);
      const decision = b1InvoiceDecision({
        pending: 1,
        now,
        deadline: DEADLINE,
        retryDueAt,
      });
      if (decision === "send") {
        expect(attempt).toBe(4);
        expect(now.getTime()).toBeLessThanOrEqual(DEADLINE.getTime());
        return;
      }
      now = retryDueAt ?? now;
    }
    throw new Error("B1 was never sent");
  });
});
