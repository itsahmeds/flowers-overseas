/**
 * Spec 025's alert core, dispatch, escalation and summary on a migrated PG16 scratch database
 * (T-2, T-5, T-6, T-8 to T-10, T-12 to T-16, T-28, T-36; AC-2, AC-5, AC-6, AC-8 to AC-10, AC-12
 * to AC-16, AC-28, AC-36; TASK-488, TASK-489), never the shared database. Every transaction runs
 * as `app_web` in a `system` context, as the worker does; the push channel and the mailer are
 * capturing doubles and the clock is injected. Each case uses its own environment name, so the
 * storm windows and open fingerprints of one case never touch another's.
 */
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readCatalogue } from "../../scripts/db-check-live.ts";
import { RETENTION_HANDLERS } from "../../src/jobs/retention.ts";
import { createLogger } from "../../src/lib/logger.ts";
import { adminT } from "../../src/modules/admin/messages.ts";
import {
  type CapturingPushChannel,
  type DispatchDeps,
  type DispatchJob,
  type OpsTransaction,
  acknowledgeAlert,
  capturingPushChannel,
  clearCondition,
  dispatchAlert,
  raiseAlert,
  resolveAlert,
  runDailySummary,
  runEscalation,
  runMonitor,
} from "../../src/modules/ops/index.ts";
import { orderReference } from "../../src/modules/orders/index.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import * as make from "./support/rows.ts";
import {
  MIGRATE_LOCK,
  asApp,
  probeLocalServer,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const MIGRATIONS = resolve(import.meta.dirname, "../../db/migrations");
const FORWARD = readdirSync(MIGRATIONS)
  .filter(
    (name) => /^\d{4}_.+\.sql$/u.test(name) && !name.endsWith(".down.sql"),
  )
  .sort();
const MINE = FORWARD.find((name) => name.endsWith("_ops_alerts.sql")) ?? "";
const MY_VERSION = MINE.slice(0, 4);
const BEFORE = FORWARD[FORWARD.indexOf(MINE) - 1]?.slice(0, 4) ?? "";

const BASE = "https://staging.flowersoverseas.com";
const silent = createLogger({ write: () => undefined });

let envCounter = 0;
/** A fresh environment name per case (`^[a-z]+$`). */
function freshEnv(): string {
  envCounter += 1;
  return `env${"abcdefghijklmnopqrstuvwxyz"[envCounter % 26] ?? "a"}${"abcdefghijklmnopqrstuvwxyz"[Math.floor(envCounter / 26) % 26] ?? "a"}`;
}

function transactionOn(sql: Sql): OpsTransaction {
  return (fn) =>
    sql.begin(async (tx) => {
      await asApp(tx, { role: "system" });
      const db = drizzleOver(tx, sql);
      return fn({
        async execute(query) {
          const rows: unknown = await db.execute(query);
          return rows as readonly Record<string, unknown>[];
        },
      });
    }) as never;
}

interface Harness {
  readonly deps: DispatchDeps & {
    enqueue: (job: DispatchJob) => Promise<void>;
  };
  readonly push: CapturingPushChannel;
  readonly mail: { subject: string; text: string; tag: string }[];
  readonly jobs: DispatchJob[];
  setNow(at: Date): void;
}

function harness(
  sql: Sql,
  environment: string,
  start: Date,
  overrides: Partial<DispatchDeps> = {},
): Harness {
  let now = start;
  const push = capturingPushChannel();
  const mail: { subject: string; text: string; tag: string }[] = [];
  const jobs: DispatchJob[] = [];
  const deps = {
    transaction: transactionOn(sql),
    now: () => now,
    environment,
    log: silent,
    sentry: vi.fn(),
    strict: true,
    enqueue: async (job: DispatchJob) => {
      jobs.push(job);
      return Promise.resolve();
    },
    t: adminT as unknown as DispatchDeps["t"],
    push,
    pushMissing: [],
    mailer: {
      async send(message: { subject: string; text: string; tag: string }) {
        mail.push(message);
        return Promise.resolve({ providerRef: `m${String(mail.length)}` });
      },
    },
    opsEmail: () => "ops-alerts@example.test",
    reference: orderReference,
    baseUrl: () => BASE,
    sleep: () => Promise.resolve(),
    ...overrides,
  } satisfies DispatchDeps;
  return { deps, push, mail, jobs, setNow: (at) => (now = at) };
}

/** Karachi is UTC+5 all year. */
const karachi = (local: string): Date => new Date(`${local}+05:00`);

async function dispatchAll(h: Harness): Promise<void> {
  while (h.jobs.length > 0) {
    const job = h.jobs.shift();
    if (job !== undefined) await dispatchAlert(job, h.deps);
  }
}

describe.skipIf(server.url === undefined)(
  `spec 025 alerts${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let countryId: string;

    async function order(mode: "test" | "live" = "live"): Promise<string> {
      return scratch.sql.begin(async (tx) => {
        const buyer = await make.customer(tx);
        return insertPlacedOrder(tx, {
          customerId: buyer,
          recipientId: await make.recipient(tx, buyer),
          countryId,
          mode,
        });
      }) as Promise<string>;
    }

    async function rows(environment: string) {
      return scratch.sql<
        {
          id: string;
          name: string;
          severity: string;
          status: string;
          occurrences: number;
          reopen_count: number;
        }[]
      >`SELECT id, name, severity, status, occurrences, reopen_count FROM ops_alert
         WHERE environment = ${environment} ORDER BY created_at, id`;
    }

    async function notifications(alertId: string) {
      return scratch.sql<
        {
          channel: string;
          kind: string;
          priority: number | null;
          recipient: string;
          status: string;
          skip_reason: string | null;
          provider_ref: string | null;
        }[]
      >`SELECT channel, kind, priority, recipient, status, skip_reason, provider_ref
          FROM ops_alert_notification WHERE alert_id = ${alertId} ORDER BY created_at, channel, kind, id`;
    }

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "ops");
      countryId = (await scratch.sql.begin((tx) =>
        make.country(tx, "PL"),
      )) as string;
      // Push on everywhere for these cases; AC-9 turns it off and on again.
      await scratch.sql`INSERT INTO feature_flag_scope (flag_key, scope, scope_ref, enabled)
                        VALUES ('alerts.push', 'global', '*', true)`;
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-2 (AC-2): two concurrent raises leave one row with occurrences 2 and one push and one email; another order a second row", async () => {
      const env = freshEnv();
      const h = harness(scratch.sql, env, karachi("2026-11-09T12:00:00"));
      const a = await order();
      const b = await order();
      const [first, second] = await Promise.all([
        raiseAlert("routing.no_partner", { orderId: a }, h.deps),
        raiseAlert("routing.no_partner", { orderId: a }, h.deps),
      ]);
      await raiseAlert("routing.no_partner", { orderId: b }, h.deps);
      expect([first?.outcome, second?.outcome].sort()).toEqual([
        "deduplicated",
        "inserted",
      ]);
      const all = await rows(env);
      expect(all).toHaveLength(2);
      expect(all.find((row) => row.occurrences === 2)).toBeDefined();
      expect(h.jobs.filter((job) => job.kind === "raise")).toHaveLength(2);
      const alertA = first?.alertId ?? "";
      await dispatchAlert({ alertId: alertA, kind: "raise" }, h.deps);
      expect(h.push.sent).toHaveLength(1);
      expect(h.mail).toHaveLength(1);
    });

    it("T-5 (AC-5): a P1 outside quiet hours: one priority 2 push with retry, expire and tag, one email, two rows with refs", async () => {
      const env = freshEnv();
      const h = harness(scratch.sql, env, karachi("2026-11-09T12:00:00"));
      const raised = await raiseAlert(
        "site.down",
        { component: "site" },
        h.deps,
      );
      await dispatchAll(h);
      expect(h.push.sent).toHaveLength(1);
      expect(h.push.sent[0]?.message).toMatchObject({
        priority: 2,
        retry: 120,
        expire: 3600,
        tags: raised.alertId,
      });
      expect(h.mail).toHaveLength(1);
      expect(h.mail[0]?.tag).toBe("ops_alert");
      const sent = await notifications(raised.alertId ?? "");
      expect(
        sent.map((row) => [row.channel, row.status, row.provider_ref !== null]),
      ).toEqual([
        ["email", "sent", true],
        ["push", "sent", true],
      ]);
    });

    it("T-6 (AC-6): a P2 pushes at priority 1 with an email; a P3 neither, and its row is there", async () => {
      const env = freshEnv();
      const h = harness(scratch.sql, env, karachi("2026-11-09T12:00:00"));
      await raiseAlert("jobs.failed_spike", { component: "queue" }, h.deps);
      const p3 = await raiseAlert(
        "order.photo_missing",
        { orderId: await order() },
        h.deps,
      );
      await dispatchAll(h);
      expect(h.push.sent.map((push) => push.message.priority)).toEqual([1]);
      expect(h.mail).toHaveLength(1);
      expect(p3.severity).toBe("P3");
      expect(
        (await notifications(p3.alertId ?? "")).map((row) => [
          row.channel,
          row.status,
          row.skip_reason,
        ]),
      ).toEqual([["push", "skipped", "severity"]]);
    });

    it("T-8 (AC-8): alerts held overnight and still open give one grouped push at quiet end, priority 2 with a P1 among them", async () => {
      const env = freshEnv();
      const h = harness(scratch.sql, env, karachi("2026-11-09T03:00:00"));
      await raiseAlert(
        "routing.no_partner",
        { orderId: await order(), actBy: karachi("2026-11-12T10:00:00") },
        h.deps,
      );
      await raiseAlert("jobs.failed_spike", { component: "queue" }, h.deps);
      const gone = await raiseAlert(
        "email.bounce_rate",
        { component: "email" },
        h.deps,
      );
      await dispatchAll(h);
      expect(h.push.sent).toHaveLength(0);
      expect(h.mail).toHaveLength(3);
      h.setNow(karachi("2026-11-09T04:00:00"));
      await resolveAlert(
        { alertId: gone.alertId ?? "", resolution: "fixed" },
        "system:alerts.monitor",
        h.deps,
      );
      h.setNow(karachi("2026-11-09T06:59:00"));
      expect((await runEscalation(h.deps)).digested).toBe(0);
      h.setNow(karachi("2026-11-09T07:00:00"));
      const counts = await runEscalation(h.deps);
      expect(counts.digested).toBe(2);
      expect(h.push.sent).toHaveLength(1);
      expect(h.push.sent[0]?.message.priority).toBe(2);
      h.setNow(karachi("2026-11-09T07:01:00"));
      expect((await runEscalation(h.deps)).digested).toBe(0);
    });

    it("T-9 (AC-9): a test-mode order is capped at P2 with [TEST]; with alerts.push off outside production no push, the email goes", async () => {
      const env = freshEnv();
      const h = harness(scratch.sql, env, karachi("2026-11-09T12:00:00"));
      const raised = await raiseAlert(
        "routing.no_partner",
        { orderId: await order("test") },
        h.deps,
      );
      expect(raised.severity).toBe("P2");
      await dispatchAll(h);
      expect(h.push.sent[0]?.message.title.startsWith("[TEST] [P2]")).toBe(
        true,
      );

      await scratch.sql`UPDATE feature_flag_scope SET enabled = false WHERE flag_key = 'alerts.push'`;
      try {
        const off = harness(
          scratch.sql,
          freshEnv(),
          karachi("2026-11-09T12:00:00"),
        );
        const quiet = await raiseAlert(
          "site.down",
          { component: "site" },
          off.deps,
        );
        await dispatchAll(off);
        expect(off.push.sent).toHaveLength(0);
        expect(off.mail).toHaveLength(1);
        expect(
          (await notifications(quiet.alertId ?? "")).find(
            (row) => row.channel === "push",
          )?.skip_reason,
        ).toBe("push_disabled");
      } finally {
        await scratch.sql`UPDATE feature_flag_scope SET enabled = true WHERE flag_key = 'alerts.push'`;
      }
      const on = harness(
        scratch.sql,
        freshEnv(),
        karachi("2026-11-09T12:00:00"),
      );
      await raiseAlert("site.down", { component: "site" }, on.deps);
      await dispatchAll(on);
      expect(on.push.sent).toHaveLength(1);
    });

    it("T-10 (AC-10): the eleventh push in 15 minutes is held with one storm push; the twenty-first email is held with one storm email", async () => {
      const env = freshEnv();
      const h = harness(scratch.sql, env, karachi("2026-11-09T12:00:00"));
      for (let index = 0; index < 12; index += 1) {
        await raiseAlert(
          "site.page_failing",
          { component: "site", subKey: `p${String(index)}` },
          h.deps,
        );
      }
      await dispatchAll(h);
      const stats = await scratch.sql<
        {
          status: string;
          skip_reason: string | null;
          kind: string;
          n: number;
        }[]
      >`
        SELECT n.status, n.skip_reason, n.kind, count(*)::int AS n
          FROM ops_alert_notification n JOIN ops_alert a ON a.id = n.alert_id
         WHERE a.environment = ${env} AND n.channel = 'push'
         GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
      expect(stats).toEqual([
        { status: "held", skip_reason: "storm", kind: "raise", n: 2 },
        { status: "sent", skip_reason: null, kind: "held_digest", n: 1 },
        { status: "sent", skip_reason: null, kind: "raise", n: 10 },
      ]);
      expect(h.push.sent).toHaveLength(11);
      expect(h.mail).toHaveLength(12);

      const many = harness(
        scratch.sql,
        freshEnv(),
        karachi("2026-11-09T12:00:00"),
      );
      for (let index = 0; index < 22; index += 1) {
        await raiseAlert(
          "site.page_failing",
          { component: "site", subKey: `q${String(index)}` },
          many.deps,
        );
      }
      await dispatchAll(many);
      expect(
        many.mail.filter((mail) => mail.subject.includes("open the alert log")),
      ).toHaveLength(1);
      expect(many.mail).toHaveLength(21);
    });

    it("T-12 (AC-12): keys empty: push skipped not_configured and the email goes; a Pushover 400 raises alerts.channel_failed by email only", async () => {
      const env = freshEnv();
      const none = harness(scratch.sql, env, karachi("2026-11-09T12:00:00"), {
        push: null,
        pushMissing: ["PUSHOVER_APP_TOKEN"],
      });
      const raised = await raiseAlert(
        "site.down",
        { component: "site" },
        none.deps,
      );
      await dispatchAll(none);
      expect(none.mail).toHaveLength(1);
      expect(
        (await notifications(raised.alertId ?? "")).find(
          (row) => row.channel === "push",
        )?.skip_reason,
      ).toBe("not_configured");

      const failing = harness(
        scratch.sql,
        freshEnv(),
        karachi("2026-11-09T12:00:00"),
      );
      failing.push.script.push({
        ok: false,
        errorClass: "HttpError:400",
        httpStatus: 400,
        retryable: false,
      });
      await raiseAlert("site.down", { component: "site" }, failing.deps);
      await dispatchAll(failing);
      const all = await rows(failing.deps.environment ?? "");
      expect(all.map((row) => row.name).sort()).toEqual([
        "alerts.channel_failed",
        "site.down",
      ]);
      const channel = all.find((row) => row.name === "alerts.channel_failed");
      expect(
        (await notifications(channel?.id ?? "")).map((row) => row.channel),
      ).toEqual(["email"]);
      expect(failing.push.sent).toHaveLength(0);
    });

    it("T-13 (AC-13): unacknowledged after 15 minutes, one escalation email and a backup push; a new page at expiry; never more than 3 pages in 24 hours", async () => {
      const env = freshEnv();
      const start = karachi("2026-11-09T12:00:00");
      const h = harness(scratch.sql, env, start);
      const raised = await raiseAlert(
        "site.down",
        { component: "site" },
        h.deps,
      );
      await dispatchAll(h);
      h.setNow(new Date(start.getTime() + 14 * 60_000));
      expect((await runEscalation(h.deps)).escalated).toBe(0);
      h.setNow(new Date(start.getTime() + 15 * 60_000));
      expect((await runEscalation(h.deps)).escalated).toBe(1);
      expect(h.mail.at(-1)?.text).toContain("still unacknowledged");
      expect(h.push.sent.at(-1)?.message.recipient).toBe("backup");
      h.setNow(new Date(start.getTime() + 16 * 60_000));
      expect((await runEscalation(h.deps)).escalated).toBe(0);
      for (let hour = 1; hour <= 5; hour += 1) {
        h.setNow(new Date(start.getTime() + hour * 3_600_000));
        await runEscalation(h.deps);
      }
      const [alert] = await scratch.sql<
        { pages_24h: number }[]
      >`SELECT pages_24h FROM ops_alert WHERE id = ${raised.alertId ?? ""}`;
      expect(alert?.pages_24h).toBe(3);
      const primaryPages = (await notifications(raised.alertId ?? "")).filter(
        (row) =>
          row.channel === "push" &&
          row.priority === 2 &&
          row.recipient === "primary" &&
          row.status === "sent",
      );
      expect(primaryPages).toHaveLength(3);
    });

    it("T-14 (AC-14): an acknowledged receipt acknowledges as pushover; an admin acknowledgement cancels by tag; nothing escalates after", async () => {
      const env = freshEnv();
      const start = karachi("2026-11-09T12:00:00");
      const h = harness(scratch.sql, env, start);
      const byReceipt = await raiseAlert(
        "site.down",
        { component: "site" },
        h.deps,
      );
      const byAdmin = await raiseAlert(
        "jobs.backlog",
        { component: "queue" },
        h.deps,
      );
      await dispatchAll(h);
      const receiptRef = h.push.sent[0]?.ref ?? "";
      h.push.acknowledged.set(
        receiptRef,
        new Date(start.getTime() + 3 * 60_000),
      );
      h.setNow(new Date(start.getTime() + 5 * 60_000));
      expect((await runEscalation(h.deps)).receiptsAcknowledged).toBe(1);
      const admin = `admin:${randomUUID()}`;
      expect(await acknowledgeAlert(byAdmin.alertId ?? "", admin, h.deps)).toBe(
        true,
      );
      expect(h.push.cancelled).toEqual([byAdmin.alertId]);
      const states = await scratch.sql<
        { id: string; status: string; acknowledged_by: string }[]
      >`
        SELECT id, status, acknowledged_by FROM ops_alert WHERE environment = ${env}`;
      expect(states.find((row) => row.id === byReceipt.alertId)).toMatchObject({
        status: "acknowledged",
        acknowledged_by: "pushover",
      });
      expect(states.find((row) => row.id === byAdmin.alertId)).toMatchObject({
        status: "acknowledged",
        acknowledged_by: admin,
      });
      const before = h.push.sent.length + h.mail.length;
      h.setNow(new Date(start.getTime() + 2 * 3_600_000));
      const counts = await runEscalation(h.deps);
      expect([counts.escalated, counts.repaged, counts.reminded]).toEqual([
        0, 0, 0,
      ]);
      expect(h.push.sent.length + h.mail.length).toBe(before);
    });

    it("T-15 (AC-15): an order P2 with act_by 10:00 bumps to P1 at 09:00, not 08:59, once; inside quiet hours with act_by 03:00 the bump pages", async () => {
      const env = freshEnv();
      const h = harness(scratch.sql, env, karachi("2026-11-09T08:00:00"));
      const raised = await raiseAlert(
        "order.dispatch_at_risk",
        { orderId: await order(), actBy: karachi("2026-11-09T10:00:00") },
        h.deps,
      );
      await dispatchAll(h);
      h.setNow(karachi("2026-11-09T08:59:00"));
      expect((await runEscalation(h.deps)).bumped).toBe(0);
      h.setNow(karachi("2026-11-09T09:00:00"));
      expect((await runEscalation(h.deps)).bumped).toBe(1);
      expect((await rows(env))[0]?.severity).toBe("P1");
      expect(
        (await notifications(raised.alertId ?? "")).filter(
          (row) => row.kind === "bump" && row.channel === "push",
        ),
      ).toHaveLength(1);
      h.setNow(karachi("2026-11-09T09:01:00"));
      expect((await runEscalation(h.deps)).bumped).toBe(0);

      const night = harness(
        scratch.sql,
        freshEnv(),
        karachi("2026-11-09T01:00:00"),
      );
      const late = await raiseAlert(
        "order.dispatch_at_risk",
        { orderId: await order(), actBy: karachi("2026-11-09T03:00:00") },
        night.deps,
      );
      await dispatchAll(night);
      const pushedBefore = night.push.sent.length;
      night.setNow(karachi("2026-11-09T02:00:00"));
      await runEscalation(night.deps);
      expect(night.push.sent.length).toBe(pushedBefore + 1);
      expect(night.push.sent.at(-1)?.message.priority).toBe(2);
      expect(
        (await notifications(late.alertId ?? "")).some(
          (row) => row.kind === "bump" && row.status === "sent",
        ),
      ).toBe(true);
    });

    it("T-16 (AC-16): resolves after 2 clear runs, not 1; a priority -1 push outside quiet hours only; a re-raise at 29 minutes reopens, at 31 inserts", async () => {
      const env = freshEnv();
      const start = karachi("2026-11-09T12:00:00");
      const h = harness(scratch.sql, env, start);
      await raiseAlert("jobs.backlog", { component: "queue" }, h.deps);
      await dispatchAll(h);
      expect(
        (
          await clearCondition(
            "jobs.backlog",
            { component: "queue" },
            {},
            h.deps,
          )
        ).resolved,
      ).toBe(false);
      expect(
        (
          await clearCondition(
            "jobs.backlog",
            { component: "queue" },
            {},
            h.deps,
          )
        ).resolved,
      ).toBe(true);
      await dispatchAll(h);
      expect(h.push.sent.at(-1)?.message.priority).toBe(-1);

      h.setNow(new Date(start.getTime() + 29 * 60_000));
      const again = await raiseAlert(
        "jobs.backlog",
        { component: "queue" },
        h.deps,
      );
      expect(again.outcome).toBe("reopened");
      expect((await rows(env))[0]).toMatchObject({
        reopen_count: 1,
        status: "open",
      });
      await clearCondition(
        "jobs.backlog",
        { component: "queue" },
        { immediate: true },
        h.deps,
      );
      h.setNow(new Date(start.getTime() + (29 + 31) * 60_000));
      expect(
        (await raiseAlert("jobs.backlog", { component: "queue" }, h.deps))
          .outcome,
      ).toBe("inserted");
      expect(await rows(env)).toHaveLength(2);

      const night = harness(
        scratch.sql,
        freshEnv(),
        karachi("2026-11-09T12:00:00"),
      );
      await raiseAlert("jobs.backlog", { component: "queue" }, night.deps);
      await dispatchAll(night);
      night.setNow(karachi("2026-11-09T23:30:00"));
      await clearCondition(
        "jobs.backlog",
        { component: "queue" },
        { immediate: true },
        night.deps,
      );
      await dispatchAll(night);
      expect(night.push.sent.map((push) => push.message.priority)).toEqual([2]);
    });

    it("T-28 (AC-28): a day with zero alerts still sends one summary; a second run for the date sends nothing; the summary heartbeat is pinged once", async () => {
      const env = freshEnv();
      const h = harness(scratch.sql, env, karachi("2026-11-09T08:00:00"));
      const fetchImpl = vi.fn(async () => Promise.resolve(new Response("OK")));
      const deps = {
        ...h.deps,
        summaryHeartbeatUrl:
          "https://hc-ping.com/00000000-0000-4000-8000-000000000001",
        fetch: fetchImpl as unknown as typeof fetch,
        fxAsOf: () => "2026-11-06",
      };
      const first = await runDailySummary("2026-11-09", deps);
      expect(first.sent).toBe(true);
      expect(h.mail).toHaveLength(1);
      expect(h.mail[0]?.tag).toBe("ops_daily_summary");
      for (const part of [
        "No open alerts.",
        "Raised: P1 0",
        "Orders due today",
        "Monitor last run",
        "Push: configured",
        "Exchange rates as of: 2026-11-06",
        "Last test alert acknowledged",
      ]) {
        expect(first.text).toContain(part);
      }
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const second = await runDailySummary("2026-11-09", deps);
      expect(second).toEqual({ sent: false, reason: "already_sent" });
      expect(h.mail).toHaveLength(1);
      await scratch.sql`UPDATE ops_alert_setting SET summary_sent_for = NULL WHERE id = 1`;
    });

    it("T-17 (AC-17): webhook.error_rate over the last 10 minutes: 2 failed of 50 fires, rows older than 10 minutes do not count, 2 clear runs resolve", async () => {
      const env = freshEnv();
      const now = new Date("2026-11-09T12:00:00Z");
      const h = harness(scratch.sql, env, now);
      const inbox = async (
        count: number,
        status: string,
        minutesAgo: number,
      ) => {
        for (let index = 0; index < count; index += 1) {
          await scratch.sql`
            INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, status, received_at, livemode, event_type)
            VALUES ('stripe', ${`evt_${randomUUID()}`}, true, '{}'::jsonb, ${status},
                    ${new Date(now.getTime() - minutesAgo * 60_000).toISOString()}::timestamptz, false, 'payment_intent.succeeded')`;
        }
      };
      await inbox(5, "failed", 11);
      await inbox(1, "failed", 2);
      await inbox(30, "processed", 2);
      const monitorDeps = { ...h.deps, allCadences: true, baseUrl: () => "" };
      await runMonitor(monitorDeps);
      expect(
        (await rows(env)).filter((row) => row.name === "webhook.error_rate"),
      ).toHaveLength(0);
      await inbox(1, "dead", 1);
      await inbox(18, "processed", 1);
      await runMonitor(monitorDeps);
      expect(
        (await rows(env))
          .filter((row) => row.name === "webhook.error_rate")
          .map((row) => row.status),
      ).toEqual(["open"]);
      h.setNow(new Date(now.getTime() + 11 * 60_000));
      await runMonitor({
        ...monitorDeps,
        now: () => new Date(now.getTime() + 11 * 60_000),
      });
      expect(
        (await rows(env)).find((row) => row.name === "webhook.error_rate")
          ?.status,
      ).toBe("open");
      await runMonitor({
        ...monitorDeps,
        now: () => new Date(now.getTime() + 12 * 60_000),
      });
      expect(
        (await rows(env)).find((row) => row.name === "webhook.error_rate")
          ?.status,
      ).toBe("resolved");
      await scratch.sql`DELETE FROM webhook_inbox`;
    });

    it("T-19 (AC-19): an accepted order due today in Warsaw: nothing before 13:00, P2 at 13:00, P1 at 16:00; out_for_delivery resolves", async () => {
      const env = freshEnv();
      // The fixture's delivery date is 2027-02-14; Warsaw is UTC+1 in February.
      const at = (local: string) => new Date(`2027-02-14T${local}:00+01:00`);
      const h = harness(scratch.sql, env, at("12:55"));
      const id = await order();
      await scratch.sql.begin((tx) => walkOrderTo(tx, id, "accepted"));
      const monitorAt = (local: string) =>
        runMonitor({
          ...h.deps,
          allCadences: true,
          baseUrl: () => "",
          now: () => at(local),
        });
      await monitorAt("12:55");
      expect(
        (await rows(env)).filter(
          (row) => row.name === "order.dispatch_at_risk",
        ),
      ).toHaveLength(0);
      await monitorAt("13:00");
      expect(
        (await rows(env)).find((row) => row.name === "order.dispatch_at_risk")
          ?.severity,
      ).toBe("P2");
      await monitorAt("16:00");
      expect(
        (await rows(env)).find((row) => row.name === "order.dispatch_at_risk")
          ?.severity,
      ).toBe("P1");
      await scratch.sql.begin((tx) => walkOrderTo(tx, id, "out_for_delivery"));
      await monitorAt("16:05");
      expect(
        (await rows(env)).find((row) => row.name === "order.dispatch_at_risk")
          ?.status,
      ).toBe("resolved");
    });

    it("T-36 (AC-36): RLS lets system and admin read the alert tables, and nobody else; the sweep deletes resolved alerts over 12 months only", async () => {
      const env = freshEnv();
      const now = new Date("2026-11-09T12:00:00Z");
      const h = harness(scratch.sql, env, now);
      const insert = async (
        subKey: string,
        status: string,
        resolvedAt: string | null,
      ) => {
        await scratch.sql`
          INSERT INTO ops_alert (environment, name, severity, initial_severity, fingerprint, component, status, resolved_at, resolution, first_seen_at)
          VALUES (${env}, 'site.page_failing', 'P2', 'P2', ${`site.page_failing:site:${subKey}`}, 'site', ${status},
                  ${resolvedAt}::timestamptz, ${resolvedAt === null ? null : "fixed"}, '2025-08-01T00:00:00Z')`;
      };
      await insert("old", "resolved", "2025-10-01T00:00:00Z");
      await insert("recent", "resolved", "2025-12-20T00:00:00Z");
      await insert("open", "open", null);
      for (const role of ["partner", "customer", "public"]) {
        const [seen] = (await scratch.sql.begin(async (tx) => {
          await asApp(tx, { role });
          return tx<{ n: number }[]>`SELECT count(*)::int AS n FROM ops_alert`;
        })) as unknown as { n: number }[];
        expect(seen?.n, role).toBe(0);
      }
      for (const role of ["system", "admin"]) {
        const [seen] = (await scratch.sql.begin(async (tx) => {
          await asApp(tx, { role });
          return tx<
            { n: number }[]
          >`SELECT count(*)::int AS n FROM ops_alert WHERE environment = ${env}`;
        })) as unknown as { n: number }[];
        expect(seen?.n, role).toBe(3);
      }
      const handler = RETENTION_HANDLERS["ops_alert"];
      expect(handler).toBeDefined();
      await scratch.sql.begin(async (tx) => {
        await asApp(tx, { role: "system" });
        await handler?.({
          db: drizzleOver(tx, scratch.sql) as never,
          now,
          cutoff: new Date(now.getTime() - 365 * 86_400_000),
          dryRun: false,
          storage: undefined,
        });
      });
      const left = await scratch.sql<{ fingerprint: string }[]>`
        SELECT fingerprint FROM ops_alert WHERE environment = ${env} ORDER BY fingerprint`;
      expect(left.map((row) => row.fingerprint)).toEqual([
        "site.page_failing:site:open",
        "site.page_failing:site:recent",
      ]);
      expect(h.jobs).toEqual([]);
    });
  },
);

describe.skipIf(server.url === undefined)(
  `spec 025 migration round trip (AC-36)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let db: ScratchDatabase;

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

    beforeAll(async () => {
      db = await scratchDatabase(server.url as string, "ops_rb");
    }, 300_000);

    afterAll(async () => {
      await db.drop();
    });

    it("migrates, rolls back and migrates again to the same catalogue", async () => {
      expect(BEFORE < MY_VERSION).toBe(true);
      const first = await readCatalogue(db.sql);
      await locked(() => runner(db.url, ["--down", "--to", BEFORE]));
      const [gone] = await db.sql<
        { t: string | null }[]
      >`SELECT to_regclass('public.ops_alert')::text AS t`;
      expect(gone?.t).toBeNull();
      const [flag] = await db.sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM feature_flag WHERE key = 'alerts.push'`;
      expect(flag?.n).toBe(0);
      await locked(() => runner(db.url));
      expect(await readCatalogue(db.sql)).toEqual(first);
    });
  },
);
