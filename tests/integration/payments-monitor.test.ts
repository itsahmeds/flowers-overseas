/**
 * Spec 013's two monitors against migrated tables (§11, §5.2 `payments.monitor`; AC-39, AC-40;
 * T-39, T-40; TASK-264).
 *
 * Every case runs in one transaction that is rolled back (`rolledBack`), so the monitor, which
 * reads every order, inbox row and payment of the database, sees exactly that case's rows. The
 * world is written as the owner; the monitor then reads as `app_web` in the `system` role, the
 * way `withSystemContext` runs it in production, so the RLS policies are part of the proof. The
 * clock is injected. Orders are secured with an explicit `order_event` instant (`applyTransition`,
 * `order_event` being append-only), and those fixture events write no outbox row, so no router
 * ever runs for them; one case captures through spec 010's engine and fails its `routing`
 * delivery by fault injection (a handler that throws) to show the same thing on the real path.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger.ts";
import {
  dispatchOutbox,
  type HandlerRegistry,
  outboxHandlers,
  transition,
} from "../../src/modules/orders/index.ts";
import {
  runPaymentsMonitor,
  type MonitorAlert,
  type PaymentsMonitorDeps,
} from "../../src/modules/payments/index.ts";
import { applyTransition, insertPlacedOrder } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const plus = (instant: Date, ms: number): Date =>
  new Date(instant.getTime() + ms);

/** 10:00 Warsaw (CET) on Wednesday 4 Nov 2026. */
const TEN = new Date("2026-11-04T09:00:00Z");
/** 23:00 Warsaw the same evening; its first offer is due at 07:30 (06:30Z) on 5 Nov. */
const ELEVEN_PM = new Date("2026-11-04T22:00:00Z");
const SEVEN_THIRTY = new Date("2026-11-05T06:30:00Z");

const quiet = () => createLogger({ level: "fatal", write: () => undefined });

interface Raised {
  readonly alert: string;
  readonly orderId: string | undefined;
  readonly fingerprint: readonly string[];
}

