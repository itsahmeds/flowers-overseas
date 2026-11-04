/**
 * Spec 020a T-02 (AC-1), the integration half of T-03 (AC-2), and `orderActionHistory` (§5.2,
 * §5.3 "Action history") on a disposable PG16 (TASK-357).
 *
 *  - T-02: every admin role against every order action (reroute, cancel, refund in full, refund
 *    in part, and resend from TASK-360), through the real guard (`requirePermission`
 *    reading a stubbed `getAdminSession`). The allowed cells come from a fixture transcribed from
 *    spec 020a §5.2 / AC-1, never from `ADMIN_PERMISSIONS`. A denied call answers 403 and the five
 *    tables (`order_event`, `refund`, `notification_delivery`, `admin_order_action`, `audit_log`)
 *    keep their row counts; an allowed call passes the guard and reaches `runOrderAction` (a stale
 *    `expectedSeq` then answers `ORDER_CHANGED`, so it too writes nothing). The page's own server
 *    actions are called too, for every denied role.
 *  - T-03: with no session every action and command answers 401 and writes nothing.
 *  - History: a reroute, then a cancel, then a refund and a resend on one order come back oldest
 *    first with who, what, when, reason code and amount; two rows with one timestamp come back in
 *    one fixed order; the admin's note and the buyer's strings are never in it; a read writes
 *    nothing.
 *
 * TASK-361 adds T-32 (AC-31): the log and Sentry spy of `support/pii-watch.ts` over the suite.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  cancelOrderAction,
  resendEmailAction,
  rerouteOrderAction,
} from "@/app/admin/(signed-in)/orders/[id]/actions";
import type { AdminSession } from "@/lib/auth/admin";
import {
  adminOrderReroute,
  type OrderActionTransaction,
  orderActionHistory,
  type RerouteCommand,
  runOrderAction,
} from "@/modules/admin/order-actions";
import { adminOrderCancel } from "@/modules/admin/order-actions/cancel";
import { adminOrderRefund } from "@/modules/admin/order-actions/refund";
import { adminResendNotification } from "@/modules/admin/order-actions/resend";
import { FakePaymentProvider } from "@/modules/payments/fake";

import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";
import { watchLogsAndSentry } from "./support/pii-watch.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

/** The session `getAdminSession` answers; `null` is signed out. */
let current: AdminSession | null = null;

vi.mock("@/lib/auth/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/admin")>();
  return { ...actual, getAdminSession: () => Promise.resolve(current) };
});

const sentry = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@sentry/nextjs", async (original) => ({
  ...(await original<typeof import("@sentry/nextjs")>()),
  ...sentry,
}));

const server = await probeLocalServer();
const watch = watchLogsAndSentry(sentry);

const ROLES = ["admin", "ops", "finance", "content"] as const;
type Role = (typeof ROLES)[number];
const USER: Record<Role, string> = {
  admin: randomUUID(),
  ops: randomUUID(),
  finance: randomUUID(),
  content: randomUUID(),
};
const ADMIN_NAME = "History Admin";
const OPS_NAME = "History Ops";
const PARTNER_NAME = "Kwiaty Mokotow Fixture";
const NOTE = "SENTINEL-NOTE-357 buyer phoned twice";
const BUYER_STRING = "Test Buyer";

/**
 * Spec 020a AC-1, transcribed: `orders.reroute` (admin, ops), `orders.cancel` (admin),
 * `orders.refund` (admin), `orders.resend` (admin, ops). Not read from `ADMIN_PERMISSIONS`.
 */
const ALLOWED: Readonly<Record<string, readonly Role[]>> = {
  reroute: ["admin", "ops"],
  cancel: ["admin"],
  refund_full: ["admin"],
  refund_partial: ["admin"],
  resend: ["admin", "ops"],
};

const sessionOf = (role: Role): AdminSession => ({
  userId: USER[role],
  displayName: `Role ${role}`,
  roles: [role],
  timeZone: "Europe/London",
});

const digestOf = (error: unknown): string =>
  typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : `not an HTTP interrupt: ${String(error)}`;

async function thrown(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return "returned";
}

