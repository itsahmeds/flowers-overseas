/**
 * Spec 030b task 1 on migrated PG16 scratch databases, never the shared database (§10 T-04, T-06
 * to T-10, T-32, T-33; AC-4, AC-6 to AC-10, AC-32, AC-33; TASK-439):
 *
 *  - T-06 (AC-6): a live 3-order EUR purchase's `payment_intent.succeeded` through
 *    `webhook.process` asks for exactly one `payments.balance_fetch`; the fetch writes one `charge`
 *    row 6000 / 115 / 5885 EUR with no rate; the GBP purchase writes presentment 4590 GBP, 5302 /
 *    158 / 5144 EUR, `1.15512` and 1155120 ppm; a second run and a replayed webhook leave one row;
 *  - T-07 (AC-7): a refund row with its `refund_id` and a negative amount, a dispute row with its
 *    `dispute_id`, and `platform_fee` stored as `other` with one alert for two such facts;
 *  - T-09 (AC-9): `BALANCE_TXN_IMMUTABLE` on UPDATE and DELETE; the three refused inserts;
 *  - T-10 (AC-10): an empty list writes nothing and reschedules; the sweep at +61 minutes asks for
 *    the one payment without a row; `payments.fees_missing` once at 24 h 1 min, not on the next
 *    run; with the flag off no provider call, and the work runs once it is on;
 *  - T-04 (AC-4): RLS on the three tables and the two views under `partner` (own id),
 *    `customer`, `public`, `admin` and `system`;
 *  - T-32 (AC-32): `offboarded_at` set once; the guarded down file per row kind; the clean round
 *    trip back to the pre-030b catalogue (with `audit_mask_columns()`'s previous body);
 *  - T-33 (AC-33): the retention sweep at 24 months and 1 day, and at 23 months and 29 days.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import type { OrderExecutor } from "@/modules/orders";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  runBalanceBackfill,
  runBalanceFetch,
  runBalanceSweep,
  type BalanceFetchJob,
  type BalanceFetchJobInput,
} from "@/modules/payments/balance";
import {
  startPayment,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";
import {
  ingestWebhook,
  processWebhook,
  type ProcessDeps,
} from "@/modules/payments/webhooks";

import { runRetentionSweep } from "../../src/jobs/retention.ts";
import { readCatalogue } from "../../scripts/db-check-live.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import { runnerOf } from "./support/sql-runner.ts";
import {
  MIGRATE_LOCK,
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const MIGRATIONS = resolve(import.meta.dirname, "../../db/migrations");
const FORWARD = readdirSync(MIGRATIONS)
  .filter(
    (name) => /^\d{4}_.+\.sql$/u.test(name) && !name.endsWith(".down.sql"),
  )
  .sort();
const MINE =
  FORWARD.find((name) => name.endsWith("_finance_crm_030b.sql")) ?? "";
const MY_VERSION = MINE.slice(0, 4);
const BEFORE = FORWARD[FORWARD.indexOf(MINE) - 1]?.slice(0, 4) ?? "";

const T0 = new Date("2026-10-21T08:00:00.000Z");
const HOUR = 3_600_000;

const METHODS_ON: MethodSources = {
  enabledFlags: new Set(["payments.method.card"]),
  registry: PAYMENT_METHODS.map((method) => ({
    ...method,
    available: method.id !== "blik",
    ...(method.id === "blik" ? {} : { processor: "stripe" as const }),
  })),
};

interface Alert {
  readonly alert: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

let fakes = 0;

/** A florist's status changes only in admin (`status_flip_guard`): flip it as admin, audited. */
async function flipStatus(
  tx: Tx,
  partnerId: string,
  status: string,
  extra = "",
): Promise<void> {
  await tx`SELECT set_config('app.role', 'admin', true), set_config('app.audit_action', 'partner.status', true)`;
  await tx.unsafe(
    `UPDATE fulfillment_partner SET status = $1${extra} WHERE id = $2`,
    [status, partnerId],
  );
  await tx`SELECT set_config('app.role', '', true), set_config('app.audit_action', '', true)`;
}

