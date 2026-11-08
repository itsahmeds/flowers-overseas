/**
 * The pg-boss runtime without a database (spec 002 §5.2, §5.4, §13 Q6, AC-21; TASK-024): the
 * constructor switches that keep pg-boss from issuing DDL or arming a timer, `withBoss` stopping
 * the instance on every path, and `runTick`'s settlement of each job exactly once against a fake
 * boss. The same paths against a real pg-boss are `tests/integration/jobs-pgboss.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger";

const constructed: unknown[] = [];
const calls: string[] = [];
let startError: Error | undefined;
let stopError: Error | undefined;

vi.mock("pg-boss", () => {
  class PgBoss {
    constructor(options: unknown) {
      constructed.push(options);
    }
    on(): this {
      return this;
    }
    async start(): Promise<this> {
      calls.push("start");
      if (startError !== undefined) throw startError;
      return this;
    }
    async stop(options: unknown): Promise<void> {
      calls.push(`stop:${JSON.stringify(options)}`);
      if (stopError !== undefined) throw stopError;
    }
  }
  return { PgBoss };
});

const runtime = await import("../../src/jobs/runtime");
const { bossOptions, ensureQueues, runTick, withBoss, PGBOSS_SCHEMA } = runtime;

beforeEach(() => {
  constructed.length = 0;
  calls.length = 0;
  stopError = undefined;
  startError = undefined;
});

describe("bossOptions — no DDL and no timers in the web process", () => {
  it("pins every switch, schema pgboss, the URL it was given", () => {
    expect(bossOptions("postgres://u:p@direct.example.test/fo")).toEqual({
      connectionString: "postgres://u:p@direct.example.test/fo",
      schema: "pgboss",
      application_name: "fo-jobs",
      max: 2,
      connectionTimeoutMillis: 10_000,
      migrate: false,
      createSchema: false,
      supervise: false,
      schedule: false,
      registerInstance: false,
      persistQueueStats: false,
      persistWarnings: false,
      reindex: false,
      monitorVacuum: false,
      useListenNotify: false,
    });
    expect(PGBOSS_SCHEMA).toBe("pgboss");
  });
});

describe("withBoss — one instance per call, always stopped", () => {
  it("a stop that rejects is logged as jobs.stop_failed and never masks the result or the callback's error (breaker round 2, hole 1)", async () => {
    stopError = new TypeError("pool already closed");
    const lines: Record<string, unknown>[] = [];
    const log = createLogger({
      level: "debug",
      write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
    });
    const options = {
      connectionString: "postgres://u:p@direct.example.test/fo",
      log,
    };
    await expect(withBoss(async () => "done", options)).resolves.toBe("done");
    await expect(
      withBoss(async () => {
        throw new RangeError("handler failed");
      }, options),
    ).rejects.toThrow("handler failed");
    expect(
      lines.map((line) => [line["msg"], line["level"], line["error_class"]]),
    ).toEqual([
      ["jobs.stop_failed", "warn", "TypeError"],
      ["jobs.stop_failed", "warn", "TypeError"],
    ]);
    expect(JSON.stringify(lines)).not.toContain("pool already closed");
  });

  it("starts, runs, stops with the pool closed, and returns the result", async () => {
    const result = await withBoss(async () => "done", {
      connectionString: "postgres://u:p@direct.example.test/fo",
    });
    expect(result).toBe("done");
    expect(constructed).toHaveLength(1);
    expect(calls).toEqual([
      "start",
      'stop:{"graceful":false,"close":true,"timeout":1000}',
    ]);
  });

  it("stops even when the callback throws, and rethrows", async () => {
    await expect(
      withBoss(
        async () => {
          throw new Error("handler failed");
        },
        { connectionString: "postgres://u:p@direct.example.test/fo" },
      ),
    ).rejects.toThrow("handler failed");
    expect(calls).toEqual([
      "start",
      'stop:{"graceful":false,"close":true,"timeout":1000}',
    ]);
  });

  it("propagates a refused start (pg-boss's schema version check) without running the callback", async () => {
    startError = new Error("pg-boss database requires migrations");
    const fn = vi.fn(async () => "never");
    await expect(
      withBoss(fn, {
        connectionString: "postgres://u:p@direct.example.test/fo",
      }),
    ).rejects.toThrow("requires migrations");
    expect(fn).not.toHaveBeenCalled();
    // Review N1 (PR 224): the refused start already opened pg-boss's pool, so stop still runs.
    expect(calls).toEqual([
      "start",
      'stop:{"graceful":false,"close":true,"timeout":1000}',
    ]);
  });
});

/** The handle `getDb` returns; handlers receive it as `context.queue`. */
const queueDb = { executeSql: async () => ({ rows: [] }) };