describe.skipIf(server.url === undefined)(
  `spec 020a roles, sign-in and action history on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let countryId = "";
    let partnerId = "";

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "admin_roles");
      await scratch.sql.begin(async (tx) => {
        await make.base(tx);
        for (const role of ROLES) {
          await tx`INSERT INTO users (id, email) VALUES (${USER[role]}, ${`${role}-357@example.test`})`;
        }
        await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${USER.admin}, ${ADMIN_NAME})`;
        await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${USER.ops}, ${OPS_NAME})`;
        countryId = await make.country(tx, "PL");
        partnerId = await make.partner(tx, countryId, "active");
        await tx`UPDATE fulfillment_partner SET legal_name = ${PARTNER_NAME} WHERE id = ${partnerId}`;
      });
    }, 600_000);
    afterAll(async () => {
      current = null;
      await scratch.drop();
    });

    /** `withAdminContext` as the database sees it, on the scratch database. */
    const adminTransaction: OrderActionTransaction = (context, fn) =>
      scratch.sql.begin(async (tx) => {
        await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
        await tx`SELECT set_config('app.audit_reason', ${context.reason ?? ""}, true)`;
        await asApp(tx, {
          role: "admin",
          ...(context.userId === undefined ? {} : { userId: context.userId }),
        });
        return fn(runnerOf(tx));
      }) as never;

    async function orderAt(status: string): Promise<string> {
      return (await scratch.sql.begin(async (tx) => {
        const customerId = await make.customer(tx);
        const recipientId = await make.recipient(tx, customerId);
        const id = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode: "live",
        });
        await walkOrderTo(tx, id, status);
        return id;
      })) as string;
    }

    async function seqOf(orderId: string): Promise<number> {
      const [row] = await scratch.sql<{ seq: number }[]>`
        SELECT coalesce(max(seq), 0)::int AS seq FROM order_event WHERE order_id = ${orderId}`;
      return row?.seq ?? 0;
    }

    /** Whole-table counts of the five tables AC-1 names: a denied call moves none of them. */
    async function totals() {
      const [row] = await scratch.sql<
        {
          events: number;
          refunds: number;
          deliveries: number;
          actions: number;
          audits: number;
        }[]
      >`
        SELECT (SELECT count(*)::int FROM order_event) AS events,
               (SELECT count(*)::int FROM refund) AS refunds,
               (SELECT count(*)::int FROM notification_delivery) AS deliveries,
               (SELECT count(*)::int FROM admin_order_action) AS actions,
               (SELECT count(*)::int FROM audit_log) AS audits`;
      if (row === undefined) throw new Error("no totals");
      return row;
    }

    const neverReroute = vi.fn<RerouteCommand>(() =>
      Promise.reject(new Error("the reroute command must not run here")),
    );
    const neverSchedule = vi.fn(() =>
      Promise.reject(new Error("no resend may be scheduled here")),
    );
    const refundDeps = {
      provider: new FakePaymentProvider({
        now: () => new Date("2026-11-04T10:00:00Z"),
        namespace: "roles357",
        refunds: "sync",
      }),
    };

    /** Each order action through its module command, with the default (real) guard. */
    const COMMANDS: Readonly<
      Record<string, (orderId: string, expectedSeq: number) => Promise<unknown>>
    > = {
      reroute: (orderId, expectedSeq) =>
        adminOrderReroute(
          { orderId, actionId: randomUUID(), expectedSeq, partnerId },
          { transaction: adminTransaction, reroute: neverReroute },
        ),
      cancel: (orderId, expectedSeq) =>
        adminOrderCancel(
          {
            orderId,
            actionId: randomUUID(),
            expectedSeq,
            reason: "no_partner",
          },
          { transaction: adminTransaction },
        ),
      refund_full: (orderId, expectedSeq) =>
        adminOrderRefund(
          {
            orderId,
            actionId: randomUUID(),
            expectedSeq,
            kind: "full",
            reason: "goodwill",
          },
          { transaction: adminTransaction, refund: refundDeps },
        ),
      refund_partial: (orderId, expectedSeq) =>
        adminOrderRefund(
          {
            orderId,
            actionId: randomUUID(),
            expectedSeq,
            kind: "partial",
            amountText: "1.00",
            reason: "goodwill",
          },
          { transaction: adminTransaction, refund: refundDeps },
        ),
      // TASK-360: a stale seq stops it before the delivery is read, so any id will do.
      resend: (orderId, expectedSeq) =>
        adminResendNotification(
          {
            orderId,
            actionId: randomUUID(),
            expectedSeq,
            deliveryId: randomUUID(),
          },
          { transaction: adminTransaction, schedule: neverSchedule },
        ),
    };

    /** The page's own server actions, posted as the browser would. */
    function form(fields: Record<string, string>): FormData {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      return data;
    }
    const PAGE_ACTIONS: Readonly<
      Record<string, (orderId: string, expectedSeq: number) => Promise<void>>
    > = {
      reroute: (orderId, expectedSeq) =>
        rerouteOrderAction(
          form({
            orderId,
            actionId: randomUUID(),
            expectedSeq: String(expectedSeq),
            partnerId,
          }),
        ),
      cancel: (orderId, expectedSeq) =>
        cancelOrderAction(
          form({
            orderId,
            actionId: randomUUID(),
            expectedSeq: String(expectedSeq),
            reason: "no_partner",
          }),
        ),
      resend: (orderId, expectedSeq) =>
        resendEmailAction(
          form({
            orderId,
            actionId: randomUUID(),
            expectedSeq: String(expectedSeq),
            deliveryId: randomUUID(),
          }),
        ),
    };

    it("T-02 (AC-1): each role against each action: 403 and five unchanged tables exactly where AC-1 does not mark the cell; a marked cell passes the guard", async () => {
      const orderId = await orderAt("no_partner_available");
      // One behind: an allowed call passes the guard, then stops at `expectedSeq` with no write.
      const stale = (await seqOf(orderId)) - 1;
      const cells: string[] = [];
      for (const role of ROLES) {
        current = sessionOf(role);
        for (const [kind, call] of Object.entries(COMMANDS)) {
          const before = await totals();
          const allowed = (ALLOWED[kind] ?? []).includes(role);
          if (allowed) {
            expect(await call(orderId, stale), `${role} × ${kind}`).toEqual({
              ok: false,
              code: "ORDER_CHANGED",
            });
          } else {
            expect(
              digestOf(await thrown(() => call(orderId, stale))),
              `${role} × ${kind}`,
            ).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
          }
          expect(await totals(), `${role} × ${kind}`).toEqual(before);
          cells.push(`${role}:${kind}:${allowed ? "allowed" : "403"}`);
        }
      }
      expect(cells.filter((cell) => cell.endsWith("allowed")).sort()).toEqual([
        "admin:cancel:allowed",
        "admin:refund_full:allowed",
        "admin:refund_partial:allowed",
        "admin:reroute:allowed",
        "admin:resend:allowed",
        "ops:reroute:allowed",
        "ops:resend:allowed",
      ]);
      expect(cells).toHaveLength(20);
      expect(neverSchedule).not.toHaveBeenCalled();
      expect(neverReroute).not.toHaveBeenCalled();
      expect(await seqOf(orderId)).toBe(stale + 1);
    }, 120_000);

    it("T-02 (AC-1): ops on refund, in full and in part, on a paid-for order with a fresh seq: 403, no refund, no row", async () => {
      const orderId = await orderAt("in_production");
      current = sessionOf("ops");
      const before = await totals();
      for (const kind of ["refund_full", "refund_partial"]) {
        const call = COMMANDS[kind];
        if (call === undefined) throw new Error(kind);
        expect(
          digestOf(
            await thrown(async () => call(orderId, await seqOf(orderId))),
          ),
        ).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
      }
      expect(await totals()).toEqual(before);
    }, 120_000);

    it("T-02 (AC-1): the page's server actions answer 403 for every role AC-1 does not mark, with a fresh seq, writing nothing", async () => {
      const orderId = await orderAt("no_partner_available");
      const seq = await seqOf(orderId);
      let denied = 0;
      for (const role of ROLES) {
        current = sessionOf(role);
        for (const [kind, call] of Object.entries(PAGE_ACTIONS)) {
          if ((ALLOWED[kind] ?? []).includes(role)) continue;
          const before = await totals();
          expect(
            digestOf(await thrown(() => call(orderId, seq))),
            `${role} × ${kind}`,
          ).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
          expect(await totals()).toEqual(before);
          denied += 1;
        }
      }
      // finance and content on all three, ops on cancel.
      expect(denied).toBe(7);
      expect(await seqOf(orderId)).toBe(seq);
    }, 120_000);

    it("T-03 (AC-2): signed out, every page action and every command answers 401 and writes nothing", async () => {
      const orderId = await orderAt("no_partner_available");
      const seq = await seqOf(orderId);
      current = null;
      const before = await totals();
      const calls = [
        ...Object.entries(PAGE_ACTIONS),
        ...Object.entries(COMMANDS),
      ];
      expect(calls).toHaveLength(8);
      for (const [kind, call] of calls) {
        expect(digestOf(await thrown(() => call(orderId, seq))), kind).toBe(
          "NEXT_HTTP_ERROR_FALLBACK;401",
        );
      }
      expect(await totals()).toEqual(before);
      expect(await seqOf(orderId)).toBe(seq);
    }, 120_000);

    /* ---------------------------------------------------------------------- */
    /* orderActionHistory                                                     */
    /* ---------------------------------------------------------------------- */

    const viewer = { userId: USER.admin };
    const history = (orderId: string) =>
      orderActionHistory(orderId, viewer, { transaction: adminTransaction });

    /** The latest event's id: a reroute command that records without moving the order. */
    const recordingReroute: RerouteCommand = async (orderId) => {
      const [row] = await scratch.sql<{ id: string }[]>`
        SELECT id FROM order_event WHERE order_id = ${orderId} ORDER BY seq DESC LIMIT 1`;
      return { kind: "rerouted", eventId: row?.id ?? "" };
    };

    async function delivery(orderId: string): Promise<string> {
      const [row] = await scratch.sql<{ id: string }[]>`
        INSERT INTO notification_delivery (source_key, order_id, template_key, audience,
                                           recipient_ref, locale_code, provider, status, status_at)
        VALUES (${`order_event:${randomUUID()}`}, ${orderId}, 'being-made', 'buyer', 'buyer', 'en',
                'capture', 'sent', now())
        RETURNING id`;
      return row?.id ?? "";
    }

    it("history: empty for an order with no action; null for no such order", async () => {
      const orderId = await orderAt("paid_unrouted");
      expect(await history(orderId)).toEqual([]);
      expect(await history(randomUUID())).toBeNull();
    }, 120_000);

    it("history: a reroute, then a cancel, then a refund in part and a resend come back oldest first with who, what, when, reason and amount; never the note or a buyer string; reading writes nothing", async () => {
      const orderId = await orderAt("no_partner_available");
      const other = await orderAt("no_partner_available");
      current = sessionOf("ops");
      const reroute = await adminOrderReroute(
        {
          orderId,
          actionId: randomUUID(),
          expectedSeq: await seqOf(orderId),
          partnerId,
        },
        { transaction: adminTransaction, reroute: recordingReroute },
      );
      expect(reroute).toMatchObject({ ok: true, kind: "reroute" });
      // Another order's action never appears in this order's history.
      await adminOrderReroute(
        {
          orderId: other,
          actionId: randomUUID(),
          expectedSeq: await seqOf(other),
          partnerId,
        },
        { transaction: adminTransaction, reroute: recordingReroute },
      );

      current = sessionOf("admin");
      const cancel = await adminOrderCancel(
        {
          orderId,
          actionId: randomUUID(),
          expectedSeq: await seqOf(orderId),
          reason: "no_partner",
          note: NOTE,
        },
        { transaction: adminTransaction },
      );
      expect(cancel).toMatchObject({ ok: true, kind: "cancel" });

      // The refund and resend effects are TASK-359's and TASK-360's (tested there); here the
      // wrapper records what they would, so the history reads every column.
      const refundRef = randomUUID();
      const refund = await runOrderAction(
        {
          kind: "refund_partial",
          input: {
            orderId,
            actionId: randomUUID(),
            expectedSeq: await seqOf(orderId),
          },
          userId: USER.admin,
        },
        () =>
          Promise.resolve({
            ok: true,
            resultRef: refundRef,
            record: {
              reason: "addon_missing",
              amountMinor: 1300n,
              currencyCode: "PLN",
            },
          }),
        { transaction: adminTransaction },
      );
      expect(refund).toMatchObject({ ok: true });
      const deliveryId = await delivery(orderId);
      const resend = await runOrderAction(
        {
          kind: "resend",
          input: {
            orderId,
            actionId: randomUUID(),
            expectedSeq: await seqOf(orderId),
          },
          userId: USER.ops,
        },
        () =>
          Promise.resolve({
            ok: true,
            resultRef: randomUUID(),
            record: { notificationDeliveryId: deliveryId },
          }),
        { transaction: adminTransaction },
      );
      expect(resend).toMatchObject({ ok: true });

      const before = await totals();
      const entries = await history(orderId);
      expect(await totals()).toEqual(before);
      expect(
        entries?.map((entry) => ({
          kind: entry.kind,
          actor: entry.actor,
          reason: entry.reason,
          amount: entry.amount,
          partner: entry.partner,
          resent: entry.resent,
        })),
      ).toEqual([
        {
          kind: "reroute",
          actor: { userId: USER.ops, displayName: OPS_NAME },
          reason: null,
          amount: null,
          partner: { partnerId, displayName: PARTNER_NAME },
          resent: null,
        },
        {
          kind: "cancel",
          actor: { userId: USER.admin, displayName: ADMIN_NAME },
          reason: "no_partner",
          amount: null,
          partner: null,
          resent: null,
        },
        {
          kind: "refund_partial",
          actor: { userId: USER.admin, displayName: ADMIN_NAME },
          reason: "addon_missing",
          amount: { amountMinor: 1300n, currencyCode: "PLN" },
          partner: null,
          resent: null,
        },
        {
          kind: "resend",
          actor: { userId: USER.ops, displayName: OPS_NAME },
          reason: null,
          amount: null,
          partner: null,
          resent: { deliveryId, templateKey: "being-made", audience: "buyer" },
        },
      ]);
      const times = (entries ?? []).map((entry) => entry.at.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(times.every((time) => Number.isFinite(time))).toBe(true);
      const text = JSON.stringify(entries, (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      );
      expect(text).not.toContain("SENTINEL-NOTE-357");
      expect(text).not.toContain(BUYER_STRING);
      expect(text).not.toContain("Test Recipient");
      // The note is in the audit log's reason, where §8 puts it.
      const [audit] = await scratch.sql<{ reason: string | null }[]>`
        SELECT reason FROM audit_log WHERE entity_table = 'admin_order_action'
          AND action = 'order.action.cancel' AND reason = ${NOTE}`;
      expect(audit?.reason).toBe(NOTE);
      expect(await history(other)).toHaveLength(1);
    }, 120_000);

    it("history: two actions with one timestamp come back in one fixed order (by id) on every read", async () => {
      const orderId = await orderAt("no_partner_available");
      // Two ids, the larger written first, so insertion order and id order disagree.
      const [low, high] = [randomUUID(), randomUUID()].sort();
      if (low === undefined || high === undefined) throw new Error("ids");
      // `runOrderAction` stamps each row with `clock_timestamp()` after the lock (TASK-360), so two
      // of its rows never share an instant; a tie can still come from a migration or a restore, so
      // the two rows are written here directly with one timestamp.
      const deliveries = new Map([
        [high, await delivery(orderId)],
        [low, await delivery(orderId)],
      ]);
      await scratch.sql.begin(async (tx) => {
        await tx`SELECT set_config('app.audit_action', 'order.action.resend', true)`;
        await tx`SELECT set_config('app.audit_reason', '', true)`;
        for (const actionId of [high, low]) {
          await tx`
            INSERT INTO admin_order_action (id, order_id, kind, actor_user_id,
                                            notification_delivery_id, result_ref, created_at)
            VALUES (${actionId}, ${orderId}, 'resend', ${USER.ops},
                    ${deliveries.get(actionId) ?? ""}, ${randomUUID()},
                    TIMESTAMPTZ '2026-11-04 10:00:00+00')`;
        }
      });
      const [times] = await scratch.sql<{ distinct: number }[]>`
        SELECT count(DISTINCT created_at)::int AS distinct FROM admin_order_action
        WHERE order_id = ${orderId}`;
      expect(times?.distinct).toBe(1);
      for (let read = 0; read < 3; read += 1) {
        expect((await history(orderId))?.map((entry) => entry.id)).toEqual([
          low,
          high,
        ]);
      }
    }, 120_000);

    it("T-32 (AC-31): over this suite no log line or Sentry event carries a person, the note, a token or a link", async () => {
      const tokens = (
        await scratch.sql<
          { public_token: string }[]
        >`SELECT public_token FROM "order"`
      ).map((row) => row.public_token);
      expect(watch.captured()).toContain("admin.order_action");
      watch.expectClean([
        "SENTINEL-NOTE-357",
        BUYER_STRING,
        "Test Recipient",
        "+48500000000",
        "@example.test",
        ...tokens,
      ]);
    });
  },
);
