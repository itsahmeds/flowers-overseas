/**
 * The florist inbox's pure rules and seams (spec 011 AC-24, AC-25, AC-26, AC-33; TASK-214).
 *
 *  - The stage rule: which page an assignment is at, including the answer-by boundary, an open
 *    offer on a cancelled order (hidden), and the photo removing the recipient.
 *  - T-25 schema half: the order view's key set equals the fixture list, with no buyer key.
 *  - T-26 unit half: the refresh loop with fake timers (every 5 s while visible, nothing while
 *    hidden, stopped after 10 minutes without an interaction, an interaction restarting the clock).
 *  - T-33 unit half: `placeDemoOrder`, the test-order control's rule and `florists:demo-member`
 *    refuse in production before any engine call or query; the demo code inserts no order, event
 *    or assignment row itself (source scan).
 *  - The after-answer seam: which effect an order gets, and what the demo effect writes.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

import {
  demoMember,
  parseDemoMemberArgs,
} from "../../scripts/florists-demo-member.ts";
import { floristsConfig } from "../../src/config/florists.ts";
import {
  acceptedOrderEffectFor,
  createDemoOrderEffect,
  DemoOrderRefused,
  demoRefusedIn,
  placeDemoOrder,
} from "../../src/modules/orders/demo/index.ts";
import { floristStageOf } from "../../src/modules/orders/index.ts";
import {
  FloristOrderViewSchema,
  FloristRecipientSchema,
  startInboxRefresh,
} from "../../src/modules/partners/index.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const NOW = new Date("2026-10-24T09:00:00Z");
const SLA = new Date("2026-10-24T10:00:00Z");

function stage(
  status: string,
  response: "accept" | null,
  extra: { hasPhoto?: boolean; withdrawnAt?: Date; now?: Date } = {},
) {
  return floristStageOf(
    {
      status,
      response,
      slaExpiresAt: SLA,
      withdrawnAt: extra.withdrawnAt ?? null,
      hasPhoto: extra.hasPhoto ?? false,
    },
    extra.now ?? NOW,
  );
}

describe("the stage rule (AC-24, AC-25)", () => {
  it("an open offer is an offer until its answer-by instant, then expired, timeout written or not", () => {
    expect(stage("routed", null)).toBe("offer");
    expect(stage("routed", null, { now: new Date(SLA.getTime() - 1) })).toBe(
      "offer",
    );
    expect(stage("routed", null, { now: SLA })).toBe("expired");
  });

  it("an open offer on an order that has moved on is not shown", () => {
    for (const status of [
      "cancelled",
      "cancelled_refunded",
      "no_partner_available",
      "manual_reroute",
      "authorised",
    ]) {
      expect(stage(status, null), status).toBeNull();
    }
  });

  it("an accepted offer follows the order: being made, out, delivered, photo received", () => {
    for (const status of [
      "accepted",
      "paid",
      "in_production",
      "awaiting_buyer",
    ]) {
      expect(stage(status, "accept"), status).toBe("accepted");
    }
    for (const status of [
      "out_for_delivery",
      "delivery_failed",
      "redelivery_scheduled",
    ]) {
      expect(stage(status, "accept"), status).toBe("outForDelivery");
    }
    expect(stage("delivered", "accept")).toBe("delivered");
    expect(stage("delivered", "accept", { hasPhoto: true })).toBe(
      "photoReceived",
    );
    expect(stage("photo_uploaded", "accept", { hasPhoto: true })).toBe(
      "photoReceived",
    );
  });

  it("fails closed: a cancelled accepted order, or a closed one with no photo, is not shown", () => {
    for (const status of ["cancelled", "refunded_full", "closed", "routed"]) {
      expect(stage(status, "accept"), status).toBeNull();
    }
  });

  it("a withdrawn assignment is withdrawn whatever the order's status", () => {
    expect(stage("cancelled", "accept", { withdrawnAt: NOW })).toBe(
      "withdrawn",
    );
    expect(stage("routed", null, { withdrawnAt: NOW })).toBe("withdrawn");
  });
});

/** Every key a variant of a zod object union carries (one level, plus the recipient's). */
function keysOf(schema: z.ZodType): string[] {
  const shape = (schema as unknown as { shape: Record<string, unknown> }).shape;
  return Object.keys(shape);
}