/** A fake pg-boss with an in-memory queue per name, recording every settlement. */
function fakeBoss(jobs: Record<string, { id: string; data: unknown }[]>) {
  const settled: string[] = [];
  const fetched: string[] = [];
  const queues: string[] = [];
  const boss = {
    supervise: vi.fn(async () => undefined),
    createQueue: vi.fn(async (name: string) => {
      queues.push(name);
    }),
    fetch: vi.fn(async (name: string, options: { batchSize: number }) => {
      fetched.push(name);
      return (jobs[name] ?? []).splice(0, options.batchSize);
    }),
    complete: vi.fn(async (name: string, id: string) => {
      settled.push(`complete:${name}:${id}`);
    }),
    fail: vi.fn(async (name: string, id: string, data: unknown) => {
      settled.push(`fail:${name}:${id}:${JSON.stringify(data)}`);
    }),
    cancel: vi.fn(async (name: string, id: string) => {
      settled.push(`cancel:${name}:${id}`);
    }),
    // pg-boss's own handle, passed to handlers as `context.queue` (spec 025, TASK-489).
    getDb: vi.fn(() => queueDb),
  };
  return { boss: boss as never, raw: boss, settled, fetched, queues };
}

const envelope = (payload: unknown, v = 1) => ({
  v,
  requestId: "system:test",
  payload,
});

const quiet = () => createLogger({ level: "fatal", write: () => undefined });

describe("ensureQueues", () => {
  it("creates exactly the registered queues", async () => {
    const fake = fakeBoss({});
    await ensureQueues(fake.boss);
    expect(fake.queues.sort()).toEqual([
      "alerts.daily_summary",
      "alerts.dispatch",
      "alerts.escalate",
      "alerts.monitor",
      "assignment.photo_remind",
      "assignment.remind",
      "assignment.timeout",
      "basket-reminders.scan",
      "basket-reminders.send",
      "db.backup_verify",
      "invoice.email",
      "invoice.render",
      "invoice.render_sweep",
      "media.derive_variants",
      "neon.usage_probe",
      "notifications.resend",
      "order.close_sweep",
      "order.no_partner_expire",
      "order.route",
      "outbox.dispatch",
      "payments.balance_fetch",
      "payments.balance_sweep",
      "payments.monitor",
      "payments.production_start",
      "payouts.close",
      "payouts.prepaid_ready",
      "payouts.statement_email",
      "payouts.watch",
      "retention.sweep",
      "routing.sla_watch",
      "webhook.process",
      "webhook.resend.process",
    ]);
    // Spec 016's keyed jobs are `short` queues: one waiting job per key (TASK-328).
    const create = fake.raw.createQueue as unknown as {
      mock: { calls: [string, { policy?: string } | undefined][] };
    };
    const shortQueues = create.mock.calls
      .filter(([, options]) => options?.policy === "short")
      .map(([name]) => name)
      .sort();
    expect(shortQueues).toEqual([
      "alerts.daily_summary",
      "alerts.dispatch",
      "assignment.photo_remind",
      "assignment.remind",
      "assignment.timeout",
      "basket-reminders.send",
      "invoice.email",
      "notifications.resend",
      "order.no_partner_expire",
      "order.route",
      "payments.balance_fetch",
      "payouts.prepaid_ready",
      "payouts.statement_email",
    ]);
    // Spec 018's `invoice.render`: one queued or running job per invoice (TASK-342).
    expect(
      create.mock.calls
        .filter(([, options]) => options?.policy === "exclusive")
        .map(([name]) => name),
    ).toEqual(["invoice.render"]);
  });
});

