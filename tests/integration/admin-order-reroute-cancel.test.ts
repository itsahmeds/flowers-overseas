/**
 * Spec 020a reroute and cancel on a disposable PG16 (spec 020a §2.2, §2.3, §5.2 "Reroute",
 * "Cancel"; AC-5, AC-6, AC-9 to AC-11, AC-13 to AC-15 / T-06, T-07, T-10 to T-12, T-14 to T-16;
 * TASK-358).
 *
 * Every action runs as the real thing would: `adminOrderReroute` / `adminOrderCancel` →
 * `runOrderAction` in an admin-context transaction (`app.role = admin`, `app.audit_action`,
 * `app.audit_reason`, then `SET LOCAL ROLE app_web`, so RLS and spec 012's audit trigger are live)
 * → spec 016's `manualReroute` / spec 013's `cancelOrder` on that transaction. The routing world
 * (one country per case, florists, offers, declines and timeouts) is `routing-no-partner.test.ts`'s;
 * the paid purchases on the in-memory `FakePaymentProvider` are `admin-order-refunds.test.ts`'s.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import { createLogger } from "@/lib/logger";
import {
  adminOrderReroute,
  type AdminOrderRerouteDeps,
  availableActions,
  type OrderActionTransaction,
  type RerouteCommand,
} from "@/modules/admin/order-actions";
import {
  adminOrderCancel,
  type AdminOrderCancelDeps,
} from "@/modules/admin/order-actions/cancel";
import {
  acceptedOrderEffectFor,
  type AcceptedOrderEffect,
} from "@/modules/orders/demo/effect";
import {
  type FloristCommandContext,
  type FloristCommandRuntime,
  respondToOffer,
} from "@/modules/orders/florist-actions";
import {
  dispatchOutbox,
  type HandlerRegistry,
  type OrderExecutor,
  transition,
} from "@/modules/orders";
import {
  createRoutingDeclineEffect,
  expireNoPartner,
  manualReroute,
  noPartnerGrace,
  rerouteCandidates,
  routeOrder,
  routingOutboxHandler,
  timeoutAssignment,
  type RoutingDeps,
  type RoutingJob,
  type RoutingTransaction,
} from "@/modules/orders/routing/jobs";
import { notificationsFor } from "@/modules/notifications/rules";
import { refundCancelledOrder } from "@/modules/payments";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  startPayment,
  syncFromProvider,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";

import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf, sqlText } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const SKU = "FO-BQ-358";
const TIER = "stems_15";
/** 11:00 in Warsaw (CET) on Wednesday 4 Nov 2026. */
const NOW = new Date("2026-11-04T10:00:00Z");
const TOMORROW = "2026-11-05";
const FAR_DATE = "2027-12-24";
const MINUTE = 60_000;
const at = (minutes: number): Date =>
  new Date(NOW.getTime() + minutes * MINUTE);

const ADMIN_ID = randomUUID();
const OPS_ID = randomUUID();
const BUYER_NAME = "Sentinel Buyer Name";
const NOTE = "SENTINEL-NOTE-7 buyer phoned twice";
const SESSION = {
  userId: ADMIN_ID,
  displayName: "Reroute Admin",
  roles: ["admin" as const],
  timeZone: "Europe/London",
};

const quiet = () => createLogger({ level: "fatal", write: () => undefined });

const METHODS_ON: MethodSources = {
  enabledFlags: new Set([
    "payments.method.card",
    "payments.method.apple-pay",
    "payments.method.google-pay",
  ]),
  registry: PAYMENT_METHODS.map((method) => ({
    ...method,
    available: method.id !== "blik",
    ...(method.id === "blik" ? {} : { processor: "stripe" as const }),
  })),
};

/** Set E (spec 002 §14 A10): the five states every cancel reason applies to. */
const SET_E = [
  "authorised",
  "paid_unrouted",
  "routed",
  "manual_reroute",
  "no_partner_available",
] as const;
const E_REASONS = ["buyer_cancel", "no_partner", "other"] as const;

interface World {
  readonly countryId: string;
  readonly cityId: string;
}

interface Florist {
  readonly partnerId: string;
  readonly members: readonly string[];
}

let countryCounter = 0;
let fakes = 0;