describe.skipIf(server.url === undefined)(
  `spec 013 payments.monitor on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "paymon");
      await scratch.sql.begin(async (tx) => {
        await make.base(tx);
      });
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    /** A destination with agreed operations: Warsaw, same-day cutoff 14:00, one city. */
    async function world(
      tx: Tx,
    ): Promise<{ countryId: string; cityId: string }> {
      const [country] = await tx<{ id: string }[]>`
        INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone, same_day_cutoff_local)
        VALUES ('XM', 'PLN', 800, 'Europe/Warsaw', '14:00') RETURNING id`;
      const countryId = country?.id ?? "";
      const [city] = await tx<{ id: string }[]>`
        INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`;
      return { countryId, cityId: city?.id ?? "" };
    }

    /** A `placed` order to `w` for `deliveryDate`, in `mode`. */
    async function placed(
      tx: Tx,
      w: { countryId: string; cityId: string },
      mode: "demo" | "test" | "live",
      deliveryDate: string,
    ): Promise<string> {
      const customerId = await make.customer(tx);
      const recipientId = await make.recipient(tx, customerId);
      const id = await insertPlacedOrder(tx, {
        customerId,
        recipientId,
        countryId: w.countryId,
        mode,
      });
      await tx`UPDATE "order" SET destination_city_id = ${w.cityId},
               delivery_date = ${deliveryDate} WHERE id = ${id}`;
      return id;
    }

    /** A `placed` order secured (row 2, `paid_unrouted`) at `securedAt`. */
    async function secured(
      tx: Tx,
      w: { countryId: string; cityId: string },
      securedAt: Date,
      options: { mode?: "demo" | "test" | "live"; deliveryDate?: string } = {},
    ): Promise<string> {
      const id = await placed(
        tx,
        w,
        options.mode ?? "test",
        options.deliveryDate ?? "2026-11-05",
      );
      await applyTransition(
        tx,
        id,
        "order.captured",
        "paid_unrouted",
        securedAt,
      );
      return id;
    }

    /** The monitor's seams over `tx`, as the `system` role, recording every alert. */
    function seams(
      tx: Tx,
      over: Partial<PaymentsMonitorDeps> = {},
    ): { deps: (now: Date) => PaymentsMonitorDeps; raised: Raised[] } {
      const raised: Raised[] = [];
      const alert: MonitorAlert = (name, fields, options) => {
        raised.push({
          alert: name,
          orderId: fields.order_id,
          fingerprint: options.fingerprint,
        });
      };
      return {
        raised,
        deps: (now) => ({
          transaction: (fn) => fn(runnerOf(tx)),
          now: () => now,
          alert,
          log: quiet(),
          livemode: false,
          ...over,
        }),
      };
    }

    const paidNotRouted = (raised: readonly Raised[]) =>
      raised
        .filter((entry) => entry.alert === "payment.paid_not_routed")
        .map((entry) => entry.orderId);

    /* ---------------------------------------------------------------------- */
    /* T-39 (AC-39)                                                           */
    /* ---------------------------------------------------------------------- */

    it("T-39: alert only for the 10:00 order at 10:05:01 and the 23:00 order after 07:35; routed, no-partner, demo and routed-at-10:04:59 orders never; two ticks, one fingerprint", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const day = await secured(tx, w, TEN);
        const night = await secured(tx, w, ELEVEN_PM, {
          deliveryDate: "2026-11-06",
        });
        const routed = await secured(tx, w, TEN);
        await applyTransition(
          tx,
          routed,
          "order.routed",
          "routed",
          plus(TEN, 2 * MINUTE),
        );
        const routedLate = await secured(tx, w, TEN);
        await applyTransition(
          tx,
          routedLate,
          "order.routed",
          "routed",
          plus(TEN, 4 * MINUTE + 59 * SECOND),
        );
        const noPartner = await secured(tx, w, TEN);
        await applyTransition(
          tx,
          noPartner,
          "order.no_partner_available",
          "no_partner_available",
          plus(TEN, MINUTE),
        );
        const demo = await secured(tx, w, TEN, { mode: "demo" });
        const live = await secured(tx, w, plus(TEN, 2 * MINUTE), {
          mode: "live",
        });
        await asApp(tx, { role: "system" });
        const { deps, raised } = seams(tx);

        const tick = async (now: Date) => {
          const before = raised.length;
          await runPaymentsMonitor(deps(now));
          return paidNotRouted(raised.slice(before));
        };

        expect(await tick(plus(TEN, 5 * MINUTE))).toEqual([]);
        expect(await tick(plus(TEN, 5 * MINUTE + SECOND))).toEqual([day]);
        // The second tick the same minute: the same order, the same fingerprint (one issue).
        expect(await tick(plus(TEN, 5 * MINUTE + SECOND))).toEqual([day]);
        const fingerprints = new Set(
          raised.map((entry) => entry.fingerprint.join("|")),
        );
        expect([...fingerprints]).toEqual([`payment.paid_not_routed|${day}`]);
        // The live order secured at 10:02 follows its own clock.
        expect(await tick(plus(TEN, 7 * MINUTE))).toEqual([day]);
        expect(await tick(plus(TEN, 7 * MINUTE + SECOND))).toEqual([day, live]);
        // The 23:00 order: nothing five minutes later, nothing at 07:35:00, the alert at 07:35:01.
        expect(await tick(plus(ELEVEN_PM, 5 * MINUTE + SECOND))).toEqual([
          day,
          live,
        ]);
        expect(await tick(plus(SEVEN_THIRTY, 5 * MINUTE))).toEqual([day, live]);
        expect(await tick(plus(SEVEN_THIRTY, 5 * MINUTE + SECOND))).toEqual([
          day,
          live,
          night,
        ]);
        for (const id of [routed, routedLate, noPartner, demo]) {
          expect(raised.map((entry) => entry.orderId)).not.toContain(id);
        }
      });
    });

    it("T-39 on the DST night: an order secured at 23:00 CEST on 24 Oct is expected at 07:30 CET (06:30Z), not an hour earlier", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const id = await secured(tx, w, new Date("2026-10-24T21:00:00Z"), {
          deliveryDate: "2026-10-26",
        });
        await asApp(tx, { role: "system" });
        const { deps, raised } = seams(tx);
        await runPaymentsMonitor(deps(new Date("2026-10-25T05:35:01Z")));
        await runPaymentsMonitor(deps(new Date("2026-10-25T06:35:00Z")));
        expect(paidNotRouted(raised)).toEqual([]);
        await runPaymentsMonitor(deps(new Date("2026-10-25T06:35:01Z")));
        expect(paidNotRouted(raised)).toEqual([id]);
      });
    });

    it("T-39 with the router disabled by fault injection: an order captured through the engine, its routing delivery failing, is alerted 5:01 after it was secured", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const id = await placed(tx, w, "test", "2026-11-05");
        await asApp(tx, { role: "system" });
        await transition(
          id,
          "order.captured",
          "system:payments",
          { mode: "test", provider_call: true },
          { executor: runnerOf(tx) },
        );
        // Every other target succeeds; the router throws.
        const failedTargets: string[] = [];
        const handlers = Object.fromEntries(
          Object.keys(outboxHandlers()).map((target) => [
            target,
            target === "routing"
              ? () => {
                  failedTargets.push(target);
                  return Promise.reject(
                    new Error("fault injected: router down"),
                  );
                }
              : () => Promise.resolve(),
          ]),
        ) as unknown as HandlerRegistry;
        const counts = await dispatchOutbox({
          handlers,
          transaction: (fn) => fn(runnerOf(tx)),
          retryBaseSeconds: 60,
          heldTargets: [],
          alert: () => undefined,
          log: quiet(),
          orderId: id,
        });
        expect(failedTargets).toEqual(["routing"]);
        expect(counts.failed).toBe(1);
        const [row] = await tx<{ status: string; secured_at: Date }[]>`
          SELECT o.status, e.occurred_at AS secured_at
          FROM "order" o JOIN order_event e ON e.order_id = o.id AND e.type = 'order.captured'
          WHERE o.id = ${id}`;
        expect(row?.status).toBe("paid_unrouted");
        const securedAt = row?.secured_at ?? new Date(0);
        const { deps, raised } = seams(tx, {
          // Daytime in Warsaw is not guaranteed for the real clock; this case is about the
          // router, so the first offer is due at once (AC-39's default).
          firstOfferAt: (order) => order.securedAt,
        });
        await runPaymentsMonitor(deps(plus(securedAt, 5 * MINUTE)));
        expect(paidNotRouted(raised)).toEqual([]);
        await runPaymentsMonitor(deps(plus(securedAt, 5 * MINUTE + SECOND)));
        expect(paidNotRouted(raised)).toEqual([id]);
      });
    });

    /* ---------------------------------------------------------------------- */
    /* T-40 (AC-40)                                                           */
    /* ---------------------------------------------------------------------- */

    const NOW = new Date("2026-11-04T12:00:00Z");

    interface Silence {
      readonly stripe: "on" | "off";
      /** Inbox rows: their age and their `livemode`. */
      readonly rows: readonly {
        readonly ago: number;
        readonly livemode: boolean;
      }[];
      /** The age of the one payment with a `provider_ref`, or null for none. */
      readonly paymentAgo: number | null;
    }

    async function silenceAlerts(fixture: Silence): Promise<readonly Raised[]> {
      return rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        if (fixture.stripe === "on") {
          await tx`INSERT INTO feature_flag_scope (flag_key, scope, scope_ref, enabled)
                   VALUES ('payments.stripe', 'global', '*', true)`;
        }
        for (const row of fixture.rows) {
          await tx`
            INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode,
                                       event_type, received_at)
            VALUES ('stripe', ${`evt_${randomUUID()}`}, true, '{}'::jsonb, ${row.livemode},
                    'payment_intent.succeeded', ${plus(NOW, -row.ago).toISOString()}::timestamptz)`;
        }
        if (fixture.paymentAgo !== null) {
          const orderId = await placed(tx, w, "test", "2026-11-05");
          await tx`
            INSERT INTO payment (purchase_id, provider, provider_ref, status, method, amount_minor,
                                 currency_code, livemode, created_at)
            SELECT o.purchase_id, 'stripe', ${`pi_${randomUUID()}`}, 'pending', 'card', 18900,
                   'PLN', false, ${plus(NOW, -fixture.paymentAgo).toISOString()}::timestamptz
            FROM "order" o WHERE o.id = ${orderId}`;
        }
        await asApp(tx, { role: "system" });
        const { deps, raised } = seams(tx);
        await runPaymentsMonitor(deps(NOW));
        return raised.filter((entry) => entry.alert === "webhook.silent_24h");
      });
    }

    it("T-40: last row 25 h ago and a payment 3 days ago -> alert, fingerprinted by the alert alone", async () => {
      const raised = await silenceAlerts({
        stripe: "on",
        rows: [{ ago: 25 * HOUR, livemode: false }],
        paymentAgo: 3 * DAY,
      });
      expect(raised).toEqual([
        {
          alert: "webhook.silent_24h",
          orderId: undefined,
          fingerprint: ["webhook.silent_24h"],
        },
      ]);
    });

    it("T-40: last row 23 h ago -> none", async () => {
      expect(
        await silenceAlerts({
          stripe: "on",
          rows: [
            { ago: 25 * HOUR, livemode: false },
            { ago: 23 * HOUR, livemode: false },
          ],
          paymentAgo: 3 * DAY,
        }),
      ).toEqual([]);
    });

    it("T-40: payments.stripe off (its seeded default) -> none", async () => {
      expect(
        await silenceAlerts({
          stripe: "off",
          rows: [{ ago: 25 * HOUR, livemode: false }],
          paymentAgo: 3 * DAY,
        }),
      ).toEqual([]);
    });

    it("T-40: no payment in 7 days -> none (8 days ago, and none at all)", async () => {
      expect(
        await silenceAlerts({
          stripe: "on",
          rows: [{ ago: 25 * HOUR, livemode: false }],
          paymentAgo: 8 * DAY,
        }),
      ).toEqual([]);
      expect(
        await silenceAlerts({
          stripe: "on",
          rows: [{ ago: 25 * HOUR, livemode: false }],
          paymentAgo: null,
        }),
      ).toEqual([]);
    });

    it("T-40: a site quiet for 6 days still alerts; one quiet for 7 days and a second does not", async () => {
      expect(
        await silenceAlerts({
          stripe: "on",
          rows: [],
          paymentAgo: 6 * DAY,
        }),
      ).toHaveLength(1);
      expect(
        await silenceAlerts({
          stripe: "on",
          rows: [],
          paymentAgo: 7 * DAY + SECOND,
        }),
      ).toEqual([]);
    });

    it("T-40: only a row of the other livemode (1 h ago) counts as none received -> alert", async () => {
      expect(
        await silenceAlerts({
          stripe: "on",
          rows: [
            { ago: 30 * HOUR, livemode: false },
            { ago: HOUR, livemode: true },
          ],
          paymentAgo: 3 * DAY,
        }),
      ).toHaveLength(1);
    });
  },
);
