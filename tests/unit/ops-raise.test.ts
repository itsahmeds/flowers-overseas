/**
 * Spec 025 T-3 (AC-3), T-4 (AC-4), T-38 (AC-38) and the call-site adapter (AC-1; TASK-488), with
 * seams instead of a database:
 *
 *  - an unknown name, a context with `recipientName`, and a context with a free-text `note` are
 *    refused by zod with no database call; strict mode throws, otherwise `alerts.invalid` is
 *    logged and the Sentry spy is called once;
 *  - a transaction that fails still sends the Sentry event with the `alert` and `order_id` tags
 *    and logs `alerts.record_failed`;
 *  - every field of every line the module logs is on §8's allowlist, and none of a fixture's
 *    personal data reaches a line;
 *  - `inputFromFields` keeps the order, the provider as component, and only valid closed-set keys.
 */
import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger.ts";
import {
  AlertInputError,
  OPS_LOG_FIELDS,
  type OpsTransaction,
  inputFromFields,
  raiseAlert,
} from "../../src/modules/ops/index.ts";

const ORDER = "8b0c7a52-1f0e-4d4e-9a57-3c2b1a0f9e88";

function capturedLogger() {
  const lines: Record<string, unknown>[] = [];
  const log = createLogger({
    level: "trace",
    write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  });
  return { log, lines };
}

const BASE_KEYS = new Set(["level", "time", "msg", "service", "env"]);

function fieldKeys(lines: Record<string, unknown>[]): string[] {
  return [...new Set(lines.flatMap((line) => Object.keys(line)))].filter(
    (key) => !BASE_KEYS.has(key),
  );
}

describe("T-3 (AC-3) · an invalid raise writes nothing", () => {
  const cases = [
    ["an unknown name", "payment.made_up", {}],
    [
      "a context with recipientName",
      "routing.no_partner",
      { orderId: ORDER, context: { recipientName: "Anna Kowalska" } },
    ],
    [
      "a context with a free-text note",
      "routing.no_partner",
      {
        orderId: ORDER,
        context: { note: "please call Anna on +48 600 100 200" },
      },
    ],
    [
      "a closed key carrying a sentence",
      "routing.no_partner",
      { orderId: ORDER, context: { reason: "call Anna Kowalska" } },
    ],
  ] as const;

  it.each(cases)(
    "%s: strict mode throws, no transaction",
    async (_label, name, input) => {
      const transaction = vi.fn() as unknown as OpsTransaction;
      const sentry = vi.fn();
      await expect(
        raiseAlert(name as "routing.no_partner", input as never, {
          transaction,
          sentry,
          strict: true,
          enqueue: vi.fn(),
        }),
      ).rejects.toBeInstanceOf(AlertInputError);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each(cases)(
    "%s: production logs alerts.invalid and still sends Sentry once",
    async (_label, name, input) => {
      const transaction = vi.fn() as unknown as OpsTransaction;
      const sentry = vi.fn();
      const { log, lines } = capturedLogger();
      const result = await raiseAlert(
        name as "routing.no_partner",
        input as never,
        {
          transaction,
          sentry,
          strict: false,
          log,
          enqueue: vi.fn(),
        },
      );
      expect(result.outcome).toBe("invalid");
      expect(transaction).not.toHaveBeenCalled();
      expect(sentry).toHaveBeenCalledTimes(1);
      expect(lines.map((line) => line["msg"])).toEqual(["alerts.invalid"]);
      const text = JSON.stringify(lines);
      expect(text).not.toContain("Anna");
      expect(text).not.toContain("600 100 200");
    },
  );
});

describe("T-4 (AC-4) · the database write fails", () => {
  it("still sends the Sentry event with alert and order_id, and logs alerts.record_failed", async () => {
    const sentry = vi.fn();
    const { log, lines } = capturedLogger();
    const failing: OpsTransaction = () =>
      Promise.reject(new Error("connection refused"));
    const result = await raiseAlert(
      "routing.no_partner",
      { orderId: ORDER },
      { transaction: failing, sentry, log, strict: true, enqueue: vi.fn() },
    );
    expect(result.outcome).toBe("record_failed");
    expect(sentry).toHaveBeenCalledTimes(1);
    expect(sentry.mock.calls[0]?.[0]).toBe("routing.no_partner");
    expect(sentry.mock.calls[0]?.[1]).toMatchObject({ order_id: ORDER });
    expect(lines.map((line) => line["msg"])).toEqual(["alerts.record_failed"]);
    expect(lines[0]).toMatchObject({
      alert: "routing.no_partner",
      order_id: ORDER,
      outcome: "record_failed",
    });
  });
});

describe("T-38 (AC-38) · the log allowlist", () => {
  it("writes only allowlisted fields, whatever the caller offered", async () => {
    const { log, lines } = capturedLogger();
    await raiseAlert(
      "routing.no_partner",
      { orderId: ORDER, context: { recipientName: "Anna" } as never },
      {
        transaction: vi.fn() as never,
        sentry: vi.fn(),
        log,
        strict: false,
        enqueue: vi.fn(),
      },
    );
    await raiseAlert(
      "routing.no_partner",
      { orderId: ORDER },
      {
        transaction: () => Promise.reject(new Error("x")),
        sentry: vi.fn(),
        log,
        strict: true,
        enqueue: vi.fn(),
      },
    );
    const allowed = new Set<string>(OPS_LOG_FIELDS);
    expect(fieldKeys(lines).filter((key) => !allowed.has(key))).toEqual([]);
    expect(JSON.stringify(lines)).not.toContain("Anna");
  });
});

describe("the call-site adapter (AC-1)", () => {
  it("keeps the order, the provider as component, the partner as sub-key and only valid closed keys", () => {
    expect(
      inputFromFields("routing.no_partner", {
        order_id: ORDER,
        job: "order.route",
        recipient_name: "Anna",
        attempts: 3,
      }),
    ).toEqual({
      orderId: ORDER,
      context: { job: "order.route", attempts: 3 },
    });
    expect(
      inputFromFields("webhook.dead", {
        inbox_id: ORDER,
        provider: "resend",
      }),
    ).toEqual({
      component: "resend",
      context: { inbox_id: ORDER, provider: "resend" },
    });
    expect(
      inputFromFields("notifications.florist_bounce", { partner_id: ORDER }),
    ).toMatchObject({ subKey: ORDER });
    expect(
      inputFromFields("invoice.refused", { code: "has spaces in it" }),
    ).toEqual({ context: {} });
  });
});
