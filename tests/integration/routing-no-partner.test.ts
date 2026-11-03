/**
 * Spec 016's no-partner path, `manualReroute` and withdrawal against migrated tables (§5.2
 * "Jobs" `order.no_partner_expire`, "The `routing` outbox handler", "`manualReroute`"; AC-11,
 * AC-12, AC-13, AC-15; T-11, T-12, T-13, T-15; TASK-329, TASK-330).
 *
 * The world helpers are `routing-jobs.test.ts`'s: each test gets its own country, every order is
 * captured through the engine, every job runs in a `system` transaction of its own. Clocks are
 * injected; the instant an order entered `no_partner_available` is the event's own `occurred_at`,
 * which a case moves to its wall-clock moment with `exhaustedAt(...)` (a superuser write with
 * triggers off, test-only), so `graceEnd` is checked one second before, at and after it.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger.ts";

import {
  acceptedOrderEffectFor,
  type AcceptedOrderEffect,
} from "../../src/modules/orders/demo/effect.ts";
import {
  type FloristCommandContext,
  type FloristCommandRuntime,
  respondToOffer,
} from "../../src/modules/orders/florist-actions/index.ts";
import {
  selectFloristAssignments,
  selectFloristOrderView,
} from "../../src/modules/orders/florist/read.ts";
import {
  dispatchOutbox,
  type HandlerRegistry,
  type OrderExecutor,
  type OutboxDeliveryEvent,
  transition,
} from "../../src/modules/orders/index.ts";
import {
  createRoutingDeclineEffect,
  expireNoPartner,
  graceEndOf,
  manualReroute,
  photoRemind,
  readExhaustion,
  remindAssignment,
  routeOrder,
  routingOutboxHandler,
  timeoutAssignment,
  WITHDRAWN_REASON,
  type RoutingDeps,
  type RoutingJob,
  type RoutingTransaction,
  type WithdrawalEvent,
} from "../../src/modules/orders/routing/jobs.ts";
import { cancelOrder } from "../../src/modules/payments/index.ts";
import { notificationsFor } from "../../src/modules/notifications/rules.ts";
import { walkOrderTo, insertPlacedOrder } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const SKU = "FO-BQ-329";
const TIER = "stems_15";
/** 11:00 in Warsaw (CET) on Wednesday 4 Nov 2026. */
const NOW = new Date("2026-11-04T10:00:00Z");
const TOMORROW = "2026-11-05";
const MINUTE = 60_000;
const at = (minutes: number): Date =>
  new Date(NOW.getTime() + minutes * MINUTE);

const quiet = () => createLogger({ level: "fatal", write: () => undefined });

interface World {
  readonly countryId: string;
  readonly cityId: string;
  readonly iso2: string;
}

interface Florist {
  readonly partnerId: string;
  readonly members: readonly string[];
}

interface EventRow {
  type: string;
  actor: string;
  from_status: string | null;
  to_status: string | null;
  payload: Record<string, unknown>;
  tx: string;
}

let countryCounter = 0;

