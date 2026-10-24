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
      "db.backup_verify",
      "media.derive_variants",
      "neon.usage_probe",
      "order.close_sweep",
      "outbox.dispatch",
      "retention.sweep",
    ]);
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
      { jobId: "j1", requestId: "system:test" },
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
      { jobId: "good", requestId: "system:test" },
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

  it("the production map handles retention.sweep (TASK-025), outbox.dispatch (TASK-254) and order.close_sweep (TASK-369), nothing else yet", async () => {
    const { JOB_HANDLERS } = await import("../../src/jobs/handlers");
    expect(Object.keys(JOB_HANDLERS).sort()).toEqual([
      "order.close_sweep",
      "outbox.dispatch",
      "retention.sweep",
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
});
