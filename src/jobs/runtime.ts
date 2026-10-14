/**
 * The pg-boss runtime (spec 002 §2 "Jobs, storage seam, probes", §5.2, §11, §13 Q6, AC-21, AC-23;
 * `plan/08` §5; TASK-024).
 *
 * pg-boss runs over **`DATABASE_URL_UNPOOLED`** and never the pooled URL (§13 Q6): Neon's pooler
 * is PgBouncer in transaction mode, which has no session state, no session advisory locks and no
 * `LISTEN/NOTIFY`. The connecting login is a member of `app_owner` (`0001`), which owns schema
 * `pgboss` (`0012`); `app_web`, the role every web transaction enters, holds nothing inside it.
 *
 * pg-boss is configured to do **no DDL and run no timers** in this process:
 *
 *  - `migrate: false`, `createSchema: false` — the schema is migration `0012`'s. `start()` then
 *    only checks the installed schema version and throws `pg-boss database requires migrations`
 *    when the library expects another one, so a pg-boss upgrade without its migration fails the
 *    first tick and `/api/internal/db-health` loudly instead of rewriting the schema in a deploy;
 *  - `supervise`, `schedule`, `registerInstance`, `persistQueueStats`, `reindex`, `monitorVacuum`
 *    and `useListenNotify` off — no background interval queries the database. Neon Free caps
 *    compute hours (ADR-0015, spec 002 §5.4), and an idle web process that polled every few
 *    seconds would keep the compute awake forever. Maintenance runs on demand inside the minute
 *    tick instead (`boss.supervise()`, `runTick`), and the instance lives for one request:
 *    `withBoss` starts it, hands it over, and stops it, closing its pool.
 *
 * Every job crosses the registry (`./index.ts`) in both directions: `enqueue` refuses a payload
 * that fails its registered schema before anything is written, and `runTick` refuses a stored
 * envelope that fails it before the handler runs (AC-21).
 *
 * Logging (§8, §11): job name, job id, counts, durations and closed-set reasons — never a payload,
 * because a payload may one day carry an order id next to a recipient's city.
 */
import { PgBoss, type ConstructorOptions } from "pg-boss";

import { logger as defaultLogger, type Logger } from "../lib/logger";

import {
  REGISTERED_JOB_NAMES,
  buildJobData,
  parseJobData,
  type JobPayload,
  type JobPayloadInput,
  type RegisteredJobName,
} from "./index";

/** The schema `0012_pgboss.sql` creates. */
export const PGBOSS_SCHEMA = "pgboss";

/** Jobs fetched per queue per tick. Small: a tick is one HTTP request with a bounded budget. */
export const TICK_BATCH_SIZE = 5;

/**
 * The constructor options, in one place so the unit test can pin every switch that keeps pg-boss
 * from issuing DDL or arming a timer (see the header).
 */
export function bossOptions(connectionString: string): ConstructorOptions {
  return {
    connectionString,
    schema: PGBOSS_SCHEMA,
    application_name: "fo-jobs",
    // One request at a time uses it; two connections cover a fetch beside a complete.
    max: 2,
    // A probe that cannot connect answers 503 within the request, rather than hanging on a host
    // that never refuses.
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
  };
}

/** The unpooled URL from the env contract, read only when a job runtime is actually needed. */
async function unpooledUrl(): Promise<string> {
  const { env } = await import("../lib/env");
  return env.DATABASE_URL_UNPOOLED;
}

export interface WithBossOptions {
  /** Defaults to `DATABASE_URL_UNPOOLED`; the integration suite passes a scratch database. */
  readonly connectionString?: string;
  readonly log?: Logger;
}

/**
 * Starts a pg-boss instance, runs `fn` with it, and stops it — pool closed, nothing left armed —
 * whether the start was refused, `fn` resolved, or `fn` threw. A failed stop is logged, never
 * allowed to mask the start's or `fn`'s own error.
 */
export async function withBoss<T>(
  fn: (boss: PgBoss) => Promise<T>,
  options: WithBossOptions = {},
): Promise<T> {
  const log = options.log ?? defaultLogger;
  const boss = new PgBoss(
    bossOptions(options.connectionString ?? (await unpooledUrl())),
  );
  // An EventEmitter with no `error` listener throws on emit; pg-boss emits background errors.
  boss.on("error", (error: Error) => {
    log.error(
      { job_runtime: "pg-boss", error_class: error.name },
      "jobs.error",
    );
  });
  // `start()` inside the `try`: a refused start (a schema version pg-boss does not expect) has
  // already opened the pool, and pg-boss documents that `stop()` must still run to release it.
  try {
    await boss.start();
    return await fn(boss);
  } finally {
    await boss
      .stop({ graceful: false, close: true, timeout: 1_000 })
      .catch((error: unknown) => {
        log.warn(
          {
            job_runtime: "pg-boss",
            error_class: error instanceof Error ? error.name : "Error",
          },
          "jobs.stop_failed",
        );
      });
  }
}

/**
 * Creates the queue of every **registered** job and of nothing else; declared-only names get a
 * queue when their spec implements them. Idempotent (`ON CONFLICT DO NOTHING` in pg-boss), and no
 * DDL: every queue shares `pgboss.job_common`.
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of REGISTERED_JOB_NAMES) {
    await boss.createQueue(name);
  }
}

export interface EnqueueOptions {
  /** The enqueuing request's `x-request-id`, or `system:{job}`. */
  readonly requestId: string;
}

