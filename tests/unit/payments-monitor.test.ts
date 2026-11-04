/**
 * Spec 013 §11 (AC-39, AC-40; TASK-264): the two monitor rules of `payments.monitor`, pure, and
 * the job's mapping from rows to alerts over a fake executor. The integration half (T-39, T-40
 * against migrated tables) is `tests/integration/payments-monitor.test.ts`.
 *
 * Instants are written in UTC with the Warsaw reading beside them; the destination is Warsaw with
 * a 14:00 same-day cutoff (`CountryOperations` shape, as data).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage,
  getCurrentScope: () => ({ setTag: () => undefined }),
}));

const { captureAlert } = await import("../../src/lib/sentry");
const {
  PAID_NOT_ROUTED_AFTER_MINUTES,
  WEBHOOK_QUIET_SITE_DAYS,
  WEBHOOK_SILENCE_HOURS,
} = await import("../../src/config/payments");
const {
  defaultFirstOfferAt,
  paidNotRoutedDue,
  runPaymentsMonitor,
  webhookSilent,
} = await import("../../src/modules/payments/monitor");
const { createLogger } = await import("../../src/lib/logger");

type UnroutedOrder = import("../../src/modules/payments/monitor").UnroutedOrder;

const WARSAW = { ianaZone: "Europe/Warsaw", sameDayCutoffLocal: "14:00" };
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const plus = (instant: Date, ms: number): Date =>
  new Date(instant.getTime() + ms);

function order(securedAt: string, deliveryDate: string): UnroutedOrder {
  return { securedAt: new Date(securedAt), deliveryDate, destination: WARSAW };
}

describe("the constants (spec 013 AC-39, AC-40, §13 Q10)", () => {
  it("are 5 minutes, 24 hours and 7 days", () => {
    expect(PAID_NOT_ROUTED_AFTER_MINUTES).toBe(5);
    expect(WEBHOOK_SILENCE_HOURS).toBe(24);
    expect(WEBHOOK_QUIET_SITE_DAYS).toBe(7);
  });
});

describe("paidNotRoutedDue (AC-39)", () => {
  // 10:00 Warsaw (CET) on Wednesday 4 Nov 2026, delivery the next day: offered at once.
  const day = order("2026-11-04T09:00:00Z", "2026-11-05");

  it("a daytime order secured at 10:00 is not due at 10:05:00 and is due at 10:05:01", () => {
    expect(defaultFirstOfferAt(day).toISOString()).toBe(
      "2026-11-04T09:00:00.000Z",
    );
    expect(paidNotRoutedDue(day, new Date("2026-11-04T09:04:59Z"))).toBe(false);
    expect(paidNotRoutedDue(day, new Date("2026-11-04T09:05:00Z"))).toBe(false);
    expect(paidNotRoutedDue(day, new Date("2026-11-04T09:05:01Z"))).toBe(true);
  });

  it("an order secured at 23:00 Warsaw is expected at 07:30 and due only after 07:35", () => {
    // 23:00 CET on 4 Nov = 22:00Z; 07:30 CET on 5 Nov = 06:30Z.
    const night = order("2026-11-04T22:00:00Z", "2026-11-06");
    expect(defaultFirstOfferAt(night).toISOString()).toBe(
      "2026-11-05T06:30:00.000Z",
    );
    expect(paidNotRoutedDue(night, new Date("2026-11-04T22:05:01Z"))).toBe(
      false,
    );
    expect(paidNotRoutedDue(night, new Date("2026-11-05T06:35:00Z"))).toBe(
      false,
    );
    expect(paidNotRoutedDue(night, new Date("2026-11-05T06:35:01Z"))).toBe(
      true,
    );
  });

  it("the autumn DST night (25 Oct 2026, 03:00 CEST -> 02:00 CET): 07:30 is read on the new offset", () => {
    // 23:00 CEST on 24 Oct = 21:00Z; 07:30 CET on 25 Oct = 06:30Z (not 05:30Z, the old offset).
    const dst = order("2026-10-24T21:00:00Z", "2026-10-26");
    expect(defaultFirstOfferAt(dst).toISOString()).toBe(
      "2026-10-25T06:30:00.000Z",
    );
    expect(paidNotRoutedDue(dst, new Date("2026-10-25T05:36:00Z"))).toBe(false);
    expect(paidNotRoutedDue(dst, new Date("2026-10-25T06:35:00Z"))).toBe(false);
    expect(paidNotRoutedDue(dst, new Date("2026-10-25T06:35:01Z"))).toBe(true);
  });

  it("the spring DST night (28 Mar 2027, 02:00 CET -> 03:00 CEST): 07:30 is read on the new offset", () => {
    // 23:00 CET on 27 Mar = 22:00Z; 07:30 CEST on 28 Mar = 05:30Z.
    const dst = order("2027-03-27T22:00:00Z", "2027-03-29");
    expect(defaultFirstOfferAt(dst).toISOString()).toBe(
      "2027-03-28T05:30:00.000Z",
    );
    expect(paidNotRoutedDue(dst, new Date("2027-03-28T05:35:00Z"))).toBe(false);
    expect(paidNotRoutedDue(dst, new Date("2027-03-28T05:35:01Z"))).toBe(true);
  });

  it("without agreed operations the expected first offer is the secured instant (AC-39's default)", () => {
    const bare: UnroutedOrder = {
      securedAt: new Date("2026-11-04T22:00:00Z"),
      deliveryDate: "2026-11-06",
      destination: null,
    };
    expect(defaultFirstOfferAt(bare).toISOString()).toBe(
      "2026-11-04T22:00:00.000Z",
    );
    expect(paidNotRoutedDue(bare, new Date("2026-11-04T22:05:00Z"))).toBe(
      false,
    );
    expect(paidNotRoutedDue(bare, new Date("2026-11-04T22:05:01Z"))).toBe(true);
  });

  it("an injected first-offer rule (the fault-injection hook) is the one read", () => {
    const rule = vi.fn(() => new Date("2026-11-04T12:00:00Z"));
    expect(paidNotRoutedDue(day, new Date("2026-11-04T12:05:00Z"), rule)).toBe(
      false,
    );
    expect(paidNotRoutedDue(day, new Date("2026-11-04T12:05:01Z"), rule)).toBe(
      true,
    );
    expect(rule).toHaveBeenCalledWith(day);
  });
});

describe("webhookSilent (AC-40, §13 Q10)", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  const facts = (over: Partial<Parameters<typeof webhookSilent>[0]> = {}) => ({
    stripeOn: true,
    lastWebhookAt: plus(now, -25 * HOUR),
    lastPaymentAt: plus(now, -3 * DAY),
    ...over,
  });

  it("last row 25 h ago and a payment 3 days ago: silent", () => {
    expect(webhookSilent(facts(), now)).toBe(true);
  });
  it("last row 23 h ago: not silent", () => {
    expect(
      webhookSilent(facts({ lastWebhookAt: plus(now, -23 * HOUR) }), now),
    ).toBe(false);
  });
  it("last row exactly 24 h ago still counts as received; 24 h and a second does not", () => {
    expect(
      webhookSilent(facts({ lastWebhookAt: plus(now, -24 * HOUR) }), now),
    ).toBe(false);
    expect(
      webhookSilent(
        facts({ lastWebhookAt: plus(now, -24 * HOUR - SECOND) }),
        now,
      ),
    ).toBe(true);
  });
  it("payments.stripe off: not silent", () => {
    expect(webhookSilent(facts({ stripeOn: false }), now)).toBe(false);
  });
  it("no payment at all, or none in 7 days: legitimately quiet", () => {
    expect(webhookSilent(facts({ lastPaymentAt: null }), now)).toBe(false);
    expect(
      webhookSilent(
        facts({ lastPaymentAt: plus(now, -7 * DAY - SECOND) }),
        now,
      ),
    ).toBe(false);
  });
  it("a payment 6 days ago, or exactly 7 days ago, is recent: silent", () => {
    expect(
      webhookSilent(facts({ lastPaymentAt: plus(now, -6 * DAY) }), now),
    ).toBe(true);
    expect(
      webhookSilent(facts({ lastPaymentAt: plus(now, -7 * DAY) }), now),
    ).toBe(true);
  });
  it("no row ever received, with a recent payment: silent", () => {
    expect(webhookSilent(facts({ lastWebhookAt: null }), now)).toBe(true);
  });
});

describe("captureAlert's fingerprint (AC-39: one Sentry issue per order)", () => {
  beforeEach(() => {
    captureMessage.mockClear();
  });

  it("passes the fingerprint through, and leaves Sentry's default without one", () => {
    const orderId = "6f1c1b54-8f0e-4c55-9f3d-0f4b0f6a2c11";
    captureAlert(
      "payment.paid_not_routed",
      { order_id: orderId },
      { fingerprint: ["payment.paid_not_routed", orderId] },
    );
    expect(captureMessage).toHaveBeenCalledWith("payment.paid_not_routed", {
      level: "error",
      fingerprint: ["payment.paid_not_routed", orderId],
      tags: { alert: "payment.paid_not_routed", order_id: orderId },
      extra: { order_id: orderId },
    });
    captureAlert("outbox.dead", { order_id: orderId });
    const [, second] = captureMessage.mock.calls[1] as [
      string,
      Record<string, unknown>,
    ];
    expect(Object.hasOwn(second, "fingerprint")).toBe(false);
  });
});

describe("runPaymentsMonitor over a fake executor", () => {
  const STUCK = "11111111-1111-4111-8111-111111111111";
  const NIGHT = "22222222-2222-4222-8222-222222222222";
  const now = new Date("2026-11-04T09:05:01Z");

  function fakeTransaction(
    unrouted: readonly Record<string, unknown>[],
    silence: Record<string, unknown>,
  ) {
    const statements: string[] = [];
    const execute = vi.fn(async (query: unknown) => {
      statements.push(JSON.stringify(query));
      return statements.length === 1 ? unrouted : [silence];
    });
    return {
      statements,
      transaction: <T>(fn: (executor: never) => Promise<T>) =>
        fn({ execute } as never),
    };
  }

  const lines: Record<string, unknown>[] = [];
  const log = createLogger({
    level: "info",
    pretty: false,
    write: (line: string) => {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  });

  beforeEach(() => {
    lines.length = 0;
  });

  it("alerts the due order only, fingerprinted by order, with ids and the job name only", async () => {
    const fake = fakeTransaction(
      [
        {
          id: STUCK,
          delivery_date: "2026-11-05",
          iana_zone: "Europe/Warsaw",
          same_day_cutoff_local: "14:00",
          secured_at: "2026-11-04T09:00:00Z",
        },
        {
          id: NIGHT,
          delivery_date: "2026-11-06",
          iana_zone: "Europe/Warsaw",
          same_day_cutoff_local: "14:00",
          secured_at: "2026-11-03T22:00:00Z",
        },
      ],
      { stripe_on: false, last_webhook_at: null, last_payment_at: null },
    );
    const alert = vi.fn();
    const first = await runPaymentsMonitor({
      transaction: fake.transaction,
      now: () => now,
      alert,
      log,
      livemode: false,
    });
    // NIGHT was secured at 23:00 the night before; it was expected at 07:30 and is overdue too.
    expect(first).toEqual({ paidNotRouted: 2, webhookSilent: false });
    const second = await runPaymentsMonitor({
      transaction: fakeTransaction(
        [
          {
            id: STUCK,
            delivery_date: "2026-11-05",
            iana_zone: "Europe/Warsaw",
            same_day_cutoff_local: "14:00",
            secured_at: "2026-11-04T09:00:00Z",
          },
        ],
        { stripe_on: false, last_webhook_at: null, last_payment_at: null },
      ).transaction,
      now: () => plus(now, MINUTE),
      alert,
      log,
      livemode: false,
    });
    expect(second.paidNotRouted).toBe(1);
    const stuckCalls = alert.mock.calls.filter(
      (call) => (call[1] as { order_id: string }).order_id === STUCK,
    );
    expect(stuckCalls).toHaveLength(2);
    for (const call of stuckCalls) {
      expect(call).toEqual([
        "payment.paid_not_routed",
        { order_id: STUCK, job: "payments.monitor" },
        { fingerprint: ["payment.paid_not_routed", STUCK] },
      ]);
    }
    for (const line of lines) {
      const keys = Object.keys(line).filter(
        (key) => !["level", "time", "msg", "pid", "hostname"].includes(key),
      );
      for (const key of keys) {
        expect(["order_id", "job", "provider", "livemode"]).toContain(key);
      }
    }
  });

  it("reads the inbox of the environment's livemode, and alerts the silence once with its fingerprint", async () => {
    const fake = fakeTransaction([], {
      stripe_on: true,
      last_webhook_at: plus(now, -25 * HOUR).toISOString(),
      last_payment_at: plus(now, -3 * DAY).toISOString(),
    });
    const alert = vi.fn();
    const counts = await runPaymentsMonitor({
      transaction: fake.transaction,
      now: () => now,
      alert,
      log,
      livemode: true,
    });
    expect(counts).toEqual({ paidNotRouted: 0, webhookSilent: true });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      "webhook.silent_24h",
      { provider: "stripe", livemode: true, job: "payments.monitor" },
      { fingerprint: ["webhook.silent_24h"] },
    );
    expect(fake.statements[1]).toContain("w.livemode = ");
    expect(fake.statements[1]).toContain("true");
  });
});