describe.skipIf(server.url === undefined)(
  `spec 020a reroute and cancel on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let productId = "";

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "admin_reroute");
      await scratch.sql.begin(async (tx) => {
        await make.base(tx);
        await tx`INSERT INTO users (id, email) VALUES (${ADMIN_ID}, 'reroute-admin@example.test')`;
        await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${ADMIN_ID}, 'Reroute Admin')`;
        await tx`INSERT INTO users (id, email) VALUES (${OPS_ID}, 'reroute-ops@example.test')`;
        const [product] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                               substitution_class, freshness_days)
          VALUES (${SKU}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
          RETURNING id`;
        productId = product?.id ?? "";
        await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
                 VALUES (${productId}, ${TIER}, 'catalog.tier.stems', 15, 0, true)`;
        await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
                 VALUES (${productId}, 'en', 'Amber Hour', 'amber-hour-358')`;
      });
    }, 600_000);
    afterAll(async () => {
      await scratch.drop();
    });

    /* ---------------------------------------------------------------------- */
    /* Seams                                                                  */
    /* ---------------------------------------------------------------------- */

    const system: RoutingTransaction = <T>(
      fn: (executor: OrderExecutor) => Promise<T>,
    ) =>
      scratch.sql.begin(async (tx) => {
        await asApp(tx, { role: "system" });
        return fn(runnerOf(tx));
      }) as Promise<T>;

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

    /** Both callers pause before the action-id lookup until the other arrives (T-06's race). */
    function racingTransaction(): OrderActionTransaction {
      let arrived = 0;
      let release: () => void = () => undefined;
      const together = new Promise<void>((resolve) => {
        release = resolve;
      });
      return (context, fn) =>
        adminTransaction(context, (executor) =>
          fn({
            async execute(query) {
              if (/FROM admin_order_action WHERE id/.test(sqlText(query))) {
                arrived += 1;
                if (arrived >= 2) release();
                await Promise.race([
                  together,
                  new Promise((resolve) => setTimeout(resolve, 300)),
                ]);
              }
              return executor.execute(query);
            },
          }),
        );
    }

    function recorder() {
      const jobs: RoutingJob[] = [];
      return {
        jobs,
        schedule: vi.fn(async (batch: readonly RoutingJob[]) => {
          jobs.push(...batch);
        }),
      };
    }

    function deps(now: Date, over: Partial<RoutingDeps> = {}): RoutingDeps {
      return {
        transaction: system,
        now: () => now,
        schedule: recorder().schedule,
        signInStatuses: ["demo", "active"],
        alert: vi.fn(),
        log: quiet(),
        ...over,
      };
    }

    /** Spec 016's `manualReroute` at `now`, as the server action binds it. */
    function rerouteAt(
      now: Date,
      schedule = recorder().schedule,
    ): RerouteCommand {
      return (orderId, partnerId, actor, { executor }) =>
        manualReroute(orderId, partnerId, actor, {
          ...deps(now, { schedule }),
          executor,
        });
    }

    function rerouteDeps(
      now: Date,
      over: Partial<AdminOrderRerouteDeps> = {},
    ): AdminOrderRerouteDeps {
      return {
        guard: () => Promise.resolve(SESSION),
        transaction: adminTransaction,
        reroute: rerouteAt(now),
        ...over,
      };
    }

    const cancelDeps = (
      over: Partial<AdminOrderCancelDeps> = {},
    ): AdminOrderCancelDeps => ({
      guard: () => Promise.resolve(SESSION),
      transaction: adminTransaction,
      ...over,
    });

    const runtime: FloristCommandRuntime = {
      asPartner<T>(
        ctx: FloristCommandContext,
        fn: (executor: OrderExecutor) => Promise<T>,
      ): Promise<T> {
        return scratch.sql.begin(async (tx) => {
          await asApp(tx, {
            role: "partner",
            userId: ctx.userId,
            partnerIds: ctx.partnerIds,
          });
          return fn(runnerOf(tx));
        }) as Promise<T>;
      },
      asSystem<T>(
        _job: string,
        fn: (executor: OrderExecutor) => Promise<T>,
      ): Promise<T> {
        return system(fn);
      },
    };

    function answer(
      florist: Florist,
      assignmentId: string,
      input: unknown,
      now: Date,
    ) {
      const quietAccept: AcceptedOrderEffect = {
        afterAccept: () => Promise.resolve(),
        afterDecline: () => Promise.resolve(),
      };
      return respondToOffer(
        {
          userId: florist.members[0] ?? randomUUID(),
          partnerIds: [florist.partnerId],
        },
        assignmentId,
        input,
        {
          runtime,
          now: () => now,
          environment: "test",
          effectFor: (mode, environment) =>
            acceptedOrderEffectFor(mode, environment, {
              demo: quietAccept,
              unconfigured: quietAccept,
              routed: createRoutingDeclineEffect(recorder().schedule),
            }),
        },
      );
    }

    /* ---------------------------------------------------------------------- */
    /* The routing world                                                      */
    /* ---------------------------------------------------------------------- */

    async function world(): Promise<World> {
      countryCounter += 1;
      const iso2 = `X${String.fromCharCode(64 + countryCounter)}`;
      return scratch.sql.begin(async (tx) => {
        const [country] = await tx<{ id: string }[]>`
          INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone, same_day_cutoff_local)
          VALUES (${iso2}, 'PLN', 800, 'Europe/Warsaw', '14:00') RETURNING id`;
        const countryId = country?.id ?? "";
        const [city] = await tx<{ id: string }[]>`
          INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`;
        const cityId = city?.id ?? "";
        await tx`INSERT INTO postcode_zone (country_id, prefix, city_id)
                 VALUES (${countryId}, '00', ${cityId})`;
        return { countryId, cityId };
      }) as Promise<World>;
    }

    async function florist(
      w: World,
      options: {
        name: string;
        payout: number;
        capacity?: number;
        members?: number;
      },
    ): Promise<Florist> {
      return scratch.sql.begin(async (tx) => {
        const partnerId = await make.partner(tx, w.countryId, "demo");
        await tx`UPDATE fulfillment_partner
                 SET capacity_per_day = ${options.capacity ?? 15}, legal_name = ${options.name}
                 WHERE id = ${partnerId}`;
        await tx`INSERT INTO partner_coverage (partner_id, postcode_zone_id)
                 SELECT ${partnerId}, id FROM postcode_zone WHERE country_id = ${w.countryId}`;
        await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key,
                                                      partner_payout_minor, currency_code)
                 VALUES (${partnerId}, ${productId}, ${TIER}, ${options.payout}, 'PLN')`;
        const members: string[] = [];
        for (let index = 0; index < (options.members ?? 1); index += 1) {
          const userId = randomUUID();
          await tx`INSERT INTO users (id, email)
                   VALUES (${userId}, ${`m-${userId.slice(0, 8)}@example.test`})`;
          await tx`INSERT INTO partner_member (user_id, partner_id, role)
                   VALUES (${userId}, ${partnerId}, ${index === 0 ? "owner" : "staff"})`;
          members.push(userId);
        }
        return { partnerId, members };
      }) as Promise<Florist>;
    }

    /** A `test` order in `w`, captured through the engine, so `paid_unrouted`. */
    async function securedOrder(w: World): Promise<string> {
      return (await scratch.sql.begin(async (tx) => {
        const customerId = await make.customer(tx);
        const recipientId = await make.recipient(tx, customerId);
        const id = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId: w.countryId,
          mode: "test",
        });
        await tx`UPDATE "order" SET destination_city_id = ${w.cityId},
                 destination_postcode = '00-950', delivery_date = ${TOMORROW},
                 buyer_snapshot = ${tx.json({ name: BUYER_NAME, countryIso2: "GB" })}
                 WHERE id = ${id}`;
        await tx`INSERT INTO order_line (order_id, kind, product_id, tier_key, qty,
                                         unit_retail_minor, currency_code, vat_rate_bp)
                 VALUES (${id}, 'product', ${productId}, ${TIER}, 1, 18900, 'PLN', 800)`;
        await asApp(tx, { role: "system" });
        await transition(
          id,
          "order.captured",
          "system:payments",
          { mode: "test", provider_call: true },
          { executor: runnerOf(tx) },
        );
        return id;
      })) as string;
    }

    async function offered(orderId: string, now: Date) {
      const outcome = await routeOrder(orderId, deps(now));
      if (outcome.kind !== "offered") {
        throw new Error(`expected an offer, got ${JSON.stringify(outcome)}`);
      }
      return outcome;
    }

    /* ---------------------------------------------------------------------- */
    /* Reads                                                                  */
    /* ---------------------------------------------------------------------- */

    interface EventRow {
      id: string;
      type: string;
      actor: string;
      from_status: string | null;
      to_status: string | null;
      payload: Record<string, unknown>;
      tx: string;
    }

    async function events(orderId: string): Promise<EventRow[]> {
      return scratch.sql<EventRow[]>`
        SELECT id, type, actor, from_status, to_status, payload, xmin::text AS tx
        FROM order_event WHERE order_id = ${orderId} ORDER BY seq`;
    }

    async function status(orderId: string): Promise<string> {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status ?? "";
    }

    async function seqOf(orderId: string): Promise<number> {
      const [row] = await scratch.sql<{ seq: number }[]>`
        SELECT coalesce(max(seq), 0)::int AS seq FROM order_event WHERE order_id = ${orderId}`;
      return row?.seq ?? 0;
    }

    /** The row counts an action may change: none of them move on a refusal. */
    async function counts(orderId: string) {
      const [row] = await scratch.sql<
        {
          events: number;
          assignments: number;
          refunds: number;
          deliveries: number;
          actions: number;
          audits: number;
        }[]
      >`
        SELECT (SELECT count(*)::int FROM order_event WHERE order_id = ${orderId}) AS events,
               (SELECT count(*)::int FROM order_assignment WHERE order_id = ${orderId}) AS assignments,
               (SELECT count(*)::int FROM refund WHERE order_id = ${orderId}) AS refunds,
               (SELECT count(*)::int FROM notification_delivery WHERE order_id = ${orderId}) AS deliveries,
               (SELECT count(*)::int FROM admin_order_action WHERE order_id = ${orderId}) AS actions,
               (SELECT count(*)::int FROM audit_log a
                  JOIN admin_order_action x ON a.entity_id = x.id::text
                 WHERE a.entity_table = 'admin_order_action' AND x.order_id = ${orderId}) AS audits`;
      if (row === undefined) throw new Error("no counts");
      return row;
    }

    async function actionRows(orderId: string) {
      return scratch.sql<
        {
          id: string;
          kind: string;
          actor_user_id: string;
          reason: string | null;
          partner_id: string | null;
          amount_minor: string | null;
          result_ref: string;
          tx: string;
        }[]
      >`SELECT id, kind, actor_user_id, reason, partner_id, amount_minor, result_ref,
               xmin::text AS tx
        FROM admin_order_action WHERE order_id = ${orderId} ORDER BY created_at`;
    }

    async function auditRows(orderId: string) {
      return scratch.sql<
        {
          action: string;
          reason: string | null;
          after: Record<string, unknown> | null;
          row_text: string;
        }[]
      >`SELECT a.action, a.reason, a.after, row_to_json(a)::text AS row_text
        FROM audit_log a JOIN admin_order_action x ON a.entity_id = x.id::text
        WHERE a.entity_table = 'admin_order_action' AND x.order_id = ${orderId}
        ORDER BY a.at`;
    }

    async function outboxTargetsOf(orderId: string, type: string) {
      const rows = await scratch.sql<{ target: string }[]>`
        SELECT d.target FROM outbox_delivery d
        JOIN outbox x ON x.id = d.outbox_id JOIN order_event e ON e.id = x.event_id
        WHERE e.order_id = ${orderId} AND e.type = ${type} ORDER BY d.target`;
      return rows.map((row) => row.target);
    }

    async function reroute(
      orderId: string,
      partnerId: string,
      d: AdminOrderRerouteDeps,
      options: { actionId?: string; expectedSeq?: number } = {},
    ) {
      return adminOrderReroute(
        {
          orderId,
          actionId: options.actionId ?? randomUUID(),
          expectedSeq: options.expectedSeq ?? (await seqOf(orderId)),
          partnerId,
        },
        d,
      );
    }

    async function cancel(
      orderId: string,
      reason: string,
      options: {
        actionId?: string;
        expectedSeq?: number;
        note?: string;
        deps?: AdminOrderCancelDeps;
      } = {},
    ) {
      return adminOrderCancel(
        {
          orderId,
          actionId: options.actionId ?? randomUUID(),
          expectedSeq: options.expectedSeq ?? (await seqOf(orderId)),
          reason,
          ...(options.note === undefined ? {} : { note: options.note }),
        },
        options.deps ?? cancelDeps(),
      );
    }

    /* ---------------------------------------------------------------------- */
    /* The no-partner order of T-10 to T-12                                   */
    /* ---------------------------------------------------------------------- */

    interface NoPartnerCase {
      readonly orderId: string;
      readonly timedOut: Florist;
      readonly declined: Florist;
      readonly blacked: Florist;
      readonly full: Florist;
      readonly unreachable: Florist;
      readonly eligible: Florist;
    }

    /**
     * An order offered to `timedOut` (no answer in the hour), then to `declined` (declined), then
     * given up; afterwards three florists that cannot take it (a day off, full that date, no
     * member) and one that can, never offered.
     */
    async function noPartnerCase(): Promise<NoPartnerCase> {
      const w = await world();
      const full = await florist(w, {
        name: "Kwiaty Pelne",
        payout: 7000,
        capacity: 1,
      });
      // Fill `full` on the date with another order's open offer.
      const other = await securedOrder(w);
      expect((await offered(other, NOW)).partnerId).toBe(full.partnerId);

      const timedOut = await florist(w, {
        name: "Kwiaciarnia Bielany",
        payout: 8000,
      });
      const declined = await florist(w, {
        name: "Pracownia Wola",
        payout: 9000,
      });
      const orderId = await securedOrder(w);
      const first = await offered(orderId, NOW);
      expect(first.partnerId).toBe(timedOut.partnerId);
      expect(
        (await timeoutAssignment(first.assignmentId, deps(at(60)))).kind,
      ).toBe("timed_out");
      const second = await offered(orderId, at(61));
      expect(second.partnerId).toBe(declined.partnerId);
      await answer(
        declined,
        second.assignmentId,
        { response: "decline", reason: "capacity" },
        at(62),
      );
      expect((await routeOrder(orderId, deps(at(63)))).kind).toBe("exhausted");
      expect(await status(orderId)).toBe("no_partner_available");

      const blacked = await florist(w, { name: "Kwiaty Urlop", payout: 7500 });
      await scratch.sql`
        INSERT INTO partner_blackout (partner_id, date) VALUES (${blacked.partnerId}, ${TOMORROW})`;
      const unreachable = await florist(w, {
        name: "Kwiaty Bez Konta",
        payout: 7600,
        members: 0,
      });
      const eligible = await florist(w, {
        name: "Kwiaty Mokotow",
        payout: 13500,
      });
      return {
        orderId,
        timedOut,
        declined,
        blacked,
        full,
        unreachable,
        eligible,
      };
    }

    const readOptions = (now: Date) => ({
      transaction: system,
      now: () => now,
      signInStatuses: ["demo", "active"] as const,
    });

    /* ---------------------------------------------------------------------- */
    /* T-10 (AC-9)                                                            */
    /* ---------------------------------------------------------------------- */

    it("T-10 (AC-9): the candidates are exactly the earlier timeout, the decliner and the eligible florist, ranked, each earlier answer marked; blacked out, full and unreachable are not listed", async () => {
      const c = await noPartnerCase();
      const listed = await rerouteCandidates(c.orderId, readOptions(at(70)));
      expect(listed).toEqual([
        {
          partnerId: c.timedOut.partnerId,
          displayName: "Kwiaciarnia Bielany",
          city: "Warszawa",
          rankPosition: 1,
          payoutMinor: 8000,
          payoutCurrency: "PLN",
          previously: "timed_out",
        },
        {
          partnerId: c.declined.partnerId,
          displayName: "Pracownia Wola",
          city: "Warszawa",
          rankPosition: 2,
          payoutMinor: 9000,
          payoutCurrency: "PLN",
          previously: "declined",
        },
        {
          partnerId: c.eligible.partnerId,
          displayName: "Kwiaty Mokotow",
          city: "Warszawa",
          rankPosition: 3,
          payoutMinor: 13500,
          payoutCurrency: "PLN",
          previously: null,
        },
      ]);
      // Not for any other status: an order routed again has no candidate.
      const done = await reroute(
        c.orderId,
        c.eligible.partnerId,
        rerouteDeps(at(71)),
      );
      expect(done).toMatchObject({ ok: true, kind: "reroute" });
      expect(await rerouteCandidates(c.orderId, readOptions(at(72)))).toEqual(
        [],
      );
    }, 120_000);

    /* ---------------------------------------------------------------------- */
    /* T-11 (AC-10), T-06 and T-07 for reroute                                */
    /* ---------------------------------------------------------------------- */

    it("T-11 (AC-10): rerouting to the earlier decliner writes order.manual_reroute, order.routed and assignment.offered in order as the admin, in the action's transaction; status routed; V1 for its members; no buyer delivery", async () => {
      const c = await noPartnerCase();
      const before = await events(c.orderId);
      const rec = recorder();
      const result = await reroute(
        c.orderId,
        c.declined.partnerId,
        rerouteDeps(at(70), { reroute: rerouteAt(at(70), rec.schedule) }),
      );
      const tail = (await events(c.orderId)).slice(before.length);
      const admin = `admin:${ADMIN_ID}`;
      expect(
        tail.map((row) => [
          row.type,
          row.actor,
          row.from_status,
          row.to_status,
        ]),
      ).toEqual([
        [
          "order.manual_reroute",
          admin,
          "no_partner_available",
          "manual_reroute",
        ],
        ["order.routed", admin, "manual_reroute", "routed"],
        ["assignment.offered", admin, "routed", "routed"],
      ]);
      expect(result).toEqual({
        ok: true,
        kind: "reroute",
        resultRef: tail[0]?.id,
        replayed: false,
      });
      expect(await status(c.orderId)).toBe("routed");
      expect(rec.jobs.map((job) => job.name)).toEqual([
        "assignment.remind",
        "assignment.timeout",
      ]);
      // V1 rides the notifications target; no buyer row for any of the three events.
      expect(await outboxTargetsOf(c.orderId, "assignment.offered")).toContain(
        "notifications",
      );
      for (const [type, from] of [
        ["order.manual_reroute", "no_partner_available"],
        ["order.routed", "manual_reroute"],
        ["assignment.offered", "routed"],
      ] as const) {
        const rules = notificationsFor(type, from, "live");
        expect(
          rules.filter((rule) => rule.audience === "buyer"),
          type,
        ).toEqual([]);
      }
      expect(
        notificationsFor("assignment.offered", "routed", "live").map(
          (rule) => rule.code,
        ),
      ).toContain("V1");
      const [assignment] = await scratch.sql<{ partner_id: string }[]>`
        SELECT partner_id FROM order_assignment WHERE order_id = ${c.orderId}
        ORDER BY attempt DESC LIMIT 1`;
      expect(assignment?.partner_id).toBe(c.declined.partnerId);
      expect(
        (
          await scratch.sql<{ n: number }[]>`
            SELECT count(*)::int AS n FROM notification_delivery
            WHERE order_id = ${c.orderId} AND audience = 'buyer'`
        )[0]?.n,
      ).toBe(0);

      // T-07: one action row and one audit row, in the effect's transaction, no buyer data.
      const rows = await actionRows(c.orderId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: "reroute",
        actor_user_id: ADMIN_ID,
        partner_id: c.declined.partnerId,
        reason: null,
        amount_minor: null,
        result_ref: tail[0]?.id,
      });
      expect(rows[0]?.tx).toBe(tail[0]?.tx);
      const audits = await auditRows(c.orderId);
      expect(audits.map((row) => row.action)).toEqual(["order.action.reroute"]);
      expect(audits[0]?.row_text).not.toContain(BUYER_NAME);
    }, 120_000);

    it("T-06 (AC-5): one reroute actionId twice in sequence and twice in parallel: one order.manual_reroute, order.routed and assignment.offered; the second replayed with the first resultRef", async () => {
      for (const parallel of [false, true]) {
        const c = await noPartnerCase();
        const actionId = randomUUID();
        const expectedSeq = await seqOf(c.orderId);
        const before = await counts(c.orderId);
        const d = rerouteDeps(at(70), {
          ...(parallel ? { transaction: racingTransaction() } : {}),
        });
        const submit = () =>
          reroute(c.orderId, c.eligible.partnerId, d, {
            actionId,
            expectedSeq,
          });
        const results = parallel
          ? await Promise.all([submit(), submit()])
          : [await submit(), await submit()];
        const after = await counts(c.orderId);
        expect(
          after.events - before.events,
          `parallel ${String(parallel)}`,
        ).toBe(3);
        expect(after.assignments - before.assignments).toBe(1);
        expect(after.actions).toBe(1);
        expect(after.audits).toBe(1);
        const [first, second] = results;
        if (first?.ok !== true || second?.ok !== true) {
          throw new Error(JSON.stringify(results));
        }
        expect(first.resultRef).toBe(second.resultRef);
        expect(results.map((r) => r.ok && r.replayed).sort()).toEqual([
          false,
          true,
        ]);
      }
    }, 240_000);

    /* ---------------------------------------------------------------------- */
    /* T-12 (AC-11)                                                           */
    /* ---------------------------------------------------------------------- */

    it("T-12 (AC-11): the order cancelled by order.no_partner_expire after the dialog rendered: ORDER_CHANGED on the rendered seq, ORDER_TRANSITION_ILLEGAL on a fresh one, zero rows", async () => {
      const c = await noPartnerCase();
      const rendered = await seqOf(c.orderId);
      const grace = await noPartnerGrace(c.orderId, { transaction: system });
      if (grace === null) throw new Error("no grace end");
      expect(grace.destinationZone).toBe("Europe/Warsaw");
      expect(
        (await expireNoPartner(c.orderId, deps(grace.graceEnd))).kind,
      ).toBe("cancelled");
      const before = await counts(c.orderId);
      expect(
        await reroute(c.orderId, c.eligible.partnerId, rerouteDeps(at(70)), {
          expectedSeq: rendered,
        }),
      ).toEqual({ ok: false, code: "ORDER_CHANGED" });
      expect(
        await reroute(c.orderId, c.eligible.partnerId, rerouteDeps(at(70))),
      ).toEqual({ ok: false, code: "ORDER_TRANSITION_ILLEGAL" });
      expect(await counts(c.orderId)).toEqual(before);
      expect(await status(c.orderId)).toBe("cancelled");
    }, 120_000);

    it("T-12 (AC-11): a florist blacked out after the dialog rendered is PARTNER_NOT_ELIGIBLE with zero rows, and leaves the list; a never-listed florist is refused too", async () => {
      const c = await noPartnerCase();
      const rendered = await seqOf(c.orderId);
      expect(
        (await rerouteCandidates(c.orderId, readOptions(at(70)))).map(
          (row) => row.partnerId,
        ),
      ).toContain(c.eligible.partnerId);
      await scratch.sql`
        INSERT INTO partner_blackout (partner_id, date) VALUES (${c.eligible.partnerId}, ${TOMORROW})`;
      const before = await counts(c.orderId);
      expect(
        await reroute(c.orderId, c.eligible.partnerId, rerouteDeps(at(70)), {
          expectedSeq: rendered,
        }),
      ).toEqual({ ok: false, code: "PARTNER_NOT_ELIGIBLE" });
      for (const never of [c.blacked, c.full, c.unreachable]) {
        expect(
          await reroute(c.orderId, never.partnerId, rerouteDeps(at(70))),
        ).toEqual({ ok: false, code: "PARTNER_NOT_ELIGIBLE" });
      }
      expect(await counts(c.orderId)).toEqual(before);
      expect(await status(c.orderId)).toBe("no_partner_available");
      expect(
        (await rerouteCandidates(c.orderId, readOptions(at(70)))).map(
          (row) => row.partnerId,
        ),
      ).not.toContain(c.eligible.partnerId);
    }, 120_000);

    it("past the routing deadline a reroute is ROUTING_DEADLINE_PASSED and writes nothing; the guard runs first", async () => {
      const c = await noPartnerCase();
      const before = await counts(c.orderId);
      // 16:00 Warsaw on the delivery date is the deadline (cutoff 14:00 + 2 h).
      const late = new Date("2026-11-05T15:30:00Z");
      expect(
        await reroute(
          c.orderId,
          c.eligible.partnerId,
          rerouteDeps(late, { reroute: rerouteAt(late) }),
        ),
      ).toEqual({ ok: false, code: "ROUTING_DEADLINE_PASSED" });
      const guard = vi.fn(() => Promise.reject(new Error("FORBIDDEN")));
      await expect(
        reroute(
          c.orderId,
          c.eligible.partnerId,
          rerouteDeps(at(70), { guard }),
        ),
      ).rejects.toThrow("FORBIDDEN");
      expect(guard).toHaveBeenCalledWith("orders.reroute");
      expect(await counts(c.orderId)).toEqual(before);
    }, 120_000);

    /* ---------------------------------------------------------------------- */
    /* Cancel: paid purchases on the fake                                     */
    /* ---------------------------------------------------------------------- */

    function newFake(): FakePaymentProvider {
      fakes += 1;
      return new FakePaymentProvider({
        now: () => NOW,
        namespace: `rc${String(fakes)}`,
        refunds: "sync",
      });
    }

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    function lifecycleOf(fake: FakePaymentProvider): LifecycleDeps {
      return {
        provider: fake,
        transaction: transactionOf(),
        now: () => NOW,
        alert: () => undefined,
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    async function paidOrder(totalMinor = 5_800): Promise<{
      orderId: string;
      fake: FakePaymentProvider;
    }> {
      const fake = newFake();
      const { purchaseId, orderId } = (await scratch.sql.begin(async (tx) => {
        const customerId = await make.customer(tx);
        const recipientId = await make.recipient(tx, customerId);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES ('test', 'PLN', ${totalMinor}, 'en', ${customerId}) RETURNING id`;
        const purchase = row?.id ?? "";
        const countryId = await make.country(tx, "PL");
        const id = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode: "test",
          totalMinor,
          purchaseId: purchase,
        });
        await tx`UPDATE "order"
                 SET buyer_snapshot = ${tx.json({ name: BUYER_NAME, countryIso2: "GB" })},
                     delivery_date = ${FAR_DATE}::date
                 WHERE id = ${id}`;
        return { purchaseId: purchase, orderId: id };
      })) as { purchaseId: string; orderId: string };
      const started = await startPayment(purchaseId, lifecycleOf(fake));
      if (started.kind !== "started") throw new Error(started.kind);
      await fake.simulateSuccess(started.intentRef);
      const synced = await syncFromProvider(purchaseId, lifecycleOf(fake));
      if (synced.outcome !== "captured") throw new Error(synced.outcome);
      return { orderId, fake };
    }

    async function walk(orderId: string, target: string): Promise<void> {
      await scratch.sql.begin((tx: Tx) => walkOrderTo(tx, orderId, target));
    }

    const refundCalls = (fake: FakePaymentProvider) =>
      fake.calls.filter((call) => call.method === "refund").length;

    async function refundRows(orderId: string) {
      return scratch.sql<
        { amount_minor: string; reason: string; status: string }[]
      >`SELECT amount_minor, reason, status FROM refund WHERE order_id = ${orderId}
        ORDER BY created_at`;
    }

    /* ---------------------------------------------------------------------- */
    /* T-14 (AC-13)                                                           */
    /* ---------------------------------------------------------------------- */

    for (const state of SET_E.filter((s) => s !== "authorised")) {
      it(`T-14 (AC-13): from ${state}, each of the three reasons cancels with that reason as the admin; spec 013's handler then refunds the whole 5 800`, async () => {
        for (const reason of E_REASONS) {
          const { orderId, fake } = await paidOrder();
          if (state !== "paid_unrouted") await walk(orderId, state);
          const before = (await events(orderId)).length;
          const result = await cancel(orderId, reason, {
            ...(reason === "other" ? { note: NOTE } : {}),
          });
          const tail = (await events(orderId)).slice(before);
          expect(tail, `${state} ${reason}`).toHaveLength(1);
          expect(tail[0]).toMatchObject({
            type: "order.cancelled",
            actor: `admin:${ADMIN_ID}`,
            from_status: state,
            to_status: "cancelled",
            payload: { reason },
          });
          expect(result).toEqual({
            ok: true,
            kind: "cancel",
            resultRef: tail[0]?.id,
            replayed: false,
          });
          expect(refundCalls(fake)).toBe(0);
          expect(await outboxTargetsOf(orderId, "order.cancelled")).toContain(
            "payments",
          );
          await refundCancelledOrder(orderId, lifecycleOf(fake));
          expect(await refundRows(orderId)).toEqual([
            { amount_minor: "5800", reason, status: "succeeded" },
          ]);
          expect(refundCalls(fake)).toBe(1);
          const rows = await actionRows(orderId);
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            kind: "cancel",
            reason,
            partner_id: null,
            amount_minor: null,
            result_ref: tail[0]?.id,
          });
          expect(rows[0]?.tx).toBe(tail[0]?.tx);
          const audits = await auditRows(orderId);
          expect(audits).toHaveLength(1);
          expect(audits[0]).toMatchObject({
            action: "order.action.cancel",
            reason: reason === "other" ? NOTE : null,
          });
          expect(audits[0]?.row_text).not.toContain(BUYER_NAME);
        }
      }, 240_000);
    }

    it("T-14 (AC-13): from authorised (nothing captured) each reason cancels as the admin and the handler finds nothing to refund", async () => {
      for (const reason of E_REASONS) {
        const orderId = (await scratch.sql.begin(async (tx) => {
          const customerId = await make.customer(tx);
          const recipientId = await make.recipient(tx, customerId);
          const countryId = await make.country(tx, "PL");
          const id = await insertPlacedOrder(tx, {
            customerId,
            recipientId,
            countryId,
            mode: "test",
          });
          await walkOrderTo(tx, id, "authorised");
          return id;
        })) as string;
        const result = await cancel(orderId, reason, {
          ...(reason === "other" ? { note: NOTE } : {}),
        });
        expect(result).toMatchObject({ ok: true, kind: "cancel" });
        expect((await events(orderId)).at(-1)).toMatchObject({
          type: "order.cancelled",
          actor: `admin:${ADMIN_ID}`,
          from_status: "authorised",
          payload: { reason },
        });
        expect(
          (await refundCancelledOrder(orderId, lifecycleOf(newFake()))).kind,
        ).toBe("not_captured");
      }
    }, 120_000);

    it("the cancel form has no amount: an amount field fails the schema; other without a note fails; nothing is written", async () => {
      const { orderId, fake } = await paidOrder();
      const before = await counts(orderId);
      expect(
        await adminOrderCancel(
          {
            orderId,
            actionId: randomUUID(),
            expectedSeq: await seqOf(orderId),
            reason: "buyer_cancel",
            amountMinor: 100,
          },
          cancelDeps(),
        ),
      ).toEqual({ ok: false, code: "INPUT_INVALID" });
      expect(await cancel(orderId, "other")).toEqual({
        ok: false,
        code: "INPUT_INVALID",
      });
      expect(await cancel(orderId, "quality")).toEqual({
        ok: false,
        code: "INPUT_INVALID",
      });
      expect(await counts(orderId)).toEqual(before);
      expect(refundCalls(fake)).toBe(0);
    }, 120_000);

    /* ---------------------------------------------------------------------- */
    /* T-15 (AC-14)                                                           */
    /* ---------------------------------------------------------------------- */

    it("T-15 (AC-14): from accepted and paid only buyer_cancel is offered; a forged no_partner or other is CANCEL_REASON_NOT_ALLOWED with zero rows", async () => {
      for (const state of ["accepted", "paid"] as const) {
        const offeredReasons = availableActions(
          {
            status: state,
            mode: "test",
            capturedMinor: 5_800n,
            remainingMinor: 5_800n,
            refundInFlight: false,
          },
          { roles: ["admin"] },
        ).cancel;
        expect(offeredReasons).toEqual({
          available: true,
          reasons: ["buyer_cancel"],
        });
        const { orderId, fake } = await paidOrder();
        await walk(orderId, state);
        const before = await counts(orderId);
        expect(await cancel(orderId, "no_partner")).toEqual({
          ok: false,
          code: "CANCEL_REASON_NOT_ALLOWED",
        });
        expect(await cancel(orderId, "other", { note: NOTE })).toEqual({
          ok: false,
          code: "CANCEL_REASON_NOT_ALLOWED",
        });
        expect(await counts(orderId)).toEqual(before);
        expect(await status(orderId)).toBe(state);
        expect(refundCalls(fake)).toBe(0);
        expect(await cancel(orderId, "buyer_cancel")).toMatchObject({
          ok: true,
          kind: "cancel",
        });
        expect(await status(orderId)).toBe("cancelled");
      }
    }, 120_000);

    it("T-15 (AC-14): a buyer_cancel from accepted reaches the routing target and leaves exactly one payout_adjustment for the accepted assignment, still one when handled twice", async () => {
      const w = await world();
      const f = await florist(w, { name: "Kwiaty Mokotow", payout: 11000 });
      const orderId = await securedOrder(w);
      const offer = await offered(orderId, NOW);
      await answer(f, offer.assignmentId, { response: "accept" }, at(1));
      expect(await status(orderId)).toBe("accepted");
      expect(await cancel(orderId, "buyer_cancel")).toMatchObject({
        ok: true,
        kind: "cancel",
      });
      expect(await outboxTargetsOf(orderId, "order.cancelled")).toContain(
        "routing",
      );
      const noop = () => Promise.resolve();
      const handlers: HandlerRegistry = {
        routing: routingOutboxHandler({
          schedule: recorder().schedule,
          alert: vi.fn(),
        }),
        payments: noop,
        invoices: noop,
        notifications: noop,
      };
      for (let round = 0; round < 2; round += 1) {
        await scratch.sql`
          UPDATE outbox_delivery d SET status = 'pending', attempts = 0
          FROM outbox x JOIN order_event e ON e.id = x.event_id
          WHERE d.outbox_id = x.id AND d.target = 'routing' AND e.order_id = ${orderId}
            AND e.type = 'order.cancelled'`;
        const dispatched = await dispatchOutbox({
          handlers,
          transaction: system,
          orderId,
          heldTargets: [],
          log: quiet(),
          alert: vi.fn(),
        });
        expect(dispatched.failed).toBe(0);
      }
      const adjustments = await scratch.sql<
        { assignment_id: string; partner_id: string; kind: string }[]
      >`SELECT assignment_id, partner_id, kind FROM payout_adjustment WHERE order_id = ${orderId}`;
      expect(adjustments).toEqual([
        {
          assignment_id: offer.assignmentId,
          partner_id: f.partnerId,
          kind: "withdrawn_by_buyer_after_acceptance",
        },
      ]);
    }, 120_000);

    /* ---------------------------------------------------------------------- */
    /* T-16 (AC-15)                                                           */
    /* ---------------------------------------------------------------------- */

    it("T-16 (AC-15): on in_production, out_for_delivery and delivered no cancel control; a forged cancel with any reason is ORDER_TRANSITION_ILLEGAL, no provider call, zero rows; placed too", async () => {
      for (const state of [
        "in_production",
        "out_for_delivery",
        "delivered",
      ] as const) {
        expect(
          availableActions(
            {
              status: state,
              mode: "test",
              capturedMinor: 5_800n,
              remainingMinor: 5_800n,
              refundInFlight: false,
            },
            { roles: ["admin"] },
          ).cancel,
        ).toEqual({ available: false, cause: "status" });
        const { orderId, fake } = await paidOrder();
        await walk(orderId, state);
        const before = await counts(orderId);
        for (const reason of E_REASONS) {
          expect(
            await cancel(orderId, reason, {
              ...(reason === "other" ? { note: NOTE } : {}),
            }),
            `${state} ${reason}`,
          ).toEqual({ ok: false, code: "ORDER_TRANSITION_ILLEGAL" });
        }
        expect(await counts(orderId)).toEqual(before);
        expect(await status(orderId)).toBe(state);
        expect(refundCalls(fake)).toBe(0);
      }
      const placed = (await scratch.sql.begin(async (tx) => {
        const customerId = await make.customer(tx);
        const recipientId = await make.recipient(tx, customerId);
        return insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId: await make.country(tx, "PL"),
          mode: "test",
        });
      })) as string;
      expect(await cancel(placed, "buyer_cancel")).toEqual({
        ok: false,
        code: "ORDER_TRANSITION_ILLEGAL",
      });
    }, 240_000);

    /* ---------------------------------------------------------------------- */
    /* T-05, T-06 for cancel; guard; demo                                     */
    /* ---------------------------------------------------------------------- */

    it("T-06 (AC-5): one cancel actionId twice in sequence and twice in parallel: one order.cancelled, the second replayed with the first resultRef", async () => {
      for (const parallel of [false, true]) {
        const { orderId } = await paidOrder();
        const actionId = randomUUID();
        const expectedSeq = await seqOf(orderId);
        const d = cancelDeps(
          parallel ? { transaction: racingTransaction() } : {},
        );
        const submit = () =>
          cancel(orderId, "buyer_cancel", { actionId, expectedSeq, deps: d });
        const results = parallel
          ? await Promise.all([submit(), submit()])
          : [await submit(), await submit()];
        const cancelled = (await events(orderId)).filter(
          (row) => row.type === "order.cancelled",
        );
        expect(cancelled, `parallel ${String(parallel)}`).toHaveLength(1);
        expect((await counts(orderId)).actions).toBe(1);
        expect((await counts(orderId)).audits).toBe(1);
        expect(results).toContainEqual({
          ok: true,
          kind: "cancel",
          resultRef: cancelled[0]?.id,
          replayed: true,
        });
        expect(results).toContainEqual({
          ok: true,
          kind: "cancel",
          resultRef: cancelled[0]?.id,
          replayed: false,
        });
      }
    }, 120_000);

    it("T-05 (AC-4): a cancel on a stale expectedSeq is ORDER_CHANGED; a demo order is DEMO_ORDER; a refused guard reads and writes nothing", async () => {
      const { orderId } = await paidOrder();
      const stale = (await seqOf(orderId)) - 1;
      const before = await counts(orderId);
      expect(
        await cancel(orderId, "buyer_cancel", { expectedSeq: stale }),
      ).toEqual({ ok: false, code: "ORDER_CHANGED" });
      const guard = vi.fn(() => Promise.reject(new Error("FORBIDDEN")));
      await expect(
        cancel(orderId, "buyer_cancel", { deps: cancelDeps({ guard }) }),
      ).rejects.toThrow("FORBIDDEN");
      expect(guard).toHaveBeenCalledWith("orders.cancel");
      expect(await counts(orderId)).toEqual(before);
      expect(await status(orderId)).toBe("paid_unrouted");

      const demo = (await scratch.sql.begin(async (tx) => {
        const customerId = await make.customer(tx);
        const recipientId = await make.recipient(tx, customerId);
        const id = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId: await make.country(tx, "PL"),
          mode: "demo",
        });
        await walkOrderTo(tx, id, "paid_unrouted");
        return id;
      })) as string;
      expect(await cancel(demo, "buyer_cancel")).toEqual({
        ok: false,
        code: "DEMO_ORDER",
      });
      expect((await counts(demo)).actions).toBe(0);
    }, 120_000);
  },
);