/**
 * Enqueues one job after validating its payload against the registry. Throws `JobPayloadError`
 * for a declared-only name or an invalid payload, and writes nothing then. Returns the job id.
 */
export async function enqueue<Name extends RegisteredJobName>(
  boss: PgBoss,
  name: Name,
  payload: JobPayloadInput<Name>,
  options: EnqueueOptions,
): Promise<string | null> {
  const data = buildJobData(name, payload, options.requestId);
  return boss.send(name, data);
}

/** What a handler receives besides its payload. */
export interface JobContext {
  readonly jobId: string;
  /** From the envelope: the request that enqueued the job (spec 002 §11). */
  readonly requestId: string;
}

export type JobHandler<Name extends RegisteredJobName> = (
  payload: JobPayload<Name>,
  context: JobContext,
) => Promise<void>;

/** Handlers by registered name. A name with no handler is not consumed; its jobs wait. */
export type JobHandlers = {
  readonly [Name in RegisteredJobName]?: JobHandler<Name>;
};

/** The counts a tick returns (spec 002 §5.2: "returns counts only"). */
export interface TickCounts {
  /** Jobs fetched across every queue that has a handler. */
  readonly fetched: number;
  /** Handled and completed, each exactly once. */
  readonly completed: number;
  /** The handler threw; pg-boss retries per the queue's policy. */
  readonly failed: number;
  /** Refused before the handler ran (envelope or payload failed its schema); cancelled. */
  readonly rejected: number;
}

export interface TickOptions {
  readonly batchSize?: number;
  readonly log?: Logger;
}

/**
 * One minute-cron tick (`plan/08` §5): pg-boss maintenance on demand, then, for every registered
 * queue that has a handler, fetch a batch and settle each job exactly once — `complete` after its
 * handler resolved, `fail` when it threw, `cancel` when its stored envelope fails the registry
 * (the handler never sees it, and a cancelled job is not retried into the same refusal).
 */
export async function runTick(
  boss: PgBoss,
  handlers: JobHandlers,
  options: TickOptions = {},
): Promise<TickCounts> {
  const log = options.log ?? defaultLogger;
  const batchSize = options.batchSize ?? TICK_BATCH_SIZE;
  let fetched = 0;
  let completed = 0;
  let failed = 0;
  let rejected = 0;

  await boss.supervise();

  for (const name of REGISTERED_JOB_NAMES) {
    const handler = handlers[name] as JobHandler<typeof name> | undefined;
    if (handler === undefined) continue;
    const jobs = await boss.fetch<unknown>(name, { batchSize });
    for (const job of jobs) {
      fetched += 1;
      const parsed = parseJobData(name, job.data);
      if (!parsed.ok) {
        await boss.cancel(name, job.id);
        rejected += 1;
        log.warn(
          {
            job: name,
            job_id: job.id,
            reason: parsed.reason,
            issues: parsed.issues,
          },
          "job.rejected",
        );
        continue;
      }
      const startedAt = Date.now();
      const actor = `system:${name}`;
      log.info(
        {
          job: name,
          job_id: job.id,
          actor,
          origin_request_id: parsed.envelope.requestId,
        },
        "job.start",
      );
      try {
        await handler(parsed.envelope.payload as JobPayload<typeof name>, {
          jobId: job.id,
          requestId: parsed.envelope.requestId,
        });
      } catch (error) {
        await boss.fail(name, job.id, {
          error: error instanceof Error ? error.name : "Error",
        });
        failed += 1;
        log.warn(
          {
            job: name,
            job_id: job.id,
            actor,
            duration_ms: Date.now() - startedAt,
            error_class: error instanceof Error ? error.name : "Error",
          },
          "job.failed",
        );
        continue;
      }
      await boss.complete(name, job.id);
      completed += 1;
      log.info(
        {
          job: name,
          job_id: job.id,
          actor,
          duration_ms: Date.now() - startedAt,
        },
        "job.finish",
      );
    }
  }

  return { fetched, completed, failed, rejected };
}

/** What `/api/internal/db-health` reports, before the HTTP envelope. */
export interface DbHealthData {
  readonly latency_ms: number;
  readonly latest_migration: string;
  readonly pending_jobs: number;
}

/**
 * The database probe of `/api/internal/db-health` (spec 002 §5.2, AC-23), over pg-boss's own
 * unpooled connection: the round trip of `SELECT 1`, the newest migration the runner recorded in
 * `public.schema_migrations` (`NNNN_name`, the migration's filename stem), and the jobs waiting
 * to run (`created` or `retry`) — "the cheap signal that the minute tick has stopped" (§11).
 * pg-boss's own version check already ran in `withBoss`'s `start()`.
 */
export async function probeDbHealth(boss: PgBoss): Promise<DbHealthData> {
  const db = boss.getDb();
  const startedAt = performance.now();
  await db.executeSql("SELECT 1");
  const latency = Math.round((performance.now() - startedAt) * 100) / 100;
  const migration = await db.executeSql(
    "SELECT version || '_' || name AS latest FROM public.schema_migrations ORDER BY version DESC LIMIT 1",
  );
  const pending = await db.executeSql(
    `SELECT count(*)::int AS n FROM ${PGBOSS_SCHEMA}.job WHERE state < 'active'`,
  );
  const latest: unknown = migration.rows[0]?.latest;
  const count: unknown = pending.rows[0]?.n;
  return {
    latency_ms: latency,
    latest_migration: typeof latest === "string" ? latest : "",
    pending_jobs: typeof count === "number" ? count : 0,
  };
}