describe.skipIf(server.url === undefined)(
  `spec 016 no-partner path and withdrawal on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let productId = "";

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "routing_np");
      await scratch.sql.begin(async (tx) => {
        await make.base(tx);
        const [product] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                               substitution_class, freshness_days)
          VALUES (${SKU}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
          RETURNING id`;
        productId = product?.id ?? "";
        await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
                 VALUES (${productId}, ${TIER}, 'catalog.tier.stems', 15, 0, true)`;
        await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
                 VALUES (${productId}, 'en', 'Amber Hour', 'amber-hour-329')`;
      });
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    /* ---------------------------------------------------------------------- */
    /* Seams                                                                  */
    /* ---------------------------------------------------------------------- */

    /** A `system` transaction on its own connection, as `withSystemContext` opens one. */
    const system: RoutingTransaction = <T>(
      fn: (executor: OrderExecutor) => Promise<T>,
    ) =>
      scratch.sql.begin(async (tx) => {
        await asApp(tx, { role: "system" });
        return fn(runnerOf(tx));
      }) as Promise<T>;

    function recorder() {
      const jobs: RoutingJob[] = [];
      return {
        jobs,
        schedule: vi.fn(async (batch: readonly RoutingJob[]) => {
          jobs.push(...batch);
        }),
      };
    }

    function deps(
      now: Date,
      over: Partial<RoutingDeps> = {},
    ): RoutingDeps & { alert: ReturnType<typeof vi.fn> } {
      const alert = vi.fn();
      return {
        transaction: system,
        now: () => now,
        schedule: recorder().schedule,
        signInStatuses: ["demo", "active"],
        alert,
        log: quiet(),
        ...over,
      } as RoutingDeps & { alert: ReturnType<typeof vi.fn> };
    }

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

    /** Spec 011's command with the router's decline half and no accept effect. */
    function answer(
      florist: Florist,
      assignmentId: string,
      input: unknown,
      now: Date,
      schedule = recorder().schedule,
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
              routed: createRoutingDeclineEffect(schedule),
            }),
        },
      );
    }

    /* ---------------------------------------------------------------------- */
    /* World                                                                  */
    /* ---------------------------------------------------------------------- */

    /** A fresh destination: its own country (cutoff 14:00 Warsaw), city and postcode zone. */
    async function world(): Promise<World> {
      countryCounter += 1;
      const iso2 = `Y${String.fromCharCode(64 + countryCounter)}`;
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
        return { countryId, cityId, iso2 };
      }) as Promise<World>;
    }

    /** A florist covering the zone, able to make the bouquet for `payout`, with `members`. */
    async function florist(
      w: World,
      options: {
        status?: "demo" | "active";
        payout: number;
        capacity?: number;
        members?: number;
        whatsapp?: boolean;
      },
    ): Promise<Florist> {
      return scratch.sql.begin(async (tx) => {
        const partnerId = await make.partner(
          tx,
          w.countryId,
          options.status ?? "demo",
        );
        await tx`UPDATE fulfillment_partner SET capacity_per_day = ${options.capacity ?? 15}
                 WHERE id = ${partnerId}`;
        if (options.whatsapp === true) {
          await tx`UPDATE fulfillment_partner SET notification_channel = 'whatsapp',
                   contact_phone = '+48500999000' WHERE id = ${partnerId}`;
        }
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

    /**
     * A placed order in `w`, captured through the engine (row 2, `system:payments`), so it is
     * `paid_unrouted` with its real outbox rows.
     */
    async function securedOrder(
      w: World,
      mode: "demo" | "test" | "live",
      deliveryDate = TOMORROW,
    ): Promise<string> {
      const orderId = (await scratch.sql.begin(async (tx) => {
        const customerId = await make.customer(tx);
        const recipientId = await make.recipient(tx, customerId);
        const id = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId: w.countryId,
          mode,
        });
        await tx`UPDATE "order" SET destination_city_id = ${w.cityId},
                 destination_postcode = '00-950', delivery_date = ${deliveryDate}
                 WHERE id = ${id}`;
        await tx`INSERT INTO order_line (order_id, kind, product_id, tier_key, qty,
                                         unit_retail_minor, currency_code, vat_rate_bp)
                 VALUES (${id}, 'product', ${productId}, ${TIER}, 1, 18900, 'PLN', 800)`;
        await asApp(tx, { role: "system" });
        await transition(
          id,
          "order.captured",
          "system:payments",
          { mode, provider_call: true },
          { executor: runnerOf(tx) },
        );
        return id;
      })) as string;
      return orderId;
    }

    async function offered(
      orderId: string,
      now = NOW,
      over: Partial<RoutingDeps> = {},
    ) {
      const outcome = await routeOrder(orderId, deps(now, over));
      if (outcome.kind !== "offered") {
        throw new Error(`expected an offer, got ${JSON.stringify(outcome)}`);
      }
      return outcome;
    }

    async function events(orderId: string): Promise<EventRow[]> {
      return scratch.sql<EventRow[]>`
        SELECT type, actor, from_status, to_status, payload, xmin::text AS tx
        FROM order_event WHERE order_id = ${orderId} ORDER BY seq`;
    }

    async function status(orderId: string): Promise<string | undefined> {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status;
    }

    async function assignments(orderId: string) {
      return scratch.sql<
        {
          id: string;
          partner_id: string;
          attempt: number;
          response: string | null;
          offered_at: Date;
          sla_expires_at: Date;
        }[]
      >`SELECT id, partner_id, attempt, response, offered_at, sla_expires_at
        FROM order_assignment WHERE order_id = ${orderId} ORDER BY attempt`;
    }

    async function outboxTargetsOf(orderId: string, type: string) {
      const rows = await scratch.sql<{ target: string }[]>`
        SELECT d.target FROM outbox_delivery d
        JOIN outbox x ON x.id = d.outbox_id JOIN order_event e ON e.id = x.event_id
        WHERE e.order_id = ${orderId} AND e.type = ${type} ORDER BY d.target`;
      return rows.map((row) => row.target);
    }

    const noop = () => Promise.resolve();
    function handlers(routing: HandlerRegistry["routing"]): HandlerRegistry {
      return {
        routing,
        payments: noop,
        invoices: noop,
        notifications: noop,
        payouts: noop,
      };
    }

    /**
     * Moves the order's latest `order.no_partner_available` to `instant`: the wall-clock moment a
     * case is about. Test-only: a superuser write with the append-only trigger off.
     */
    async function exhaustedAt(orderId: string, instant: Date): Promise<void> {
      await scratch.sql.begin(async (tx: Tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`UPDATE order_event SET occurred_at = ${instant}
                 WHERE id = (SELECT id FROM order_event WHERE order_id = ${orderId}
                               AND type = 'order.no_partner_available'
                             ORDER BY seq DESC LIMIT 1)`;
      });
    }

    /** An order in an empty `w` (no florist), exhausted by the router, its exhaustion at `instant`. */
    async function exhaustedOrder(
      w: World,
      mode: "test" | "live",
      deliveryDate: string,
      instant: Date,
    ): Promise<string> {
      const orderId = await securedOrder(w, mode, deliveryDate);
      expect((await routeOrder(orderId, deps(NOW))).kind).toBe("exhausted");
      await exhaustedAt(orderId, instant);
      return orderId;
    }

    async function graceEndFor(orderId: string): Promise<Date> {
      const exhaustion = await system((executor) =>
        readExhaustion(executor, orderId),
      );
      const end = exhaustion === undefined ? null : graceEndOf(exhaustion);
      if (end === null) throw new Error("no grace end");
      return end;
    }

    async function cancelled(orderId: string): Promise<EventRow[]> {
      return (await events(orderId)).filter(
        (row) => row.type === "order.cancelled",
      );
    }

    const SECOND = 1000;

    /** One second before `end` nothing is written; at `end` one `order.cancelled`. */
    async function expiresExactlyAt(orderId: string, end: Date): Promise<void> {
      const early = recorder();
      const before = (await events(orderId)).length;
      expect(
        await expireNoPartner(
          orderId,
          deps(new Date(end.getTime() - SECOND), { schedule: early.schedule }),
        ),
      ).toEqual({ kind: "not_due", graceEnd: end });
      expect(early.jobs).toEqual([
        { name: "order.no_partner_expire", orderId, startAfter: end },
      ]);
      expect((await events(orderId)).length).toBe(before);
      expect(await status(orderId)).toBe("no_partner_available");

      expect((await expireNoPartner(orderId, deps(end))).kind).toBe(
        "cancelled",
      );
      const rows = await cancelled(orderId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor: "system:routing.no_partner_expiry",
        from_status: "no_partner_available",
        to_status: "cancelled",
        payload: { reason: "no_partner" },
      });
    }

    /* ---------------------------------------------------------------------- */
    /* T-11                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-11 (AC-11): a paid_unrouted order with no candidate goes to no_partner_available with A1, no buyer message, and order.no_partner_expire scheduled at graceEnd", async () => {
      const w = await world();
      const orderId = await securedOrder(w, "live");
      const rec = recorder();
      const d = deps(NOW, { schedule: rec.schedule });
      const outcome = await routeOrder(orderId, d);
      const end = await graceEndFor(orderId);
      expect(outcome).toEqual({
        kind: "exhausted",
        reason: "no_candidate",
        expiresAt: end,
      });
      expect(rec.jobs).toEqual([
        { name: "order.no_partner_expire", orderId, startAfter: end },
      ]);
      expect((await events(orderId)).at(-1)).toMatchObject({
        type: "order.no_partner_available",
        from_status: "paid_unrouted",
        actor: "system:order.route",
      });
      expect(d.alert).toHaveBeenCalledWith("routing.no_partner", {
        order_id: orderId,
        reason: "no_candidate",
      });
      // A1 rides the notifications target; no buyer row exists for the event in any mode.
      expect(
        await outboxTargetsOf(orderId, "order.no_partner_available"),
      ).toEqual(["notifications"]);
      for (const from of ["paid_unrouted", "routed"]) {
        expect(
          notificationsFor("order.no_partner_available", from, "live").map(
            (rule) => [rule.code, rule.audience],
          ),
        ).toEqual([["A1", "ops"]]);
      }
    });

    it("T-11 (AC-11): routing.auto off for one country only sends its paid order straight to no_partner_available with the expiry at graceEnd; the other country routes; at graceEnd the order is cancelled once through cancelOrder with no_partner, the refund and B5 queued", async () => {
      const off = await world();
      const on = await world();
      await florist(off, { status: "active", payout: 11000 });
      await florist(on, { status: "active", payout: 11000 });
      await scratch.sql`
        INSERT INTO feature_flag_scope (flag_key, scope, scope_ref, enabled)
        VALUES ('routing.auto', 'country', ${off.iso2}, false)`;
      const offOrder = await securedOrder(off, "live");
      const onOrder = await securedOrder(on, "live");

      const rec = recorder();
      const alert = vi.fn();
      const routing = routingOutboxHandler({ schedule: rec.schedule, alert });
      for (const orderId of [offOrder, onOrder]) {
        for (let round = 0; round < 2; round += 1) {
          // The second round hands the same routing delivery over again.
          await scratch.sql`
            UPDATE outbox_delivery d SET status = 'pending', attempts = 0
            FROM outbox x JOIN order_event e ON e.id = x.event_id
            WHERE d.outbox_id = x.id AND d.target = 'routing' AND e.order_id = ${orderId}
              AND e.type = 'order.captured'`;
          const counts = await dispatchOutbox({
            handlers: handlers(routing),
            transaction: system,
            orderId,
            heldTargets: [],
            log: quiet(),
            alert: vi.fn(),
          });
          expect(counts.failed).toBe(0);
        }
      }
      expect(await status(offOrder)).toBe("no_partner_available");
      expect(await status(onOrder)).toBe("paid_unrouted");
      const end = await graceEndFor(offOrder);
      expect(rec.jobs).toEqual([
        { name: "order.no_partner_expire", orderId: offOrder, startAfter: end },
        { name: "order.route", orderId: onOrder },
        { name: "order.route", orderId: onOrder },
      ]);
      const exhausted = (await events(offOrder)).filter(
        (row) => row.type === "order.no_partner_available",
      );
      expect(exhausted).toHaveLength(1);
      expect(exhausted[0]).toMatchObject({
        actor: "system:order.route",
        from_status: "paid_unrouted",
      });
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith("routing.no_partner", {
        order_id: offOrder,
        reason: "routing_auto_off",
      });
      expect(await assignments(offOrder)).toEqual([]);

      // With the flag off and nobody acting: nothing a second early, one cancel at graceEnd.
      await expiresExactlyAt(offOrder, end);
      // Spec 013's payments target refunds it; the notifications target sends B5.
      const targets = await outboxTargetsOf(offOrder, "order.cancelled");
      expect(targets).toContain("payments");
      expect(targets).toContain("notifications");
      expect(
        notificationsFor("order.cancelled", "no_partner_available", "live")
          .filter((rule) => rule.audience === "buyer")
          .map((rule) => rule.code),
      ).toEqual(["B5"]);
      // The job running twice writes nothing more.
      expect(await expireNoPartner(offOrder, deps(end))).toEqual({
        kind: "skipped",
        reason: "status",
      });
      expect(await cancelled(offOrder)).toHaveLength(1);
    });

    /* ---------------------------------------------------------------------- */
    /* T-12                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-12 (AC-12): graceEnd in Warsaw: due today +2 h (11:00 and 14:00, capped at 16:00), not due today 10:00 (exhausted 21:00 and 06:00), both DST nights; nothing one second before, one cancel at it", async () => {
      const cases: readonly {
        label: string;
        delivery: string;
        exhausted: string;
        end: string;
      }[] = [
        {
          label: "due today, 11:00",
          delivery: "2026-11-04",
          exhausted: "2026-11-04T10:00:00Z",
          end: "2026-11-04T12:00:00.000Z",
        },
        {
          label: "due today, 14:00 (capped at the 16:00 deadline)",
          delivery: "2026-11-04",
          exhausted: "2026-11-04T13:00:00Z",
          end: "2026-11-04T15:00:00.000Z",
        },
        {
          label: "not due today, 21:00",
          delivery: "2026-11-05",
          exhausted: "2026-11-04T20:00:00Z",
          end: "2026-11-05T09:00:00.000Z",
        },
        {
          label: "not due today, 06:00",
          delivery: "2026-11-05",
          exhausted: "2026-11-04T05:00:00Z",
          end: "2026-11-04T09:00:00.000Z",
        },
        {
          label: "autumn DST night (25 Oct 2026)",
          delivery: "2026-10-26",
          exhausted: "2026-10-24T19:00:00Z",
          end: "2026-10-25T09:00:00.000Z",
        },
        {
          label: "spring DST night (28 Mar 2027)",
          delivery: "2027-03-29",
          exhausted: "2027-03-27T20:00:00Z",
          end: "2027-03-28T08:00:00.000Z",
        },
      ];
      for (const one of cases) {
        const w = await world();
        const orderId = await exhaustedOrder(
          w,
          "test",
          one.delivery,
          new Date(one.exhausted),
        );
        const end = await graceEndFor(orderId);
        expect(end.toISOString(), one.label).toBe(one.end);
        await expiresExactlyAt(orderId, end);
      }
    });

    it("T-12 (AC-12): rerouted first, the job writes nothing; exhausted again later, the earlier job waits for the later graceEnd; cancelled by the buyer first, the job writes nothing", async () => {
      const w = await world();
      const f = await florist(w, { payout: 11000 });
      const orderId = await securedOrder(w, "test");
      const first = await offered(orderId);
      await answer(
        f,
        first.assignmentId,
        { response: "decline", reason: "other" },
        at(1),
      );
      expect((await routeOrder(orderId, deps(at(2)))).kind).toBe("exhausted");
      // Exhausted at 05:00 Warsaw: it ends at 10:00 the same morning.
      await exhaustedAt(orderId, new Date("2026-11-04T04:00:00Z"));
      const end = await graceEndFor(orderId);
      expect(end.toISOString()).toBe("2026-11-04T09:00:00.000Z");
      const admin = `admin:${randomUUID()}`;
      const rerouted = await manualReroute(
        orderId,
        f.partnerId,
        admin,
        deps(at(3)),
      );
      expect(rerouted.kind).toBe("rerouted");
      expect(await expireNoPartner(orderId, deps(end))).toEqual({
        kind: "skipped",
        reason: "status",
      });
      expect(await cancelled(orderId)).toEqual([]);
      expect(await status(orderId)).toBe("routed");

      // The florist declines again; the order is exhausted a second time, later.
      if (rerouted.kind !== "rerouted") throw new Error("not rerouted");
      await answer(
        f,
        rerouted.assignmentId,
        { response: "decline", reason: "other" },
        at(4),
      );
      expect((await routeOrder(orderId, deps(at(5)))).kind).toBe("exhausted");
      const later = new Date("2026-11-04T20:00:00Z");
      await exhaustedAt(orderId, later);
      const laterEnd = await graceEndFor(orderId);
      expect(laterEnd.getTime()).toBeGreaterThan(end.getTime());
      // The first exhaustion's job, still keyed to the order, fires at the first graceEnd.
      expect(await expireNoPartner(orderId, deps(end))).toEqual({
        kind: "not_due",
        graceEnd: laterEnd,
      });
      expect(await cancelled(orderId)).toEqual([]);

      const empty = await world();
      const buyerFirst = await exhaustedOrder(empty, "test", TOMORROW, NOW);
      const buyerEnd = await graceEndFor(buyerFirst);
      expect(
        (
          await system((executor) =>
            cancelOrder(buyerFirst, "buyer", "buyer_cancel", { executor }),
          )
        ).kind,
      ).toBe("cancelled");
      expect(await expireNoPartner(buyerFirst, deps(buyerEnd))).toEqual({
        kind: "skipped",
        reason: "status",
      });
      const rows = await cancelled(buyerFirst);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor: "buyer",
        payload: { reason: "buyer_cancel" },
      });
    });

    /* ---------------------------------------------------------------------- */
    /* T-13                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-13 (AC-13): manualReroute offers an earlier decliner with three events in order in one transaction; a blacked-out florist, a system actor and a routed order are refused with nothing written", async () => {
      const w = await world();
      const decliner = await florist(w, { payout: 11000 });
      const blacked = await florist(w, { payout: 9000 });
      await scratch.sql`
        INSERT INTO partner_blackout (partner_id, date) VALUES (${blacked.partnerId}, ${TOMORROW})`;
      const orderId = await securedOrder(w, "test");
      const offer = await offered(orderId);
      expect(offer.partnerId).toBe(decliner.partnerId);
      await answer(
        decliner,
        offer.assignmentId,
        { response: "decline", reason: "capacity" },
        at(1),
      );
      expect((await routeOrder(orderId, deps(at(2)))).kind).toBe("exhausted");
      const before = (await events(orderId)).length;
      const admin = `admin:${randomUUID()}`;

      expect(
        await manualReroute(orderId, blacked.partnerId, admin, deps(at(3))),
      ).toEqual({
        kind: "refused",
        code: "PARTNER_NOT_ELIGIBLE",
        rule: "blackout",
      });
      expect(
        await manualReroute(
          orderId,
          decliner.partnerId,
          "system:order.route",
          deps(at(3)),
        ),
      ).toEqual({ kind: "refused", code: "ORDER_ACTOR_NOT_ALLOWED" });
      expect((await events(orderId)).length).toBe(before);
      expect(await status(orderId)).toBe("no_partner_available");
      expect(await assignments(orderId)).toHaveLength(1);

      // The earlier decliner, inside the caller's transaction (spec 020a's handle).
      const rec = recorder();
      const done = await system((executor) =>
        manualReroute(orderId, decliner.partnerId, admin, {
          ...deps(at(3), { schedule: rec.schedule }),
          executor,
        }),
      );
      expect(done).toMatchObject({
        kind: "rerouted",
        partnerId: decliner.partnerId,
        attempt: 2,
        slaExpiresAt: at(63),
      });
      const tail = (await events(orderId)).slice(before);
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
      expect(new Set(tail.map((row) => row.tx)).size).toBe(1);
      expect(tail[0]?.payload).toEqual({
        mode: "test",
        partnerId: decliner.partnerId,
      });
      expect(rec.jobs.map((job) => job.name)).toEqual([
        "assignment.remind",
        "assignment.timeout",
      ]);
      expect(await status(orderId)).toBe("routed");

      // On a routed order: refused, nothing written.
      expect(
        await manualReroute(orderId, decliner.partnerId, admin, deps(at(4))),
      ).toEqual({ kind: "refused", code: "ORDER_TRANSITION_ILLEGAL" });
      expect((await events(orderId)).length).toBe(before + 3);
      expect(await assignments(orderId)).toHaveLength(2);
    });

    /* ---------------------------------------------------------------------- */
    /* T-15                                                                   */
    /* ---------------------------------------------------------------------- */

    const MARKERS = {
      fullName: "Zofia Markerowa",
      phoneE164: "+48555000111",
      addressLines: ["ul. Markerowa 7"],
      city: "Warszawa",
      placeKind: "home",
      deliveryNote: "MARKER note",
      cardMessage: "MARKER card",
    } as const;

    async function adjustments(orderId: string) {
      return scratch.sql<
        {
          assignment_id: string;
          partner_id: string;
          kind: string;
          status: string;
        }[]
      >`SELECT assignment_id, partner_id, kind, status FROM payout_adjustment
        WHERE order_id = ${orderId}`;
    }

    async function latestAssignment(orderId: string) {
      const [row] = await scratch.sql<
        {
          id: string;
          partner_id: string;
          withdrawn_at: Date | null;
          withdrawn_reason: string | null;
        }[]
      >`SELECT id, partner_id, withdrawn_at, withdrawn_reason FROM order_assignment
        WHERE order_id = ${orderId} ORDER BY attempt DESC LIMIT 1`;
      if (row === undefined) throw new Error("no assignment");
      return row;
    }

    /** A `test` order of `f` at `state`: an open offer (`routed`), or accepted and walked on. */
    async function orderAt(
      w: World,
      f: Florist,
      state: string,
    ): Promise<string> {
      const orderId = await securedOrder(w, "test");
      await scratch.sql`UPDATE "order" SET recipient_snapshot = ${scratch.sql.json(MARKERS)}
                        WHERE id = ${orderId}`;
      const offer = await offered(orderId);
      if (state === "routed") return orderId;
      await answer(f, offer.assignmentId, { response: "accept" }, at(1));
      if (state !== "accepted") {
        await scratch.sql.begin((tx: Tx) => walkOrderTo(tx, orderId, state));
      }
      expect(await status(orderId)).toBe(state);
      return orderId;
    }

    /** The `routing` handler on one withdrawal event, as its outbox delivery would run it. */
    async function stop(
      orderId: string,
      type: WithdrawalEvent,
      fromStatus: string,
    ): Promise<void> {
      const delivered: OutboxDeliveryEvent = {
        eventId: randomUUID(),
        orderId,
        type,
        seq: 99,
        fromStatus,
        toStatus: "cancelled",
        mode: "test",
      };
      await system((executor) =>
        routingOutboxHandler({ schedule: recorder().schedule, alert: vi.fn() })(
          delivered,
          {
            deliveryId: randomUUID(),
            outboxId: randomUUID(),
            target: "routing",
            attempt: 1,
            executor,
          },
        ),
      );
    }

    it("T-15 (AC-15): each of the four events from routed, accepted, paid and in_production withdraws the assignment with its reason and V4; from delivered nothing; one payout_adjustment only for order.cancelled from accepted and paid, still one when handled twice", async () => {
      const w = await world();
      const f = await florist(w, { payout: 11000, capacity: 200 });
      const states = [
        "routed",
        "accepted",
        "paid",
        "in_production",
        "delivered",
      ] as const;
      const events4 = Object.keys(WITHDRAWN_REASON) as WithdrawalEvent[];
      for (const type of events4) {
        for (const state of states) {
          const label = `${type} from ${state}`;
          const orderId = await orderAt(w, f, state);
          await stop(orderId, type, state);
          const first = await latestAssignment(orderId);
          await stop(orderId, type, state);
          const again = await latestAssignment(orderId);
          const v4 = notificationsFor(type, state, "test").some(
            (rule) => rule.template === "offer-withdrawn",
          );
          if (state === "delivered") {
            expect(first.withdrawn_at, label).toBeNull();
            expect(first.withdrawn_reason, label).toBeNull();
            expect(v4, label).toBe(false);
          } else {
            expect(first.withdrawn_reason, label).toBe(WITHDRAWN_REASON[type]);
            expect(first.withdrawn_at, label).not.toBeNull();
            expect(again.withdrawn_at, label).toEqual(first.withdrawn_at);
            expect(v4, label).toBe(true);
          }
          const owed =
            type === "order.cancelled" &&
            (state === "accepted" || state === "paid");
          expect(await adjustments(orderId), label).toEqual(
            owed
              ? [
                  {
                    assignment_id: first.id,
                    partner_id: f.partnerId,
                    kind: "withdrawn_by_buyer_after_acceptance",
                    status: "open",
                  },
                ]
              : [],
          );
        }
      }
    }, 240_000);

    it("T-15 (AC-15): a buyer cancel from accepted through cancelOrder reaches the routing target; handled twice it leaves one adjustment; later jobs write nothing; the florist sees the withdrawn stage with no recipient field until the delivery date passes", async () => {
      const w = await world();
      const f = await florist(w, { payout: 11000 });
      const orderId = await orderAt(w, f, "accepted");
      const assignmentId = (await latestAssignment(orderId)).id;
      const ctx = { userId: f.members[0] ?? "", partnerIds: [f.partnerId] };
      const view = (now: Date) =>
        runtime.asPartner(ctx, (executor) =>
          selectFloristOrderView(executor, assignmentId, { now }),
        );
      const list = (now: Date) =>
        runtime.asPartner(ctx, (executor) =>
          selectFloristAssignments(executor, { now }),
        );
      // Before: the accepted page prints the recipient, so the markers are reachable.
      expect(JSON.stringify(await view(at(2)))).toContain(MARKERS.fullName);

      expect(
        (
          await system((executor) =>
            cancelOrder(orderId, "buyer", "buyer_cancel", { executor }),
          )
        ).kind,
      ).toBe("cancelled");
      expect(await outboxTargetsOf(orderId, "order.cancelled")).toContain(
        "routing",
      );
      const routing = routingOutboxHandler({
        schedule: recorder().schedule,
        alert: vi.fn(),
      });
      for (let round = 0; round < 2; round += 1) {
        await scratch.sql`
          UPDATE outbox_delivery d SET status = 'pending', attempts = 0
          FROM outbox x JOIN order_event e ON e.id = x.event_id
          WHERE d.outbox_id = x.id AND d.target = 'routing' AND e.order_id = ${orderId}
            AND e.type = 'order.cancelled'`;
        const counts = await dispatchOutbox({
          handlers: handlers(routing),
          transaction: system,
          orderId,
          heldTargets: [],
          log: quiet(),
          alert: vi.fn(),
        });
        expect(counts.failed).toBe(0);
      }
      expect(await latestAssignment(orderId)).toMatchObject({
        id: assignmentId,
        withdrawn_reason: "order_cancelled",
      });
      expect(await adjustments(orderId)).toHaveLength(1);

      // Pending jobs find it withdrawn (or the order no longer delivered) and write nothing.
      const before = (await events(orderId)).length;
      const notify = vi.fn(() => Promise.resolve());
      expect(
        await remindAssignment(assignmentId, { ...deps(at(30)), notify }),
      ).toEqual({ kind: "skipped", reason: "answered" });
      expect(await timeoutAssignment(assignmentId, deps(at(61)))).toEqual({
        kind: "skipped",
        reason: "answered",
      });
      expect(await photoRemind(orderId, { ...deps(at(120)), notify })).toEqual({
        kind: "skipped",
        reason: "status",
      });
      expect((await events(orderId)).length).toBe(before);
      expect(notify).not.toHaveBeenCalled();

      // The withdrawn stage: no recipient field, no payout, in the list until the date passes.
      const page = await view(at(5));
      expect(page?.stage).toBe("withdrawn");
      expect(page).not.toHaveProperty("recipient");
      expect(page).not.toHaveProperty("payout");
      const html = JSON.stringify(page);
      for (const marker of [
        MARKERS.fullName,
        MARKERS.phoneE164,
        MARKERS.addressLines[0],
        MARKERS.deliveryNote,
        MARKERS.cardMessage,
      ]) {
        expect(html).not.toContain(marker);
      }
      // 23:00 Warsaw on the delivery date (5 Nov): still listed; 00:30 on 6 Nov: gone.
      const listed = (await list(new Date("2026-11-05T22:00:00Z"))).filter(
        (item) => item.assignmentId === assignmentId,
      );
      expect(listed.map((item) => [item.stage, item.payout])).toEqual([
        ["withdrawn", undefined],
      ]);
      expect(
        (await list(new Date("2026-11-05T23:30:00Z"))).map(
          (item) => item.assignmentId,
        ),
      ).not.toContain(assignmentId);
    });

    it("T-15 (AC-15): an open offer withdrawn by a cancel: its reminder and timeout write nothing, and a cancel from routed owes no adjustment", async () => {
      const w = await world();
      const f = await florist(w, { payout: 11000 });
      const orderId = await orderAt(w, f, "routed");
      const assignmentId = (await latestAssignment(orderId)).id;
      expect(
        (
          await system((executor) =>
            cancelOrder(orderId, `admin:${randomUUID()}`, "no_partner", {
              executor,
            }),
          )
        ).kind,
      ).toBe("cancelled");
      await dispatchOutbox({
        handlers: handlers(
          routingOutboxHandler({ schedule: recorder().schedule }),
        ),
        transaction: system,
        orderId,
        heldTargets: [],
        log: quiet(),
        alert: vi.fn(),
      });
      expect(await latestAssignment(orderId)).toMatchObject({
        withdrawn_reason: "order_cancelled",
      });
      const before = (await events(orderId)).length;
      const notify = vi.fn(() => Promise.resolve());
      expect(
        await remindAssignment(assignmentId, { ...deps(at(30)), notify }),
      ).toEqual({ kind: "skipped", reason: "withdrawn" });
      expect(await timeoutAssignment(assignmentId, deps(at(61)))).toEqual({
        kind: "skipped",
        reason: "withdrawn",
      });
      expect((await events(orderId)).length).toBe(before);
      expect(notify).not.toHaveBeenCalled();
      expect(await adjustments(orderId)).toEqual([]);
    });
  },
);