describe("runTick — what reaches a log line (breaker hole 4, PR 224)", () => {
  it("writes each job.* line with exactly its declared keys: never the job's data or payload", async () => {
    const fake = fakeBoss({
      "db.backup_verify": [
        {
          id: "bad",
          data: envelope({ objectKey: 9, note: "buyer@example.test" }),
        },
        {
          id: "good",
          data: envelope({ objectKey: "backups/2026/10/14/fo.dump" }),
        },
      ],
      "neon.usage_probe": [{ id: "boom", data: envelope({}) }],
    });
    const lines: Record<string, unknown>[] = [];
    await runTick(
      fake.boss,
      {
        "db.backup_verify": async () => undefined,
        "neon.usage_probe": async () => {
          throw new RangeError("x");
        },
      },
      {
        log: createLogger({
          level: "debug",
          write: (line) =>
            lines.push(JSON.parse(line) as Record<string, unknown>),
        }),
      },
    );
    const base = ["level", "msg", "time"];
    const expected: Record<string, string[]> = {
      "job.rejected": [...base, "issues", "job", "job_id", "reason"],
      "job.start": [...base, "actor", "job", "job_id", "origin_request_id"],
      "job.finish": [...base, "actor", "duration_ms", "job", "job_id"],
      "job.failed": [
        ...base,
        "actor",
        "duration_ms",
        "error_class",
        "job",
        "job_id",
      ],
    };
    expect(lines.map((line) => line["msg"])).toEqual([
      // Registry order: `neon.usage_probe` is consumed before `db.backup_verify`.
      "job.start",
      "job.failed",
      "job.rejected",
      "job.start",
      "job.finish",
    ]);
    for (const line of lines) {
      const msg = String(line["msg"]);
      expect(Object.keys(line).sort(), msg).toEqual(expected[msg]?.sort());
    }
    const text = JSON.stringify(lines);
    expect(text).not.toContain("backups/2026/10/14");
    expect(text).not.toContain("example.test");
  });
});

