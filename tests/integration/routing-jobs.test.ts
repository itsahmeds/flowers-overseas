/**
 * Spec 016's routing jobs against migrated tables (§5.2 "Jobs", "The `routing` outbox handler";
 * AC-1, AC-5 to AC-10, AC-16, AC-17, AC-31, AC-32; T-01, T-05 to T-10, T-16, T-17, T-31 and T-32
 * integration halves; TASK-328).
 *
 * Every world is committed in its own country (countries are data: each test gets a fresh one,
 * so florist loads never leak between tests), every order is captured through spec 010's
 * `transition` (so its outbox rows are the real ones), and every job runs in a `system`
 * transaction of its own on its own connection of the scratch database, as in production. That
 * is what lets two routes race for one florist's last place (T-09) and an accept race a timeout
 * (T-16) for real.
 *
 * The clock is injected: daytime in Warsaw on a weekday, delivery the next day, so an offer has
 * the 60-minute window of §5.2 unless a test says otherwise.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SQL } from "drizzle-orm";

import { runTick, withBoss } from "../../src/jobs/runtime.ts";
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
  dispatchOutbox,
  type HandlerRegistry,
  type OrderExecutor,
  transition,
} from "../../src/modules/orders/index.ts";
import {
  createPgBossRoutingScheduler,
  createRoutingDeclineEffect,
  photoRemind,
  remindAssignment,
  routeOrder,
  ROUTING_WRITTEN_EVENTS,
  routingOutboxHandler,
  timeoutAssignment,
  watchRoutingSla,
  type JobNotifier,
  type RouteOutcome,
  type RoutingDeps,
  type RoutingJob,
  type RoutingTransaction,
} from "../../src/modules/orders/routing/jobs.ts";
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
import { runnerOf, sqlText } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const SKU = "FO-BQ-328";
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
  `spec 016 routing jobs on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let productId = "";
    const touched = new Set<string>();

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "routing");
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
              paid: quietAccept,
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
      touched.add(orderId);
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

    /* ---------------------------------------------------------------------- */
    /* T-01                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-01 (AC-1): live and test orders secured through the routing target get exactly one order.route run and one offer even when the outbox row is handled twice; a demo order gets no job and no offer", async () => {
      const w = await world();
      await florist(w, { status: "demo", payout: 12000 });
      await florist(w, { status: "active", payout: 12000 });
      const testOrder = await securedOrder(w, "test");
      const liveOrder = await securedOrder(w, "live");
      const demoOrder = await securedOrder(w, "demo");

      // The router's real scheduler, over the scratch database: pg-boss `short` queues.
      const schedule = createPgBossRoutingScheduler({
        connectionString: scratch.url,
      });
      const routing = routingOutboxHandler({ schedule });
      for (const orderId of [testOrder, liveOrder]) {
        expect(await outboxTargetsOf(orderId, "order.captured")).toContain(
          "routing",
        );
        for (let round = 0; round < 2; round += 1) {
          // The second round puts the same delivery back to `pending`: handled twice.
          await scratch.sql`
            UPDATE outbox_delivery d SET status = 'pending', attempts = 0
            FROM outbox x JOIN order_event e ON e.id = x.event_id
            WHERE d.outbox_id = x.id AND d.target = 'routing' AND e.order_id = ${orderId}`;
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
      // A demo order has no outbox row at all (spec 010 AC-20).
      expect(await outboxTargetsOf(demoOrder, "order.captured")).toEqual([]);

      const queued = await scratch.sql<{ key: string; n: number }[]>`
        SELECT singleton_key AS key, count(*)::int AS n FROM pgboss.job
        WHERE name = 'order.route' GROUP BY singleton_key ORDER BY singleton_key`;
      expect(queued).toEqual(
        [testOrder, liveOrder].sort().map((key) => ({ key, n: 1 })),
      );

      const ran: string[] = [];
      const counts = await withBoss(
        (boss) =>
          runTick(
            boss,
            {
              "order.route": async (payload) => {
                ran.push(payload.orderId);
                await routeOrder(payload.orderId, deps(NOW));
              },
            },
            { log: quiet() },
          ),
        { connectionString: scratch.url, log: quiet() },
      );
      expect(counts.completed).toBe(2);
      expect(ran.sort()).toEqual([testOrder, liveOrder].sort());

      for (const orderId of [testOrder, liveOrder]) {
        expect(await assignments(orderId)).toHaveLength(1);
        const routed = (await events(orderId)).filter((e) =>
          ["order.routed", "assignment.offered"].includes(e.type),
        );
        // Spec 016's router wrote them, not spec 010's `demoRoute` (`system:demo_router`).
        expect(routed.map((e) => [e.type, e.actor])).toEqual([
          ["order.routed", "system:order.route"],
          ["assignment.offered", "system:order.route"],
        ]);
      }
      // A second run of the job for an order already offered does nothing.
      expect(await routeOrder(testOrder, deps(NOW))).toEqual({
        kind: "skipped",
        reason: "offer_open",
      });
      // The demo order: no job, no offer; the router refuses it.
      expect(await routeOrder(demoOrder, deps(NOW))).toEqual({
        kind: "skipped",
        reason: "demo",
      });
      expect(await assignments(demoOrder)).toEqual([]);
      expect((await events(demoOrder)).map((e) => e.actor)).not.toContain(
        "system:demo_router",
      );
    }, 120_000);

    /* ---------------------------------------------------------------------- */
    /* T-05, T-06, T-08                                                       */
    /* ---------------------------------------------------------------------- */

    it("T-05 (AC-5): a first offer writes order.routed then assignment.offered in one transaction, one assignment at attempt 1 with its window, and queues V1 (and W) through the notifications target; the reminder and the timeout are enqueued", async () => {
      const w = await world();
      const cheap = await florist(w, {
        payout: 11000,
        members: 2,
        whatsapp: true,
      });
      await florist(w, { payout: 13000 });
      const orderId = await securedOrder(w, "test");
      const rec = recorder();

      const outcome = await offered(orderId, NOW, { schedule: rec.schedule });

      expect(outcome.partnerId).toBe(cheap.partnerId);
      expect(await status(orderId)).toBe("routed");
      const rows = await assignments(orderId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: outcome.assignmentId,
        partner_id: cheap.partnerId,
        attempt: 1,
        response: null,
      });
      expect(rows[0]?.offered_at.toISOString()).toBe(NOW.toISOString());
      expect(rows[0]?.sla_expires_at.toISOString()).toBe(at(60).toISOString());

      const written = (await events(orderId)).slice(-2);
      expect(
        written.map((e) => [e.type, e.actor, e.from_status, e.to_status]),
      ).toEqual([
        ["order.routed", "system:order.route", "paid_unrouted", "routed"],
        ["assignment.offered", "system:order.route", "routed", "routed"],
      ]);
      expect(written[0]?.tx).toBe(written[1]?.tx);
      expect(written[1]?.payload).toEqual({
        mode: "test",
        assignmentId: outcome.assignmentId,
        partnerId: cheap.partnerId,
        attempt: 1,
        answerWindowMinutes: 60,
      });
      // V1 to each member and W for a WhatsApp florist ride the notifications target.
      expect(await outboxTargetsOf(orderId, "assignment.offered")).toEqual([
        "notifications",
      ]);
      expect(
        notificationsFor("assignment.offered", "routed", "test").map(
          (r) => r.template,
        ),
      ).toEqual(expect.arrayContaining(["offer", "whatsapp-copy"]));

      expect(rec.jobs).toEqual([
        {
          name: "assignment.remind",
          assignmentId: outcome.assignmentId,
          startAfter: at(30),
        },
        {
          name: "assignment.timeout",
          assignmentId: outcome.assignmentId,
          startAfter: at(60),
        },
      ]);
    });

    it("T-06 and T-08 (AC-6, AC-8): a decline through spec 011's command enqueues order.route; one run offers the next florist with assignment.offered alone at attempt 2, the order stays routed, and the decliner gets no V4", async () => {
      const w = await world();
      const first = await florist(w, { payout: 11000 });
      const second = await florist(w, { payout: 12000 });
      const orderId = await securedOrder(w, "test");
      const offer = await offered(orderId);
      expect(offer.partnerId).toBe(first.partnerId);

      const rec = recorder();
      await answer(
        first,
        offer.assignmentId,
        { response: "decline", reason: "capacity" },
        at(5),
        rec.schedule,
      );
      expect(rec.jobs).toEqual([{ name: "order.route", orderId }]);
      const before = (await events(orderId)).length;

      const next = await offered(orderId, at(6));
      expect(next).toMatchObject({ partnerId: second.partnerId, attempt: 2 });
      expect(await status(orderId)).toBe("routed");
      const after = (await events(orderId)).slice(before - 1);
      expect(after.map((e) => e.type)).toEqual([
        "assignment.declined",
        "assignment.offered",
      ]);
      // No V4 for a decline: neither event has an `offer-withdrawn` row, and no timeout was written.
      for (const e of after) {
        expect(
          notificationsFor(e.type as never, e.from_status, "test").map(
            (r) => r.template,
          ),
        ).not.toContain("offer-withdrawn");
      }
      expect((await events(orderId)).map((e) => e.type)).not.toContain(
        "assignment.timed_out",
      );
    });

    /* ---------------------------------------------------------------------- */
    /* T-07                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-07 (AC-7): unanswered, V2 goes at half the window; at its end the answer is timeout, assignment.timed_out by system:assignment.timeout (V4 on the notifications target) and the next florist is offered; an answered or withdrawn offer makes both jobs no-ops", async () => {
      const w = await world();
      const first = await florist(w, { payout: 11000 });
      const second = await florist(w, { payout: 12000 });
      const orderId = await securedOrder(w, "test");
      const offer = await offered(orderId);

      const notify = vi.fn<JobNotifier>(() => Promise.resolve());
      expect(
        await remindAssignment(offer.assignmentId, { ...deps(at(30)), notify }),
      ).toEqual({
        kind: "reminded",
      });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0]?.[1]).toEqual({
        job: "assignment.remind",
        jobId: offer.assignmentId,
        orderId,
        assignmentId: offer.assignmentId,
      });

      // Not yet due: put back for its instant, nothing written.
      const early = recorder();
      expect(
        await timeoutAssignment(
          offer.assignmentId,
          deps(at(59), { schedule: early.schedule }),
        ),
      ).toEqual({ kind: "skipped", reason: "not_due" });
      expect(early.jobs).toEqual([
        {
          name: "assignment.timeout",
          assignmentId: offer.assignmentId,
          startAfter: at(60),
        },
      ]);

      const rec = recorder();
      expect(
        await timeoutAssignment(
          offer.assignmentId,
          deps(at(60), { schedule: rec.schedule }),
        ),
      ).toEqual({ kind: "timed_out", orderId });
      expect((await assignments(orderId))[0]?.response).toBe("timeout");
      const last = (await events(orderId)).at(-1);
      expect(last).toMatchObject({
        type: "assignment.timed_out",
        actor: "system:assignment.timeout",
        from_status: "routed",
        to_status: "routed",
        payload: {
          mode: "test",
          assignmentId: offer.assignmentId,
          partnerId: first.partnerId,
          attempt: 1,
        },
      });
      expect(await outboxTargetsOf(orderId, "assignment.timed_out")).toEqual([
        "notifications",
      ]);
      expect(
        notificationsFor("assignment.timed_out", "routed", "test").map(
          (r) => r.template,
        ),
      ).toContain("offer-withdrawn");
      expect(rec.jobs).toEqual([{ name: "order.route", orderId }]);
      const next = await offered(orderId, at(60));
      expect(next).toMatchObject({ partnerId: second.partnerId, attempt: 2 });

      // A timeout or a reminder on an answered offer writes and sends nothing.
      const eventsBefore = (await events(orderId)).length;
      expect(await timeoutAssignment(offer.assignmentId, deps(at(61)))).toEqual(
        {
          kind: "skipped",
          reason: "answered",
        },
      );
      expect(
        await remindAssignment(offer.assignmentId, { ...deps(at(61)), notify }),
      ).toEqual({
        kind: "skipped",
        reason: "answered",
      });
      await answer(second, next.assignmentId, { response: "accept" }, at(62));
      expect(await timeoutAssignment(next.assignmentId, deps(at(200)))).toEqual(
        {
          kind: "skipped",
          reason: "answered",
        },
      );
      expect((await events(orderId)).length).toBe(eventsBefore + 1);
      expect(notify).toHaveBeenCalledTimes(1);

      // A withdrawn offer: nothing either.
      const w2 = await world();
      await florist(w2, { payout: 11000 });
      const other = await securedOrder(w2, "test");
      const open = await offered(other);
      await scratch.sql`UPDATE order_assignment SET withdrawn_at = now(),
                        withdrawn_reason = 'order_cancelled' WHERE id = ${open.assignmentId}`;
      const count = (await events(other)).length;
      expect(await timeoutAssignment(open.assignmentId, deps(at(120)))).toEqual(
        {
          kind: "skipped",
          reason: "withdrawn",
        },
      );
      expect(
        await remindAssignment(open.assignmentId, { ...deps(at(30)), notify }),
      ).toEqual({
        kind: "skipped",
        reason: "withdrawn",
      });
      expect((await events(other)).length).toBe(count);
    });

    /* ---------------------------------------------------------------------- */
    /* T-09                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-09 (AC-9): two routes racing for a florist with one place left give it one offer and the next florist the other", async () => {
      const w = await world();
      const full = await florist(w, { payout: 10000, capacity: 1 });
      const next = await florist(w, { payout: 12000 });
      const one = await securedOrder(w, "test");
      const two = await securedOrder(w, "test");

      // Both routes have read the florists (load 0) before either takes the partner lock.
      let arrived = 0;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const racing: RoutingTransaction = <T>(
        fn: (executor: OrderExecutor) => Promise<T>,
      ) =>
        system((executor) =>
          fn({
            async execute(query: SQL) {
              if (
                /FROM fulfillment_partner WHERE id = .* FOR UPDATE/su.test(
                  sqlText(query),
                )
              ) {
                arrived += 1;
                if (arrived === 2) release();
                await Promise.race([
                  gate,
                  new Promise((r) => setTimeout(r, 5_000)),
                ]);
              }
              return executor.execute(query);
            },
          }),
        );
      const outcomes = await Promise.all(
        [one, two].map((orderId) =>
          routeOrder(orderId, deps(NOW, { transaction: racing })),
        ),
      );
      expect(arrived).toBeGreaterThanOrEqual(2);
      const partners = outcomes.map((o: RouteOutcome) =>
        o.kind === "offered" ? o.partnerId : o.kind,
      );
      expect(partners.sort()).toEqual([full.partnerId, next.partnerId].sort());
      const [load] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM order_assignment WHERE partner_id = ${full.partnerId}`;
      expect(load?.n).toBe(1);
    });

    /* ---------------------------------------------------------------------- */
    /* T-10                                                                   */
    /* ---------------------------------------------------------------------- */

    async function expectExhausted(
      orderId: string,
      outcome: RouteOutcome,
      reason: string,
      alert: ReturnType<typeof vi.fn>,
    ) {
      expect(outcome).toMatchObject({ kind: "exhausted", reason });
      expect(await status(orderId)).toBe("no_partner_available");
      const last = (await events(orderId)).at(-1);
      expect(last).toMatchObject({
        type: "order.no_partner_available",
        actor: "system:order.route",
        from_status: "routed",
      });
      // A1: the founder's email rides the notifications target; the Sentry tag is raised here.
      expect(
        await outboxTargetsOf(orderId, "order.no_partner_available"),
      ).toEqual(["notifications"]);
      expect(alert).toHaveBeenCalledWith("routing.no_partner", {
        order_id: orderId,
        reason,
      });
    }

    it("T-10 (AC-10): a routed order with no candidate left goes to no_partner_available with A1 and the Sentry alert", async () => {
      const w = await world();
      const only = await florist(w, { payout: 11000 });
      const orderId = await securedOrder(w, "test");
      const offer = await offered(orderId);
      await answer(
        only,
        offer.assignmentId,
        { response: "decline", reason: "closed" },
        at(1),
      );
      const d = deps(at(2));
      await expectExhausted(
        orderId,
        await routeOrder(orderId, d),
        "no_candidate",
        d.alert,
      );
    });

    it("T-10 (AC-10): five declines exhaust the order although a sixth florist could take it", async () => {
      const w = await world();
      const florists: Florist[] = [];
      for (let index = 0; index < 6; index += 1) {
        florists.push(await florist(w, { payout: 10000 + index * 100 }));
      }
      const orderId = await securedOrder(w, "test");
      for (let round = 0; round < 5; round += 1) {
        const offer = await offered(orderId, at(round * 2));
        const who = florists.find(
          (f) => f.partnerId === offer.partnerId,
        ) as Florist;
        await answer(
          who,
          offer.assignmentId,
          { response: "decline", reason: "other" },
          at(round * 2 + 1),
        );
      }
      expect(await assignments(orderId)).toHaveLength(5);
      const d = deps(at(11));
      await expectExhausted(
        orderId,
        await routeOrder(orderId, d),
        "max_offers",
        d.alert,
      );
    });

    it("T-10 (AC-10): a clock past the routing deadline (cutoff 14:00 + 2 h on the delivery day) exhausts the order", async () => {
      const w = await world();
      const first = await florist(w, { payout: 11000 });
      await florist(w, { payout: 12000 });
      // Due today: 11:00 Warsaw, same-day window of 30 minutes.
      const orderId = await securedOrder(w, "test", "2026-11-04");
      const offer = await offered(orderId);
      expect(offer.slaExpiresAt.toISOString()).toBe(at(30).toISOString());
      await answer(
        first,
        offer.assignmentId,
        { response: "decline", reason: "capacity" },
        at(1),
      );
      // 16:00 Warsaw is 15:00Z: the deadline itself leaves no window.
      const d = deps(new Date("2026-11-04T15:00:00Z"));
      await expectExhausted(
        orderId,
        await routeOrder(orderId, d),
        "deadline",
        d.alert,
      );
    });

    it("a night-secured order is deferred to 07:30 with nothing written, and a paid order with no florist at all goes to no_partner_available from paid_unrouted (spec 002 §14 A8)", async () => {
      const w = await world();
      await florist(w, { payout: 11000 });
      const orderId = await securedOrder(w, "test");
      const rec = recorder();
      // 23:00 Warsaw on 4 Nov (22:00Z): offered at 07:30 on 5 Nov (06:30Z).
      const night = await routeOrder(
        orderId,
        deps(new Date("2026-11-04T22:00:00Z"), { schedule: rec.schedule }),
      );
      expect(night).toEqual({
        kind: "deferred",
        offerAt: new Date("2026-11-05T06:30:00Z"),
      });
      expect(rec.jobs).toEqual([
        {
          name: "order.route",
          orderId,
          startAfter: new Date("2026-11-05T06:30:00Z"),
        },
      ]);
      expect(await status(orderId)).toBe("paid_unrouted");
      expect(await assignments(orderId)).toEqual([]);

      const empty = await world();
      const lonely = await securedOrder(empty, "test");
      const d = deps(NOW);
      expect(await routeOrder(lonely, d)).toMatchObject({
        kind: "exhausted",
        reason: "no_candidate",
      });
      expect((await events(lonely)).at(-1)).toMatchObject({
        type: "order.no_partner_available",
        from_status: "paid_unrouted",
        to_status: "no_partner_available",
        actor: "system:order.route",
      });
      expect(d.alert).toHaveBeenCalledWith("routing.no_partner", {
        order_id: lonely,
        reason: "no_candidate",
      });
    });

    /* ---------------------------------------------------------------------- */
    /* T-16                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-16 (AC-16): an accept and a timeout fired together on one assignment end with exactly one outcome and one event, 50 times", async () => {
      const w = await world();
      const f = await florist(w, { payout: 11000, capacity: 200 });
      const outcomes = { accept: 0, timeout: 0 };
      for (let run = 0; run < 50; run += 1) {
        const orderId = await securedOrder(w, "test");
        const offer = await offered(orderId);
        const results = await Promise.allSettled([
          answer(f, offer.assignmentId, { response: "accept" }, at(59)),
          timeoutAssignment(offer.assignmentId, deps(at(60))),
        ]);
        const answers = (await events(orderId)).filter((e) =>
          ["assignment.accepted", "assignment.timed_out"].includes(e.type),
        );
        expect(answers, `run ${String(run)}`).toHaveLength(1);
        const [row] = await assignments(orderId);
        if (answers[0]?.type === "assignment.accepted") {
          outcomes.accept += 1;
          expect(row?.response).toBe("accept");
          expect(results[1]).toMatchObject({
            status: "fulfilled",
            value: { kind: "skipped", reason: "answered" },
          });
        } else {
          outcomes.timeout += 1;
          expect(row?.response).toBe("timeout");
          expect(results[0]).toMatchObject({ status: "rejected" });
        }
      }
      expect(outcomes.accept + outcomes.timeout).toBe(50);
    }, 300_000);

    /* ---------------------------------------------------------------------- */
    /* T-17                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-17 (AC-17): order.delivered reaches the routing target, which schedules the photo reminder an hour later; delivered without a photo sends V5, a photo before then sends nothing", async () => {
      const w = await world();
      const f = await florist(w, { payout: 11000 });
      const notify = vi.fn<JobNotifier>(() => Promise.resolve());

      async function deliveredOrder(): Promise<{
        orderId: string;
        assignmentId: string;
      }> {
        const orderId = await securedOrder(w, "test");
        const offer = await offered(orderId);
        await answer(f, offer.assignmentId, { response: "accept" }, at(1));
        await scratch.sql.begin(async (tx: Tx) => {
          await walkOrderTo(tx, orderId, "out_for_delivery");
          await asApp(tx, { role: "system" });
          await transition(
            orderId,
            "order.delivered",
            `partner:${f.partnerId}`,
            { mode: "test", assignment_id: offer.assignmentId },
            { executor: runnerOf(tx) },
          );
        });
        return { orderId, assignmentId: offer.assignmentId };
      }

      const plain = await deliveredOrder();
      expect(await outboxTargetsOf(plain.orderId, "order.delivered")).toContain(
        "routing",
      );
      const rec = recorder();
      await dispatchOutbox({
        handlers: handlers(routingOutboxHandler({ schedule: rec.schedule })),
        transaction: system,
        orderId: plain.orderId,
        heldTargets: [],
        log: quiet(),
        alert: vi.fn(),
      });
      const [delivered] = await scratch.sql<{ occurred_at: Date }[]>`
        SELECT occurred_at FROM order_event WHERE order_id = ${plain.orderId}
          AND type = 'order.delivered'`;
      expect(rec.jobs).toEqual([
        {
          name: "assignment.photo_remind",
          orderId: plain.orderId,
          startAfter: new Date(
            (delivered?.occurred_at.getTime() ?? 0) + 60 * MINUTE,
          ),
        },
      ]);
      expect(
        await photoRemind(plain.orderId, { ...deps(at(120)), notify }),
      ).toEqual({
        kind: "reminded",
      });
      expect(notify.mock.calls.map((call) => call[1])).toEqual([
        {
          job: "assignment.photo_remind",
          jobId: plain.orderId,
          orderId: plain.orderId,
          assignmentId: plain.assignmentId,
        },
      ]);

      const photographed = await deliveredOrder();
      await scratch.sql.begin((tx: Tx) =>
        walkOrderTo(tx, photographed.orderId, "photo_uploaded"),
      );
      expect(
        await photoRemind(photographed.orderId, { ...deps(at(120)), notify }),
      ).toEqual({
        kind: "skipped",
        reason: "status",
      });
      expect(notify).toHaveBeenCalledTimes(1);
    });

    /* ---------------------------------------------------------------------- */
    /* T-31                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-31 (AC-31): with the timeout job not run, an offer 5 minutes past its window raises routing.sla_overdue, and not a minute before", async () => {
      const w = await world();
      await florist(w, { payout: 11000 });
      const orderId = await securedOrder(w, "test");
      const offer = await offered(orderId);
      const mine = (alert: ReturnType<typeof vi.fn>) =>
        alert.mock.calls.filter(
          (call) =>
            (call[1] as { assignment_id?: string }).assignment_id ===
            offer.assignmentId,
        );

      const early = deps(at(64));
      await watchRoutingSla(early);
      expect(mine(early.alert)).toEqual([]);

      const late = deps(at(65));
      await watchRoutingSla(late);
      expect(mine(late.alert)).toEqual([
        [
          "routing.sla_overdue",
          {
            order_id: orderId,
            assignment_id: offer.assignmentId,
            minutes_over: 5,
          },
        ],
      ]);
    });

    it("AC-32 breaker cases: the engine refuses an arrow label as an event and an actor class outside the row's allowed_actors, writing nothing", async () => {
      const w = await world();
      await florist(w, { payout: 11000 });
      const orderId = await securedOrder(w, "test");
      const offer = await offered(orderId);
      const before = (await events(orderId)).length;
      const codeOf = async (
        run: (executor: OrderExecutor) => Promise<unknown>,
      ) => {
        try {
          await system(run);
          return "written";
        } catch (error) {
          return (error as { code?: string }).code ?? "unknown";
        }
      };
      expect(
        await codeOf((executor) =>
          transition(
            orderId,
            "timeout" as never,
            "system:assignment.timeout",
            { mode: "test" },
            { executor },
          ),
        ),
      ).toBe("ORDER_EVENT_UNREGISTERED");
      const timedOut = {
        mode: "test",
        assignmentId: offer.assignmentId,
        partnerId: offer.partnerId,
        attempt: 1,
      };
      expect(
        await codeOf((executor) =>
          transition(orderId, "assignment.timed_out", "buyer", timedOut, {
            executor,
          }),
        ),
      ).toBe("ORDER_ACTOR_NOT_ALLOWED");
      expect(
        await codeOf((executor) =>
          transition(
            orderId,
            "order.no_partner_available",
            `partner:${offer.partnerId}`,
            { mode: "test" },
            { executor },
          ),
        ),
      ).toBe("ORDER_ACTOR_NOT_ALLOWED");
      expect((await events(orderId)).length).toBe(before);
    });

    /* ---------------------------------------------------------------------- */
    /* T-32                                                                   */
    /* ---------------------------------------------------------------------- */

    it("T-32 (AC-32): every event the router's system actors wrote in this suite is one of its catalogue names, each transition on an order_transition row that allows class system", async () => {
      const rows = await scratch.sql<
        {
          type: string;
          actor: string;
          from_status: string;
          to_status: string;
          allowed: boolean | null;
        }[]
      >`
        SELECT e.type, e.actor, e.from_status, e.to_status,
               (SELECT 'system' = ANY (t.allowed_actors) FROM order_transition t
                WHERE t.from_status = e.from_status AND t.event = e.type
                  AND t.to_status = e.to_status) AS allowed
        FROM order_event e
        WHERE e.order_id = ANY (${[...touched]}::uuid[])
          AND e.actor IN ('system:order.route', 'system:assignment.timeout')`;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(ROUTING_WRITTEN_EVENTS as readonly string[]).toContain(row.type);
        if (row.type !== "assignment.offered") {
          expect(row.allowed, `${row.type} from ${row.from_status}`).toBe(true);
        } else {
          expect(row.from_status).toBe(row.to_status);
        }
      }
      // `order.manual_reroute` is the founder's (`admin:{uuid}`, TASK-329), not a system actor's.
      expect(new Set(rows.map((row) => row.type))).toEqual(
        new Set(
          ROUTING_WRITTEN_EVENTS.filter(
            (type) => type !== "order.manual_reroute",
          ),
        ),
      );
    });
  },
);