describe.skipIf(server.url === undefined)(
  `spec 030b balance facts, CRM tables and retention${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let adminId: string;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "fin439");
      adminId =
        (
          await scratch.sql<{ id: string }[]>`
          INSERT INTO users (email) VALUES (${`${make.unique("founder")}@example.test`}) RETURNING id`
        )[0]?.id ?? "";
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    function newFake(
      livemode = true,
      now: () => Date = () => T0,
    ): FakePaymentProvider {
      fakes += 1;
      return new FakePaymentProvider({
        now,
        livemode,
        namespace: `fin${String(fakes)}`,
      });
    }

    function lifecycleOf(fake: FakePaymentProvider): LifecycleDeps {
      return {
        provider: fake,
        transaction: transactionOf(),
        now: () => T0,
        alert: () => undefined,
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    /** A committed purchase of `totals` in `currency`, its payment started on `fake`. */
    async function started(
      fake: FakePaymentProvider,
      totals: readonly number[],
      currency: "EUR" | "GBP" | "PLN",
      mode: "live" | "test" = "live",
    ) {
      const orderIds = await scratch.sql.begin(async (tx) => {
        await make.base(tx);
        const customerId = await make.customer(tx);
        const recipientId = await make.recipient(tx, customerId);
        const total = totals.reduce((a, b) => a + b, 0);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES (${mode}, ${currency}, ${total}, 'en', ${customerId}) RETURNING id`;
        const countryId = await make.country(tx, "PL");
        const ids: string[] = [];
        for (const totalMinor of totals) {
          const orderId = await insertPlacedOrder(tx, {
            customerId,
            recipientId,
            countryId,
            mode,
            totalMinor,
            currencyCode: currency,
            purchaseId: row?.id ?? "",
          });
          await tx`UPDATE "order"
                   SET buyer_snapshot = '{"name": "Test Buyer", "countryIso2": "GB"}'::jsonb
                   WHERE id = ${orderId}`;
          ids.push(orderId);
        }
        return ids;
      });
      const [order] = await scratch.sql<{ purchase_id: string }[]>`
        SELECT purchase_id FROM "order" WHERE id = ${orderIds[0] ?? ""}`;
      const result = await startPayment(
        order?.purchase_id ?? "",
        lifecycleOf(fake),
      );
      if (result.kind !== "started") throw new Error(result.kind);
      return {
        orderIds,
        paymentId: result.paymentId,
        intentRef: result.intentRef,
      };
    }

    /** Pays `intentRef` on the fake and runs its `payment_intent.succeeded` through the inbox. */
    async function paidThroughWebhook(
      fake: FakePaymentProvider,
      intentRef: string,
      jobs: BalanceFetchJobInput[],
    ): Promise<{
      rawBody: string;
      headers: Record<string, string | undefined>;
    }> {
      await fake.simulateSuccess(intentRef);
      const event = await fake.simulateEvent(
        "payment_intent.succeeded",
        intentRef,
        T0,
      );
      const rawBody = fake.eventBodyOf(event);
      const { headers } = fake.sign(rawBody, T0);
      const inboxIds: string[] = [];
      await ingestWebhook(rawBody, headers, {
        provider: fake,
        livemode: fake.livemode,
        transaction: transactionOf(),
        now: () => T0,
        enqueue: (id) => {
          inboxIds.push(id);
          return Promise.resolve();
        },
      });
      for (const id of inboxIds) {
        await processWebhook(id, processOf(fake, jobs));
      }
      return { rawBody, headers: { ...headers } };
    }

    function processOf(
      fake: FakePaymentProvider,
      jobs: BalanceFetchJobInput[],
    ): ProcessDeps {
      return {
        provider: fake,
        transaction: transactionOf(),
        now: () => T0,
        alert: () => undefined,
        lifecycle: {
          transaction: transactionOf(),
          methodSources: () => Promise.resolve(METHODS_ON),
        },
        enqueueBalanceFetch: (job) => {
          jobs.push(job);
          return Promise.resolve();
        },
      };
    }

    function fetchDeps(
      fake: FakePaymentProvider,
      options: {
        alerts?: Alert[];
        rescheduled?: { job: BalanceFetchJob; startAfter: Date }[];
        flag?: () => boolean;
        now?: () => Date;
      } = {},
    ) {
      return {
        provider: () => fake,
        transaction: transactionOf(),
        now: options.now ?? (() => T0),
        log: quiet,
        alert: (alert: string, fields: Readonly<Record<string, unknown>>) => {
          options.alerts?.push({ alert, fields });
        },
        flagOn: () => Promise.resolve(options.flag?.() ?? true),
        reschedule: (job: BalanceFetchJob, startAfter: Date) => {
          options.rescheduled?.push({ job, startAfter });
          return Promise.resolve();
        },
      };
    }

    async function balanceRows(paymentId: string) {
      return scratch.sql<
        {
          kind: string;
          refund_id: string | null;
          dispute_id: string | null;
          reporting_category: string;
          presentment_amount_minor: string | null;
          presentment_currency_code: string | null;
          amount_minor: string;
          fee_minor: string;
          net_minor: string;
          settlement_currency_code: string;
          effective_rate_ppm: string | null;
          provider_exchange_rate: string | null;
          livemode: boolean;
        }[]
      >`SELECT kind, refund_id, dispute_id, reporting_category,
               presentment_amount_minor::text, presentment_currency_code,
               amount_minor::text, fee_minor::text, net_minor::text, settlement_currency_code,
               effective_rate_ppm::text, provider_exchange_rate, livemode
        FROM payment_balance_txn WHERE payment_id = ${paymentId}
        ORDER BY fetched_at, provider_txn_ref`;
    }

    /* -------------------------------------------------------------------- */

    it("T-06 (AC-6): one fetch asked after commit; the EUR charge row is exact; a re-run and a replay leave one row", async () => {
      const fake = newFake();
      const paid = await started(fake, [3000, 2000, 1000], "EUR");
      const jobs: BalanceFetchJobInput[] = [];
      const delivered = await paidThroughWebhook(fake, paid.intentRef, jobs);
      expect(jobs).toEqual([
        {
          paymentId: paid.paymentId,
          source: { kind: "intent", ref: paid.intentRef },
        },
      ]);
      const [job] = jobs;
      expect(
        await runBalanceFetch(job ?? jobs[0] ?? ({} as never), fetchDeps(fake)),
      ).toEqual({
        kind: "recorded",
        inserted: 1,
      });
      const expected = [
        {
          kind: "charge",
          refund_id: null,
          dispute_id: null,
          reporting_category: "charge",
          presentment_amount_minor: "6000",
          presentment_currency_code: "EUR",
          amount_minor: "6000",
          fee_minor: "115",
          net_minor: "5885",
          settlement_currency_code: "EUR",
          effective_rate_ppm: null,
          provider_exchange_rate: null,
          livemode: true,
        },
      ];
      expect(await balanceRows(paid.paymentId)).toEqual(expected);

      // Again: the job, and the same webhook delivered twice more.
      expect(
        await runBalanceFetch(job ?? ({} as never), fetchDeps(fake)),
      ).toEqual({
        kind: "recorded",
        inserted: 0,
      });
      const replayIds: string[] = [];
      const replay = await ingestWebhook(delivered.rawBody, delivered.headers, {
        provider: fake,
        livemode: true,
        transaction: transactionOf(),
        now: () => T0,
        enqueue: (id) => {
          replayIds.push(id);
          return Promise.resolve();
        },
      });
      expect(replay).toMatchObject({ status: 200 });
      for (const id of replayIds)
        await processWebhook(id, processOf(fake, jobs));
      expect(await balanceRows(paid.paymentId)).toEqual(expected);
    });

    it("T-06 (AC-6): the GBP charge keeps presentment 4590 GBP, settles 5302, fee 158, net 5144, rate 1.15512, 1155120 ppm", async () => {
      const fake = newFake();
      const paid = await started(fake, [4590], "GBP");
      const jobs: BalanceFetchJobInput[] = [];
      await paidThroughWebhook(fake, paid.intentRef, jobs);
      expect(jobs).toHaveLength(1);
      await runBalanceFetch(jobs[0] ?? ({} as never), fetchDeps(fake));
      expect(await balanceRows(paid.paymentId)).toEqual([
        {
          kind: "charge",
          refund_id: null,
          dispute_id: null,
          reporting_category: "charge",
          presentment_amount_minor: "4590",
          presentment_currency_code: "GBP",
          amount_minor: "5302",
          fee_minor: "158",
          net_minor: "5144",
          settlement_currency_code: "EUR",
          effective_rate_ppm: "1155120",
          provider_exchange_rate: "1.15512",
          livemode: true,
        },
      ]);
    });

    it("T-07 (AC-7): a refund row with its refund_id, a dispute row with its dispute_id; platform_fee is `other` with one alert", async () => {
      const fake = newFake();
      const paid = await started(fake, [5000], "EUR");
      await fake.simulateSuccess(paid.intentRef);
      await scratch.sql`UPDATE payment SET status = 'captured', captured_at = ${T0.toISOString()},
                        amount_captured_minor = amount_minor, method = 'card'
                        WHERE id = ${paid.paymentId}`;
      const alerts: Alert[] = [];
      await runBalanceFetch(
        {
          paymentId: paid.paymentId,
          source: { kind: "intent", ref: paid.intentRef },
        },
        fetchDeps(fake, { alerts }),
      );

      const remote = await fake.refund(
        paid.intentRef,
        { amountMinor: 1000, currency: "EUR" },
        "refund-439-1",
        {
          orderId: paid.orderIds[0] ?? "",
          refundId: "00000000-0000-4000-8000-000000000439",
          reason: "goodwill",
        },
      );
      if ("kind" in remote) throw new Error("refund failed");
      const [purchase] = await scratch.sql<{ purchase_id: string }[]>`
        SELECT purchase_id FROM payment WHERE id = ${paid.paymentId}`;
      const [refundRow] = await scratch.sql<{ id: string }[]>`
        INSERT INTO refund (payment_id, provider_ref, amount_minor, currency_code, reason, status,
                            requested_by, succeeded_at, order_id, purchase_id)
        VALUES (${paid.paymentId}, ${remote.ref}, 1000, 'EUR', 'goodwill', 'succeeded', 'admin',
                ${T0.toISOString()}, ${paid.orderIds[0] ?? ""}, ${purchase?.purchase_id ?? ""})
        RETURNING id`;
      await runBalanceFetch(
        {
          paymentId: paid.paymentId,
          source: { kind: "refund", ref: remote.ref },
        },
        fetchDeps(fake, { alerts }),
      );

      const disputeRef = await fake.simulateDispute(
        paid.intentRef,
        "fraudulent",
      );
      const [disputeRow] = await scratch.sql<{ id: string }[]>`
        INSERT INTO payment_dispute (payment_id, currency_code, provider_ref, amount_minor, reason,
                                     status, opened_at)
        VALUES (${paid.paymentId}, 'EUR', ${disputeRef}, 5000, 'fraudulent', 'open', ${T0.toISOString()})
        RETURNING id`;
      await runBalanceFetch(
        {
          paymentId: paid.paymentId,
          source: { kind: "dispute", ref: disputeRef },
        },
        fetchDeps(fake, { alerts }),
      );

      const charge = await fake.chargeRefOf(paid.intentRef);
      await fake.simulateBalanceFact(charge, "pf1", "platform_fee", -50);
      await fake.simulateBalanceFact(charge, "pf2", "platform_fee", -70);
      await runBalanceFetch(
        {
          paymentId: paid.paymentId,
          source: { kind: "intent", ref: paid.intentRef },
        },
        fetchDeps(fake, { alerts }),
      );

      const rows = await balanceRows(paid.paymentId);
      expect(
        rows.map((row) => [
          row.kind,
          row.reporting_category,
          row.amount_minor,
          row.refund_id,
          row.dispute_id,
        ]),
      ).toEqual([
        ["charge", "charge", "5000", null, null],
        ["refund", "refund", "-1000", refundRow?.id, null],
        ["dispute", "dispute", "-5000", null, disputeRow?.id],
        ["other", "platform_fee", "-50", null, null],
        ["other", "platform_fee", "-70", null, null],
      ]);
      expect(alerts).toEqual([
        {
          alert: "payments.balance_unknown_category",
          fields: {
            payment_id: paid.paymentId,
            reporting_category: "platform_fee",
          },
        },
      ]);
    });

    it("T-09 (AC-9): UPDATE and DELETE raise BALANCE_TXN_IMMUTABLE; a bad net, a refund without refund_id and a lone presentment amount are refused", async () => {
      const fake = newFake();
      const paid = await started(fake, [2500], "EUR");
      await fake.simulateSuccess(paid.intentRef);
      await runBalanceFetch(
        {
          paymentId: paid.paymentId,
          source: { kind: "intent", ref: paid.intentRef },
        },
        fetchDeps(fake),
      );
      await rolledBack(scratch.sql, async (tx) => {
        expect(
          (
            await pgFailure(
              tx,
              (sp) =>
                sp`UPDATE payment_balance_txn SET fee_minor = 0 WHERE payment_id = ${paid.paymentId}`,
            )
          ).raised,
        ).toBe("BALANCE_TXN_IMMUTABLE");
        expect(
          (
            await pgFailure(
              tx,
              (sp) =>
                sp`DELETE FROM payment_balance_txn WHERE payment_id = ${paid.paymentId}`,
            )
          ).raised,
        ).toBe("BALANCE_TXN_IMMUTABLE");
        const insert = (
          sp: Tx,
          values: {
            kind?: string;
            net?: number;
            presentment?: number | null;
            ref: string;
          },
        ) =>
          sp`INSERT INTO payment_balance_txn (payment_id, kind, provider, provider_txn_ref, source_ref,
                provider_type, reporting_category, presentment_amount_minor, amount_minor, fee_minor,
                net_minor, settlement_currency_code, provider_created_at, livemode)
             VALUES (${paid.paymentId}, ${values.kind ?? "charge"}, 'stripe', ${values.ref}, 'ch_x',
                     'charge', 'charge', ${values.presentment ?? null}, 1000, 30, ${values.net ?? 970},
                     'EUR', now(), false)`;
        expect(
          (
            await pgFailure(tx, (sp) =>
              insert(sp, { net: 971, ref: "txn_bad_net" }),
            )
          ).constraint,
        ).toBe("payment_balance_txn_net_check");
        expect(
          (
            await pgFailure(tx, (sp) =>
              insert(sp, { kind: "refund", ref: "txn_no_refund" }),
            )
          ).constraint,
        ).toBe("payment_balance_txn_refund_check");
        expect(
          (
            await pgFailure(tx, (sp) =>
              insert(sp, { presentment: 900, ref: "txn_lone" }),
            )
          ).constraint,
        ).toBe("payment_balance_txn_presentment_pair_check");
      });
    });

    it("T-10 (AC-10): an empty list writes nothing and reschedules; the flag off asks nothing and the work runs once on", async () => {
      const fake = newFake();
      const paid = await started(fake, [3300], "EUR");
      await fake.simulateSuccess(paid.intentRef);
      const charge = await fake.chargeRefOf(paid.intentRef);
      await fake.simulateBalancePending(charge, true);
      const rescheduled: { job: BalanceFetchJob; startAfter: Date }[] = [];
      const job = {
        paymentId: paid.paymentId,
        source: { kind: "intent" as const, ref: paid.intentRef },
      };
      const outcome = await runBalanceFetch(
        job,
        fetchDeps(fake, { rescheduled }),
      );
      expect(outcome).toMatchObject({ kind: "retry", attempt: 1 });
      expect(await balanceRows(paid.paymentId)).toEqual([]);
      expect(
        rescheduled.map((r) => [
          r.job.attempt,
          r.job.firstAttemptAt,
          r.startAfter.toISOString(),
        ]),
      ).toEqual([
        [
          1,
          T0.toISOString(),
          new Date(T0.getTime() + 5 * 60_000).toISOString(),
        ],
      ]);

      // 72 hours later, still empty: dead, one alert, no reschedule.
      const alerts: Alert[] = [];
      const late = await runBalanceFetch(
        { ...job, attempt: 30, firstAttemptAt: T0.toISOString() },
        fetchDeps(fake, {
          alerts,
          rescheduled,
          now: () => new Date(T0.getTime() + 71 * HOUR),
        }),
      );
      expect(late).toEqual({ kind: "dead" });
      expect(alerts.map((a) => a.alert)).toEqual([
        "payments.balance_fetch_dead",
      ]);
      expect(rescheduled).toHaveLength(1);

      // Flag off: nothing asked, the job waits; on: it runs.
      await fake.simulateBalancePending(charge, false);
      const callsBefore = fake.calls.filter(
        (c) => c.method === "balanceFacts",
      ).length;
      let flag = false;
      expect(
        await runBalanceFetch(
          job,
          fetchDeps(fake, { rescheduled, flag: () => flag }),
        ),
      ).toEqual({ kind: "flag_off" });
      expect(fake.calls.filter((c) => c.method === "balanceFacts").length).toBe(
        callsBefore,
      );
      expect(rescheduled).toHaveLength(2);
      expect(await balanceRows(paid.paymentId)).toEqual([]);
      flag = true;
      expect(
        await runBalanceFetch(
          rescheduled[1]?.job ?? job,
          fetchDeps(fake, { flag: () => flag }),
        ),
      ).toEqual({
        kind: "recorded",
        inserted: 1,
      });
    });

    it("T-10 (AC-10): the sweep at +61 min asks for the payment with no charge row only; fees_missing once at 24 h 1 min", async () => {
      const captured = new Date("2026-12-01T10:00:00.000Z");
      const fake = newFake();
      const without = await started(fake, [4100], "EUR");
      const withRow = await started(fake, [4200], "EUR");
      for (const paid of [without, withRow]) {
        await fake.simulateSuccess(paid.intentRef);
        await scratch.sql`UPDATE payment SET status = 'captured', captured_at = ${captured.toISOString()},
                          amount_captured_minor = amount_minor, method = 'card', livemode = true
                          WHERE id = ${paid.paymentId}`;
      }
      await runBalanceFetch(
        {
          paymentId: withRow.paymentId,
          source: { kind: "intent", ref: withRow.intentRef },
        },
        fetchDeps(fake),
      );
      const sweep = async (at: Date, alerts: Alert[] = []) => {
        const enqueued: BalanceFetchJobInput[] = [];
        const counts = await runBalanceSweep({
          transaction: transactionOf(),
          now: () => at,
          log: quiet,
          alert: (alert, fields) => {
            alerts.push({ alert, fields });
          },
          enqueue: (job) => {
            enqueued.push(job);
            return Promise.resolve();
          },
        });
        return { counts, enqueued, alerts };
      };
      const at59 = await sweep(new Date(captured.getTime() + 59 * 60_000));
      expect(
        at59.enqueued.filter((j) => j.paymentId === without.paymentId),
      ).toEqual([]);
      const at61 = await sweep(new Date(captured.getTime() + 61 * 60_000));
      expect(
        at61.enqueued.filter((j) =>
          [without.paymentId, withRow.paymentId].includes(j.paymentId),
        ),
      ).toEqual([
        {
          paymentId: without.paymentId,
          source: { kind: "intent", ref: without.intentRef },
        },
      ]);
      expect(at61.alerts).toEqual([]);

      const first = await sweep(
        new Date(captured.getTime() + 24 * HOUR + 60_000),
      );
      expect(
        first.alerts.filter(
          (a) =>
            a.fields["payment_id"] === without.paymentId ||
            a.fields["payment_id"] === withRow.paymentId,
        ),
      ).toEqual([
        {
          alert: "payments.fees_missing",
          fields: { payment_id: without.paymentId },
        },
      ]);
      const next = await sweep(
        new Date(captured.getTime() + 25 * HOUR + 60_000),
      );
      expect(
        next.alerts.filter((a) => a.fields["payment_id"] === without.paymentId),
      ).toEqual([]);
    });

    it("backfill (§12): every source since the instant, enqueued once each; a dry run counts and enqueues nothing; a bad body is 400", async () => {
      const since = new Date("2027-01-10T00:00:00.000Z");
      const fake = newFake();
      const paid = await started(fake, [1500], "EUR");
      await fake.simulateSuccess(paid.intentRef);
      await scratch.sql`UPDATE payment SET status = 'captured', captured_at = ${new Date(since.getTime() + HOUR).toISOString()},
                        amount_captured_minor = amount_minor, method = 'card' WHERE id = ${paid.paymentId}`;
      const enqueued: BalanceFetchJobInput[] = [];
      const deps = {
        transaction: transactionOf(),
        enqueue: (job: BalanceFetchJobInput) => {
          enqueued.push(job);
          return Promise.resolve();
        },
      };
      expect(
        await runBalanceBackfill(
          { since: since.toISOString(), dryRun: true },
          deps,
        ),
      ).toEqual({
        status: 200,
        body: { ok: true, found: 1, enqueued: 0 },
      });
      expect(enqueued).toEqual([]);
      expect(
        await runBalanceBackfill({ since: since.toISOString() }, deps),
      ).toEqual({
        status: 200,
        body: { ok: true, found: 1, enqueued: 1 },
      });
      expect(enqueued).toEqual([
        {
          paymentId: paid.paymentId,
          source: { kind: "intent", ref: paid.intentRef },
        },
      ]);
      expect(
        (await runBalanceBackfill({ since: "yesterday" }, deps)).status,
      ).toBe(400);
    });

    it("T-04 (AC-4): partner (own id), customer and public read nothing of the three tables and two views and insert nothing; admin and system read every row", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const countryId = await make.country(tx, "PL");
        const partnerId = await make.partner(tx, countryId, "active");
        await tx`UPDATE fulfillment_partner SET contact_name = 'Ola Testowa' WHERE id = ${partnerId}`;
        await tx`INSERT INTO partner_note (partner_id, body, author_user_id) VALUES (${partnerId}, 'Prefers mornings', ${adminId})`;
        await tx`INSERT INTO partner_contact_log (partner_id, occurred_at, channel, direction, topic, summary, author_user_id)
                 VALUES (${partnerId}, now(), 'phone', 'outbound', 'onboarding', 'Walked through the inbox', ${adminId})`;
        await tx`INSERT INTO payout (partner_id, period_start, period_end, status, total_minor, currency_code, kind)
                 VALUES (${partnerId}, DATE '2026-10-19', DATE '2026-10-25', 'draft', 0, 'PLN', 'weekly')`;
        const read = async (role: string, partnerIds: string[] = []) => {
          await asApp(tx, { role, partnerIds });
          try {
            const count = async (table: string) =>
              (
                await tx.unsafe<{ n: number }[]>(
                  `SELECT count(*)::int AS n FROM public.${table}`,
                )
              )[0]?.n ?? -1;
            return {
              payment_balance_txn: await count("payment_balance_txn"),
              partner_note: await count("partner_note"),
              partner_contact_log: await count("partner_contact_log"),
              finance_order_facts: await count("finance_order_facts"),
              finance_partner_position: await count("finance_partner_position"),
            };
          } finally {
            await tx.unsafe("RESET ROLE");
          }
        };
        const none = {
          payment_balance_txn: 0,
          partner_note: 0,
          partner_contact_log: 0,
          finance_order_facts: 0,
          finance_partner_position: 0,
        };
        expect(await read("partner", [partnerId])).toEqual(none);
        expect(await read("customer")).toEqual(none);
        expect(await read("public")).toEqual(none);
        for (const role of ["admin", "system"]) {
          const seen = await read(role);
          expect(seen.payment_balance_txn).toBeGreaterThan(0);
          expect(seen.partner_note).toBe(1);
          expect(seen.partner_contact_log).toBe(1);
          expect(seen.finance_order_facts).toBeGreaterThan(0);
          expect(seen.finance_partner_position).toBe(1);
        }
        const [anyPayment] = await tx<
          { id: string }[]
        >`SELECT id FROM payment LIMIT 1`;
        for (const role of ["partner", "customer", "public"]) {
          await asApp(tx, {
            role,
            partnerIds: role === "partner" ? [partnerId] : [],
          });
          const refused = await pgFailure(
            tx,
            (sp) =>
              sp`INSERT INTO partner_note (partner_id, body, author_user_id) VALUES (${partnerId}, 'x', ${adminId})`,
          );
          expect(refused.code).toBe("42501");
          const refusedLog = await pgFailure(
            tx,
            (sp) =>
              sp`INSERT INTO partner_contact_log (partner_id, occurred_at, channel, direction, topic, summary, author_user_id)
               VALUES (${partnerId}, now(), 'phone', 'outbound', 'other', 'x', ${adminId})`,
          );
          expect(refusedLog.code).toBe("42501");
          const refusedFact = await pgFailure(
            tx,
            (sp) =>
              sp`INSERT INTO payment_balance_txn (payment_id, kind, provider, provider_txn_ref, source_ref,
                  provider_type, reporting_category, amount_minor, fee_minor, net_minor,
                  settlement_currency_code, provider_created_at, livemode)
               VALUES (${anyPayment?.id ?? ""}, 'other', 'stripe', 'txn_rls', 'x', 'x', 'x', 0, 0, 0,
                       'EUR', now(), false)`,
          );
          expect(refusedFact.code).toBe("42501");
          await tx.unsafe("RESET ROLE");
        }
      });
    });

    it("T-32 (AC-32): offboarded_at is set by the first move to offboarded and never again", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const countryId = await make.country(tx, "PL");
        const partnerId = await make.partner(tx, countryId, "active");
        const read = async () =>
          (
            await tx<
              { at: string | null }[]
            >`SELECT offboarded_at::text AS at FROM fulfillment_partner WHERE id = ${partnerId}`
          )[0]?.at;
        await tx`UPDATE fulfillment_partner SET offboarded_at = now() WHERE id = ${partnerId}`;
        expect(await read()).toBeNull();
        await flipStatus(tx, partnerId, "offboarded");
        const first = await read();
        expect(first).not.toBeNull();
        await tx`SELECT pg_sleep(0.01)`;
        await flipStatus(tx, partnerId, "paused");
        await flipStatus(tx, partnerId, "offboarded", ", offboarded_at = NULL");
        expect(await read()).toBe(first);
      });
    });

    it("T-33 (AC-33): the sweep deletes an offboarded florist's notes and log at 24 months and 1 day, keeps them at 23 months and 29 days, keeps an active florist's and every balance fact", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const countryId = await make.country(tx, "PL");
        const gone = await make.partner(tx, countryId, "active");
        const active = await make.partner(tx, countryId, "active");
        for (const partnerId of [gone, active]) {
          await tx`INSERT INTO partner_note (partner_id, body, author_user_id) VALUES (${partnerId}, 'Met at the market', ${adminId})`;
          await tx`INSERT INTO partner_contact_log (partner_id, occurred_at, channel, direction, topic, summary, author_user_id)
                   VALUES (${partnerId}, now(), 'email', 'inbound', 'payout', 'Asked about Friday', ${adminId})`;
        }
        await flipStatus(tx, gone, "offboarded");
        const [row] = await tx<
          { at: Date }[]
        >`SELECT offboarded_at AS at FROM fulfillment_partner WHERE id = ${gone}`;
        const offboarded = row?.at ?? new Date();
        const [facts] = await tx<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM payment_balance_txn`;
        const counts = async () => {
          const [result] = await tx<{ gone: number; active: number }[]>`
            SELECT (SELECT count(*) FROM partner_note WHERE partner_id = ${gone})
                 + (SELECT count(*) FROM partner_contact_log WHERE partner_id = ${gone}) AS gone,
                   (SELECT count(*) FROM partner_note WHERE partner_id = ${active})
                 + (SELECT count(*) FROM partner_contact_log WHERE partner_id = ${active}) AS active`;
          return { gone: Number(result?.gone), active: Number(result?.active) };
        };
        const sweep = async (now: Date) => {
          await asApp(tx, { role: "system" });
          await runRetentionSweep(runnerOf(tx), { now, dryRun: false });
          await tx.unsafe("RESET ROLE");
        };
        const day = 86_400_000;
        // 23 months and 29 days (729 days) after the offboarding: kept.
        await sweep(new Date(offboarded.getTime() + 729 * day));
        expect(await counts()).toEqual({ gone: 2, active: 2 });
        // 24 months and 1 day (731 days): deleted; the active florist's rows stay.
        await sweep(new Date(offboarded.getTime() + 731 * day));
        expect(await counts()).toEqual({ gone: 0, active: 2 });
        const [after] = await tx<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM payment_balance_txn`;
        expect(after?.n).toBe(facts?.n);
      });
    });
  },
);