describe("runTick — each job settled exactly once", () => {
  it("runs maintenance, completes a valid job after its handler, and fetches only queues with a handler", async () => {
    const fake = fakeBoss({
      "retention.sweep": [{ id: "j1", data: envelope({ dryRun: true }) }],
      "neon.usage_probe": [{ id: "j2", data: envelope({}) }],
    });
    const handler = vi.fn(async () => undefined);
    const counts = await runTick(
      fake.boss,
      { "retention.sweep": handler },
      { log: quiet() },
    );
    expect(fake.raw.supervise).toHaveBeenCalledTimes(1);
    expect(fake.fetched).toEqual(["retention.sweep"]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { dryRun: true },
      { jobId: "j1", requestId: "system:test", retryCount: 0, queue: queueDb },
    );
    expect(fake.settled).toEqual(["complete:retention.sweep:j1"]);
    expect(counts).toEqual({
      fetched: 1,
      completed: 1,
      failed: 0,
      rejected: 0,
    });
  });

  it("cancels a job whose envelope fails the registry, and never calls its handler", async () => {
    const fake = fakeBoss({
      "db.backup_verify": [
        { id: "bad", data: envelope({ objectKey: 9 }) },
        { id: "old", data: envelope({ objectKey: "k" }, 0) },
        { id: "good", data: envelope({ objectKey: "k" }) },
      ],
    });
    const handler = vi.fn(async () => undefined);
    const counts = await runTick(
      fake.boss,
      { "db.backup_verify": handler },
      { log: quiet() },
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { objectKey: "k" },
      {
        jobId: "good",
        requestId: "system:test",
        retryCount: 0,
        queue: queueDb,
      },
    );
    expect(fake.settled).toEqual([
      "cancel:db.backup_verify:bad",
      "cancel:db.backup_verify:old",
      "complete:db.backup_verify:good",
    ]);
    expect(counts).toEqual({
      fetched: 3,
      completed: 1,
      failed: 0,
      rejected: 2,
    });
  });

  it("fails a job whose handler throws, recording only the error class", async () => {
    const fake = fakeBoss({
      "neon.usage_probe": [{ id: "j3", data: envelope({}) }],
    });
    const lines: string[] = [];
    const counts = await runTick(
      fake.boss,
      {
        "neon.usage_probe": async () => {
          throw new TypeError("secret detail buyer@example.test");
        },
      },
      {
        log: createLogger({
          level: "debug",
          write: (line) => lines.push(line),
        }),
      },
    );
    expect(fake.settled).toEqual([
      'fail:neon.usage_probe:j3:{"error":"TypeError"}',
    ]);
    expect(counts).toEqual({
      fetched: 1,
      completed: 0,
      failed: 1,
      rejected: 0,
    });
    expect(lines.join("\n")).not.toContain("secret detail");
    expect(lines.join("\n")).toContain('"error_class":"TypeError"');
  });

  it("fetches in batches of TICK_BATCH_SIZE unless told otherwise", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `m${String(i)}`,
      data: envelope({}),
    }));
    const fake = fakeBoss({ "neon.usage_probe": many });
    const counts = await runTick(
      fake.boss,
      { "neon.usage_probe": async () => undefined },
      { log: quiet() },
    );
    expect(counts.fetched).toBe(runtime.TICK_BATCH_SIZE);
    expect(fake.raw.fetch).toHaveBeenCalledWith("neon.usage_probe", {
      batchSize: runtime.TICK_BATCH_SIZE,
    });
  });

  it("the production map handles media.derive_variants (TASK-082), retention.sweep (TASK-025), outbox.dispatch (TASK-254), payments.production_start (TASK-258), payments.monitor (TASK-264), order.close_sweep (TASK-369), spec 016's six routing jobs (TASK-328, TASK-329), spec 030a's payouts.prepaid_ready (TASK-363), payouts.close and payouts.watch (TASK-364), payouts.statement_email (TASK-365), spec 018's invoice.render and invoice.render_sweep (TASK-342), spec 016's webhook.resend.process (TASK-335) and invoice.email (TASK-334), spec 020a's notifications.resend (TASK-360), and spec 030b's payments.balance_fetch and payments.balance_sweep (TASK-439), spec 025's four alerts.* jobs (TASK-488, TASK-489), spec 034's two basket-reminders.* jobs (TASK-450), nothing else yet", async () => {
    const { JOB_HANDLERS } = await import("../../src/jobs/handlers");
    expect(Object.keys(JOB_HANDLERS).sort()).toEqual([
      "alerts.daily_summary",
      "alerts.dispatch",
      "alerts.escalate",
      "alerts.monitor",
      "assignment.photo_remind",
      "assignment.remind",
      "assignment.timeout",
      "basket-reminders.scan",
      "basket-reminders.send",
      "invoice.email",
      "invoice.render",
      "invoice.render_sweep",
      "media.derive_variants",
      "notifications.resend",
      "order.close_sweep",
      "order.no_partner_expire",
      "order.route",
      "outbox.dispatch",
      "payments.balance_fetch",
      "payments.balance_sweep",
      "payments.monitor",
      "payments.production_start",
      "payouts.close",
      "payouts.prepaid_ready",
      "payouts.statement_email",
      "payouts.watch",
      "retention.sweep",
      "routing.sla_watch",
      "webhook.resend.process",
    ]);
  });

  it("does nothing but maintenance with no handlers", async () => {
    const fake = fakeBoss({
      "retention.sweep": [{ id: "w", data: envelope({}) }],
    });
    const counts = await runTick(fake.boss, {}, { log: quiet() });
    expect(fake.fetched).toEqual([]);
    expect(fake.settled).toEqual([]);
    expect(counts).toEqual({
      fetched: 0,
      completed: 0,
      failed: 0,
      rejected: 0,
    });
    expect(fake.raw.supervise).toHaveBeenCalledTimes(1);
  });
});