describe("T-25 — the order view carries no buyer field", () => {
  const VIEW_KEYS = [
    "stage",
    "assignmentId",
    "product",
    "delivery",
    "payout",
    "answerBy",
    "recipient",
    "photoUrl",
  ];
  const RECIPIENT_KEYS = [
    "fullName",
    "phoneE164",
    "addressLines",
    "deliveryNote",
    "cardMessage",
  ];

  it("the union's key set equals the fixture list, and the recipient's too", () => {
    const keys = new Set(
      FloristOrderViewSchema.options.flatMap((option) => keysOf(option)),
    );
    expect([...keys].sort()).toEqual([...VIEW_KEYS].sort());
    expect(keysOf(FloristRecipientSchema).sort()).toEqual(
      [...RECIPIENT_KEYS].sort(),
    );
  });

  it("only the accepted, out-for-delivery and delivered stages carry a recipient", () => {
    const withRecipient = FloristOrderViewSchema.options
      .filter((option) => keysOf(option).includes("recipient"))
      .map(
        (option) => (option.shape.stage as unknown as { value: string }).value,
      )
      .sort();
    expect(withRecipient).toEqual(["accepted", "delivered", "outForDelivery"]);
  });
});

describe("T-26 — the refresh loop (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const { intervalMs, idleStopMs } = floristsConfig.inboxRefresh;

  function loop(visible: { value: boolean }) {
    const refresh = vi.fn();
    const onStop = vi.fn();
    const handle = startInboxRefresh({
      intervalMs,
      idleStopMs,
      refresh,
      onStop,
      isVisible: () => visible.value,
    });
    return { refresh, onStop, handle };
  }

  it("refreshes every 5 s while visible", () => {
    const { refresh, handle } = loop({ value: true });
    vi.advanceTimersByTime(intervalMs - 1);
    expect(refresh).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(intervalMs * 3);
    expect(refresh).toHaveBeenCalledTimes(4);
    handle.dispose();
  });

  it("does nothing while hidden and resumes when shown", () => {
    const visible = { value: true };
    const { refresh, handle } = loop(visible);
    visible.value = false;
    handle.visibilityChanged();
    vi.advanceTimersByTime(intervalMs * 10);
    expect(refresh).toHaveBeenCalledTimes(0);
    visible.value = true;
    handle.visibilityChanged();
    vi.advanceTimersByTime(intervalMs);
    expect(refresh).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  it("checks visibility at every tick, even when no visibilitychange event arrived", () => {
    const visible = { value: true };
    const { refresh, handle } = loop(visible);
    visible.value = false;
    vi.advanceTimersByTime(intervalMs * 10);
    expect(refresh).toHaveBeenCalledTimes(0);
    handle.dispose();
  });

  it("stops after 10 minutes without an interaction, and an interaction restarts the clock", () => {
    const { refresh, onStop, handle } = loop({ value: true });
    vi.advanceTimersByTime(idleStopMs - intervalMs);
    handle.touch();
    vi.advanceTimersByTime(idleStopMs - intervalMs);
    expect(onStop).not.toHaveBeenCalled();
    const before = refresh.mock.calls.length;
    vi.advanceTimersByTime(intervalMs * 2);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(handle.stopped()).toBe(true);
    const at = refresh.mock.calls.length;
    expect(at).toBeLessThanOrEqual(before + 1);
    vi.advanceTimersByTime(idleStopMs);
    expect(refresh.mock.calls.length).toBe(at);
    handle.touch();
    handle.visibilityChanged();
    vi.advanceTimersByTime(idleStopMs);
    expect(refresh.mock.calls.length).toBe(at);
  });

  it("with no interaction at all, the 120th tick is the last", () => {
    const { refresh, onStop } = loop({ value: true });
    vi.advanceTimersByTime(idleStopMs * 2);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(idleStopMs / intervalMs - 1);
  });
});

describe("T-33 — the demo entry points refuse in production", () => {
  it("placeDemoOrder refuses before any engine call", async () => {
    const engine = {
      place: vi.fn(),
      transition: vi.fn(),
      demoRoute: vi.fn(),
    };
    const executor = { execute: vi.fn() };
    await expect(
      placeDemoOrder(
        { partnerId: "6f1c2a40-3b7e-4c1d-9a55-0d2e4f6a8b10" },
        { environment: "production", engine: engine as never, executor },
      ),
    ).rejects.toEqual(new DemoOrderRefused("production"));
    expect(engine.place).not.toHaveBeenCalled();
    expect(engine.demoRoute).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("the test-order control's rule: production only is refused", () => {
    expect(demoRefusedIn("production")).toBe(true);
    for (const environment of ["development", "test", "preview", "staging"]) {
      expect(demoRefusedIn(environment), environment).toBe(false);
    }
  });

  it("florists:demo-member refuses in production without a query", async () => {
    const sql = new Proxy(
      {},
      {
        get() {
          throw new Error("no query may run in production");
        },
      },
    ) as postgres.Sql;
    for (const action of ["add", "remove"]) {
      const args = parseDemoMemberArgs([
        action,
        "--email",
        "Someone@Example.test",
        "--partner",
        "demo-pl-1",
      ]);
      expect(args.email).toBe("someone@example.test");
      await expect(demoMember(sql, args, "production")).resolves.toEqual({
        kind: "refused",
        reason: "production",
      });
    }
  });

  it("florists:demo-member takes exactly one action and a valid language", () => {
    expect(() =>
      parseDemoMemberArgs(["--email", "a@example.test", "--partner", "p"]),
    ).toThrow();
    expect(() =>
      parseDemoMemberArgs([
        "add",
        "--email",
        "a@example.test",
        "--partner",
        "p",
        "--language",
        "fr",
      ]),
    ).toThrow();
  });

  it("the demo code inserts no order, event or assignment row itself", () => {
    const dir = join(ROOT, "src/modules/orders/demo");
    const sources = readdirSync(dir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(join(dir, name), "utf8"));
    expect(sources.length).toBeGreaterThanOrEqual(3);
    for (const source of sources) {
      expect(source).not.toMatch(
        /INSERT\s+INTO\s+"?(?:order|order_line|order_event|order_assignment|outbox)"?\b/iu,
      );
      expect(source).not.toMatch(/UPDATE\s+"?(?:order|order_assignment)"?\b/iu);
    }
    const place = readFileSync(join(dir, "place-demo-order.ts"), "utf8");
    expect(place).toMatch(/engine\.place\(/u);
    expect(place).toMatch(/engine\.demoRoute\(/u);
  });
});

describe("the after-answer seam", () => {
  const ORDER = "0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

  it("demo orders get the demo effect outside production and the unconfigured one in it; test and live take spec 013's payment effect for the accept half in every environment (never the demo effect, spec 013 AC-13) and spec 016's router for the decline half (TASK-328, TASK-259)", async () => {
    const demo = {
      afterAccept: vi.fn(async () => undefined),
      afterDecline: vi.fn(async () => undefined),
    };
    const unconfigured = {
      afterAccept: vi.fn(async () => undefined),
      afterDecline: vi.fn(async () => undefined),
    };
    const paid = { afterAccept: vi.fn(async () => undefined) };
    const routed = { afterDecline: vi.fn(async () => undefined) };
    const choose = (mode: "demo" | "test" | "live", environment: string) =>
      acceptedOrderEffectFor(mode, environment, {
        demo,
        unconfigured,
        routed,
        paid,
      });
    expect(choose("demo", "staging")).toBe(demo);
    expect(choose("demo", "production")).toBe(unconfigured);

    const cases = [
      ["test", "preview"],
      ["test", "staging"],
      ["live", "staging"],
      ["test", "production"],
      ["live", "production"],
    ] as const;
    for (const [mode, environment] of cases) {
      for (const spy of [demo, unconfigured]) {
        spy.afterAccept.mockClear();
        spy.afterDecline.mockClear();
      }
      paid.afterAccept.mockClear();
      routed.afterDecline.mockClear();
      const effect = choose(mode, environment);
      await effect.afterAccept({ orderId: ORDER, mode });
      await effect.afterDecline({ orderId: ORDER, mode });
      expect(paid.afterAccept, `${mode}/${environment}`).toHaveBeenCalledWith({
        orderId: ORDER,
        mode,
      });
      expect(demo.afterAccept, `${mode}/${environment}`).not.toHaveBeenCalled();
      expect(
        unconfigured.afterAccept,
        `${mode}/${environment}`,
      ).not.toHaveBeenCalled();
      expect(
        routed.afterDecline,
        `${mode}/${environment}`,
      ).toHaveBeenCalledWith({
        orderId: ORDER,
        mode,
      });
      expect(demo.afterDecline).not.toHaveBeenCalled();
      expect(unconfigured.afterDecline).not.toHaveBeenCalled();
    }
  });

  it("after an accept the demo effect writes captured then in_production by system:demo; after a decline no_partner_available", async () => {
    const transition = vi.fn().mockResolvedValue(undefined);
    const effect = createDemoOrderEffect({ transition: transition as never });
    await effect.afterAccept({ orderId: ORDER, mode: "demo" });
    expect(
      transition.mock.calls.map((call) => [call[1], call[2], call[3]]),
    ).toEqual([
      ["order.captured", "system:demo", { mode: "demo", demo: true }],
      ["order.in_production", "system:demo", { mode: "demo", demo: true }],
    ]);
    transition.mockClear();
    await effect.afterDecline({ orderId: ORDER, mode: "test" });
    expect(
      transition.mock.calls.map((call) => [call[1], call[2], call[3]]),
    ).toEqual([
      [
        "order.no_partner_available",
        "system:demo",
        { mode: "test", demo: true },
      ],
    ]);
  });
});