/* ---------------------------------------------------------------------------------------- */
/* T-32: the guarded down file, on databases of their own                                    */
/* ---------------------------------------------------------------------------------------- */

async function rowCounts(sql: Sql): Promise<Record<string, number>> {
  const tables = await sql<{ name: string }[]>`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`;
  const out: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = await sql.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM public."${name}"`,
    );
    out[name] = row?.n ?? -1;
  }
  return out;
}

describe.skipIf(server.url === undefined)(
  `spec 030b rollback (AC-32, T-32)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let fresh: ScratchDatabase;
    let used: ScratchDatabase;

    async function locked<T>(fn: () => Promise<T>): Promise<T> {
      const admin = postgres(server.url as string, {
        max: 1,
        onnotice: () => undefined,
      });
      await admin`SELECT pg_advisory_lock(${MIGRATE_LOCK})`;
      try {
        return await fn();
      } finally {
        await admin`SELECT pg_advisory_unlock(${MIGRATE_LOCK})`;
        await admin.end({ timeout: 5 });
      }
    }

    async function down(db: ScratchDatabase): Promise<string> {
      await locked(() => runner(db.url, ["--down", "--to", MY_VERSION]));
      try {
        await locked(() => runner(db.url, ["--down", "--to", BEFORE]));
        return "rolled back";
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr ?? "";
        return `${stderr} ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    beforeAll(async () => {
      fresh = await scratchDatabase(server.url as string, "fin439_rb", {
        migrate: false,
      });
      used = await scratchDatabase(server.url as string, "fin439_used");
    }, 600_000);

    afterAll(async () => {
      await fresh.drop();
      await used.drop();
    });

    it("a clean database: down restores the pre-030b catalogue, audit_mask_columns() included; migrate again", async () => {
      expect(MY_VERSION).toMatch(/^\d{4}$/u);
      expect(BEFORE < MY_VERSION).toBe(true);
      const later = FORWARD.filter((name) => name.slice(0, 4) >= MY_VERSION);
      await fresh.sql.unsafe(
        `CREATE TABLE public.schema_migrations (
           version text PRIMARY KEY, name text NOT NULL,
           applied_at timestamptz NOT NULL DEFAULT now())`,
      );
      for (const name of later) {
        await fresh.sql`INSERT INTO public.schema_migrations (version, name)
                        VALUES (${name.slice(0, 4)}, ${name.slice(5, -4)})`;
      }
      await locked(() => runner(fresh.url));
      const before = await readCatalogue(fresh.sql);
      await fresh.sql`DELETE FROM public.schema_migrations WHERE version >= ${MY_VERSION}`;
      await locked(() => runner(fresh.url));
      const withMine = await readCatalogue(fresh.sql);
      expect(
        withMine["functions"]?.["audit_mask_columns(p_table text)"],
      ).not.toEqual(before["functions"]?.["audit_mask_columns(p_table text)"]);
      expect(await down(fresh)).toBe("rolled back");
      expect(await readCatalogue(fresh.sql)).toEqual(before);
      await locked(() => runner(fresh.url));
      expect(await readCatalogue(fresh.sql)).toEqual(withMine);
    }, 600_000);

    it("FINANCE_CRM_ROLLBACK_ROWS_IN_USE with a note, a contact-log row, a live balance fact or a contact name; nothing changes; a test-mode fact alone does not block", async () => {
      const ids = await used.sql.begin(async (tx) => {
        const countryId = await make.country(tx, "PL");
        const partnerId = await make.partner(tx, countryId, "active");
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES (${`${make.unique("rb")}@example.test`}) RETURNING id`;
        const customerId = await make.customer(tx);
        const orderId = await insertPlacedOrder(tx, {
          customerId,
          recipientId: await make.recipient(tx, customerId),
          countryId,
          mode: "test",
          currencyCode: "EUR",
          totalMinor: 1000,
        });
        const [purchase] = await tx<
          { purchase_id: string }[]
        >`SELECT purchase_id FROM "order" WHERE id = ${orderId}`;
        const [payment] = await tx<{ id: string }[]>`
          INSERT INTO payment (provider, provider_ref, status, method, amount_minor, currency_code,
                               captured_at, livemode, capture_method, amount_captured_minor, purchase_id)
          VALUES ('stripe', ${make.unique("pi_rb_")}, 'captured', 'card', 1000, 'EUR', now(), false,
                  'automatic', 1000, ${purchase?.purchase_id ?? ""})
          RETURNING id`;
        return {
          partnerId,
          userId: user?.id ?? "",
          paymentId: payment?.id ?? "",
        };
      });
      const fact = (live: boolean, ref: string) =>
        used.sql`INSERT INTO payment_balance_txn (payment_id, kind, provider, provider_txn_ref, source_ref,
                   provider_type, reporting_category, amount_minor, fee_minor, net_minor,
                   settlement_currency_code, provider_created_at, livemode)
                 VALUES (${ids.paymentId}, 'charge', 'stripe', ${ref}, 'ch_rb', 'charge', 'charge',
                         1000, 30, 970, 'EUR', now(), ${live})`;
      await locked(() => runner(used.url, ["--down", "--to", MY_VERSION]));

      const refuses = async () => {
        const catalogue = await readCatalogue(used.sql);
        const counts = await rowCounts(used.sql);
        expect(await down(used)).toContain("FINANCE_CRM_ROLLBACK_ROWS_IN_USE");
        expect(await readCatalogue(used.sql)).toEqual(catalogue);
        expect(await rowCounts(used.sql)).toEqual(counts);
      };

      await used.sql`INSERT INTO partner_note (partner_id, body, author_user_id) VALUES (${ids.partnerId}, 'note', ${ids.userId})`;
      await refuses();
      await used.sql`DELETE FROM partner_note`;

      await used.sql`INSERT INTO partner_contact_log (partner_id, occurred_at, channel, direction, topic, summary, author_user_id)
                     VALUES (${ids.partnerId}, now(), 'phone', 'outbound', 'other', 'call', ${ids.userId})`;
      await refuses();
      await used.sql`DELETE FROM partner_contact_log`;

      await fact(true, "txn_rb_live");
      await refuses();
      // A live fact cannot be deleted (immutable): this database keeps it, so the clean case
      // below runs on the next row kinds with the trigger lifted for the test only.
      await used.sql.unsafe(
        "ALTER TABLE public.payment_balance_txn DISABLE TRIGGER payment_balance_txn_immutable",
      );
      await used.sql`DELETE FROM payment_balance_txn`;
      await used.sql.unsafe(
        "ALTER TABLE public.payment_balance_txn ENABLE TRIGGER payment_balance_txn_immutable",
      );

      await used.sql`UPDATE fulfillment_partner SET contact_name = 'Ola Testowa' WHERE id = ${ids.partnerId}`;
      await refuses();
      await used.sql`UPDATE fulfillment_partner SET contact_name = NULL WHERE id = ${ids.partnerId}`;

      // A test-mode fact alone does not block the rollback.
      await fact(false, "txn_rb_test");
      expect(await down(used)).toBe("rolled back");
      await locked(() => runner(used.url));
    }, 600_000);
  },
);