describe("enqueue — the minute tick's singletonKey (spec 022a §5.2, TASK-369)", () => {
  it("passes singletonKey with a one-minute window only when asked, and the plain send otherwise", async () => {
    const send = vi.fn(async () => "job-id");
    const boss = { send } as never;
    await runtime.enqueue(
      boss,
      "order.close_sweep",
      {},
      { requestId: "system:jobs.tick", singletonKey: "order.close_sweep" },
    );
    await runtime.enqueue(
      boss,
      "outbox.dispatch",
      {},
      { requestId: "system:jobs.tick" },
    );
    expect(send.mock.calls).toEqual([
      [
        "order.close_sweep",
        { v: 1, requestId: "system:jobs.tick", payload: {} },
        { singletonKey: "order.close_sweep", singletonSeconds: 60 },
      ],
      ["outbox.dispatch", { v: 1, requestId: "system:jobs.tick", payload: {} }],
    ]);
  });

  it("spec 030a's hourly jobs pass a one-hour window instead of the minute (TASK-364)", async () => {
    const send = vi.fn(async () => "job-id");
    const boss = { send } as never;
    await runtime.enqueue(
      boss,
      "payouts.close",
      {},
      {
        requestId: "system:jobs.tick",
        singletonKey: "payouts.close",
        singletonSeconds: 3600,
      },
    );
    expect(send.mock.calls).toEqual([
      [
        "payouts.close",
        { v: 1, requestId: "system:jobs.tick", payload: {} },
        { singletonKey: "payouts.close", singletonSeconds: 3600 },
      ],
    ]);
  });

  it("on spec 016's short queues the key alone dedupes (no one-minute window) and startAfter is passed through (TASK-328)", async () => {
    const send = vi.fn(async () => "job-id");
    const boss = { send } as never;
    const orderId = "0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
    const at = new Date("2026-11-03T06:30:00Z");
    await runtime.enqueue(
      boss,
      "order.route",
      { orderId },
      { requestId: "system:routing", singletonKey: orderId, startAfter: at },
    );
    await runtime.enqueue(
      boss,
      "order.route",
      { orderId },
      { requestId: "system:routing", singletonKey: orderId },
    );
    expect(send.mock.calls).toEqual([
      [
        "order.route",
        { v: 1, requestId: "system:routing", payload: { orderId } },
        { singletonKey: orderId, startAfter: at },
      ],
      [
        "order.route",
        { v: 1, requestId: "system:routing", payload: { orderId } },
        { singletonKey: orderId },
      ],
    ]);
  });

  it("spec 018's invoice.render: the key alone on its exclusive queue, with its retry limit; invoice.email keyed alone (TASK-342)", async () => {
    const send = vi.fn(async () => "job-id");
    const boss = { send } as never;
    const invoiceId = "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b";
    await runtime.enqueue(
      boss,
      "invoice.render",
      { invoiceId },
      { requestId: "system:invoices", singletonKey: invoiceId },
    );
    await runtime.enqueue(
      boss,
      "invoice.email",
      { invoiceId },
      {
        requestId: "system:invoices",
        singletonKey: `invoice.email:${invoiceId}`,
      },
    );
    expect(send.mock.calls).toEqual([
      [
        "invoice.render",
        { v: 1, requestId: "system:invoices", payload: { invoiceId } },
        { singletonKey: invoiceId, retryLimit: 4 },
      ],
      [
        "invoice.email",
        { v: 1, requestId: "system:invoices", payload: { invoiceId } },
        // Spec 016 §5.2 (TASK-334): B8 retries outlast B1's 5-minute wait for the invoice.
        { singletonKey: `invoice.email:${invoiceId}`, retryLimit: 15 },
      ],
    ]);
  });

  it("hands a job's retryCount to its handler (spec 018's fifth-attempt alert, TASK-342)", async () => {
    const fake = fakeBoss({
      "retention.sweep": [
        {
          id: "r",
          data: envelope({ dryRun: true }),
          retryCount: 4,
          queue: queueDb,
        } as never,
      ],
    });
    const handler = vi.fn(async () => undefined);
    await runTick(fake.boss, { "retention.sweep": handler }, { log: quiet() });
    expect(handler).toHaveBeenCalledWith(
      { dryRun: true },
      { jobId: "r", requestId: "system:test", retryCount: 4, queue: queueDb },
    );
  });
});
