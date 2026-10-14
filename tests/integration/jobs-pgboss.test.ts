/**
 * T-21 — pg-boss in schema `pgboss`, enqueue → consume exactly once, a payload that fails its zod
 * schema refused before the handler runs (spec 002 AC-21; TASK-024). Plus the database half of
 * T-23: `probeDbHealth` reports the newest applied migration and the waiting jobs.
 *
 * Everything runs through the real runtime (`src/jobs/runtime.ts`) on a scratch database migrated
 * by the real runner, and pg-boss connects as a **login that is not a superuser** — a member of
 * `app_owner` and `app_web` with `INHERIT`, the shape of Neon's database-owner login (`0001`) —
 * so "pg-boss runs without DDL rights it was not given" is tested rather than assumed. Local,
 * disposable server only (`support/scratch-db.ts`).
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DECLARED_JOBS,
  JobPayloadError,
  REGISTERED_JOB_NAMES,
  REGISTERED_JOBS,
} from "../../src/jobs/index.ts";
import {
  enqueue,
  ensureQueues,
  probeDbHealth,
  runTick,
  withBoss,
  type JobHandlers,
} from "../../src/jobs/runtime.ts";
import { createLogger, type Logger } from "../../src/lib/logger.ts";
import { MIGRATIONS_DIR } from "../../scripts/db-check.ts";
import { readMigrations } from "../../scripts/db-migrate.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** The real logger with a capturing sink, so a test reads exactly the lines a tick would write. */
function recordingLogger(): Logger & { lines: { msg: string }[] } {
  const lines: { msg: string }[] = [];
  const log = createLogger({
    level: "debug",
    write: (line) => {
      lines.push(JSON.parse(line) as { msg: string });
    },
  });
  return Object.assign(log, { lines });
}

/** The pg-boss schema version the installed library expects (its `package.json`). */
const EXPECTED_SCHEMA_VERSION = (
  JSON.parse(
    readFileSync(
      resolve(REPO_ROOT, "node_modules/pg-boss/package.json"),
      "utf8",
    ),
  ) as { pgboss: { schema: number } }
).pgboss.schema;

/** The newest migration in `db/migrations/`, as the runner records it (`NNNN_name`). */
const NEWEST_MIGRATION = (() => {
  const all = readMigrations(resolve(REPO_ROOT, MIGRATIONS_DIR));
  const last = all[all.length - 1];
  return last === undefined ? "" : `${last.version}_${last.name}`;
})();

describe.skipIf(server.url === undefined)(
  `T-21 — pg-boss bootstrapped by 0012, jobs through the registry${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let login: string;
    let loginUrl: string;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "jobs");
      login = `fo_it_jobs_${randomBytes(4).toString("hex")}`;
      await scratch.sql.unsafe(
        `CREATE ROLE ${login} LOGIN PASSWORD 'it' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
      );
      await scratch.sql.unsafe(
        `GRANT app_owner TO ${login} WITH INHERIT TRUE, SET TRUE`,
      );
      await scratch.sql.unsafe(
        `GRANT app_web TO ${login} WITH INHERIT TRUE, SET TRUE`,
      );
      await scratch.sql.unsafe(
        `GRANT CONNECT ON DATABASE "${scratch.name}" TO ${login}`,
      );
      // The runner's bookkeeping table belongs to the login that ran the migrations; on Neon that
      // is the same login pg-boss uses. Here the superuser ran them, so read access is granted.
      await scratch.sql.unsafe(
        `GRANT SELECT ON public.schema_migrations TO ${login}`,
      );
      const url = new URL(scratch.url);
      url.username = login;
      url.password = "it";
      loginUrl = url.toString();
    }, 600_000);

    afterAll(async () => {
      await scratch.sql.unsafe(
        `REVOKE ALL ON public.schema_migrations FROM ${login}`,
      );
      await scratch.drop();
      const admin = postgres(server.url as string, {
        max: 1,
        onnotice: () => undefined,
      });
      await admin.unsafe(`DROP ROLE IF EXISTS ${login}`);
      await admin.end({ timeout: 5 });
    });

    it("AC-21: schema pgboss exists, owned by app_owner, at the version the installed pg-boss expects", async () => {
      const [schema] = await scratch.sql<{ owner: string }[]>`
        SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = 'pgboss'`;
      expect(schema).toEqual({ owner: "app_owner" });
      // `migrate: false`: `start()` only checks the version and throws on a mismatch, so a start
      // that resolves *is* the assertion that 0012 installed what this pg-boss expects.
      const report = await withBoss(
        async (boss) => ({
          version: await boss.schemaVersion(),
          drift: await boss.detectSchemaDrift(),
        }),
        { connectionString: loginUrl },
      );
      expect(report.version).toBe(EXPECTED_SCHEMA_VERSION);
      expect(report.drift).toMatchObject({ ok: true });
    });

    it("AC-21: a start refuses a schema at another version instead of migrating it", async () => {
      await scratch.sql`UPDATE pgboss.version SET version = version - 1`;
      try {
        await expect(
          withBoss(async () => "started", { connectionString: loginUrl }),
        ).rejects.toThrow(/requires migrations/);
      } finally {
        await scratch.sql`UPDATE pgboss.version SET version = version + 1`;
      }
      const [row] = await scratch.sql<{ version: number }[]>`
        SELECT version FROM pgboss.version`;
      expect(row?.version).toBe(EXPECTED_SCHEMA_VERSION);
    });

    it("creates a queue for every registered job and for no declared-only name", async () => {
      await withBoss(
        async (boss) => {
          await ensureQueues(boss);
          await ensureQueues(boss); // idempotent
        },
        { connectionString: loginUrl },
      );
      const queues = (
        await scratch.sql<
          { name: string }[]
        >`SELECT name FROM pgboss.queue ORDER BY name`
      ).map((row) => row.name);
      expect(queues).toEqual([...REGISTERED_JOB_NAMES].sort());
      for (const name of DECLARED_JOBS) expect(queues).not.toContain(name);
    });

    it("T-21: a job enqueued and consumed completes exactly once", async () => {
      const seen: { payload: unknown; requestId: string }[] = [];
      const handlers: JobHandlers = {
        "retention.sweep": async (payload, context) => {
          seen.push({ payload, requestId: context.requestId });
        },
      };
      const log = recordingLogger();
      const { id, first, second } = await withBoss(
        async (boss) => {
          await ensureQueues(boss);
          const jobId = await enqueue(
            boss,
            "retention.sweep",
            {},
            {
              requestId: "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b",
            },
          );
          return {
            id: jobId,
            first: await runTick(boss, handlers, { log }),
            second: await runTick(boss, handlers, { log }),
          };
        },
        { connectionString: loginUrl },
      );
      expect(first).toEqual({
        fetched: 1,
        completed: 1,
        failed: 0,
        rejected: 0,
      });
      expect(second).toEqual({
        fetched: 0,
        completed: 0,
        failed: 0,
        rejected: 0,
      });
      // The default was applied by the schema, and the request id travelled in the envelope.
      expect(seen).toEqual([
        {
          payload: { dryRun: false },
          requestId: "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b",
        },
      ]);
      const [row] = await scratch.sql<{ state: string; data: unknown }[]>`
        SELECT state::text AS state, data FROM pgboss.job WHERE id = ${id ?? ""}`;
      expect(row).toEqual({
        state: "completed",
        data: {
          v: REGISTERED_JOBS["retention.sweep"].version,
          requestId: "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b",
          payload: { dryRun: false },
        },
      });
      expect(log.lines.map((line) => line.msg)).toEqual([
        "job.start",
        "job.finish",
      ]);
    });

    it("T-21: enqueue refuses a payload that fails its schema, and a declared-only name, writing nothing", async () => {
      const before = await scratch.sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM pgboss.job`;
      const errors = await withBoss(
        async (boss) => {
          const caught: unknown[] = [];
          for (const attempt of [
            () =>
              enqueue(
                boss,
                "db.backup_verify",
                { objectKey: "" },
                { requestId: "system:test" },
              ),
            () =>
              enqueue(
                boss,
                "retention.sweep",
                { dryRun: "yes" } as unknown as { dryRun: boolean },
                { requestId: "system:test" },
              ),
            () =>
              enqueue(
                boss,
                "order.route" as unknown as "retention.sweep",
                {},
                { requestId: "system:test" },
              ),
          ]) {
            try {
              await attempt();
              caught.push(undefined);
            } catch (error) {
              caught.push(error);
            }
          }
          return caught;
        },
        { connectionString: loginUrl },
      );
      expect(
        errors.map((e) => (e instanceof JobPayloadError ? e.reason : e)),
      ).toEqual(["payload_invalid", "payload_invalid", "not_registered"]);
      const after = await scratch.sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM pgboss.job`;
      expect(after[0]?.n).toBe(before[0]?.n);
    });

    it("T-21: a stored job whose payload fails the registered schema is refused before the handler runs", async () => {
      let calls = 0;
      const handlers: JobHandlers = {
        "db.backup_verify": async () => {
          calls += 1;
        },
      };
      const log = recordingLogger();
      const { ids, counts } = await withBoss(
        async (boss) => {
          await ensureQueues(boss);
          // Written past `enqueue`, the way an older deployment or a hand-made row would arrive.
          const bad = await boss.send("db.backup_verify", {
            v: 1,
            requestId: "system:test",
            payload: { objectKey: 42 },
          });
          const oldVersion = await boss.send("db.backup_verify", {
            v: 0,
            requestId: "system:test",
            payload: { objectKey: "backups/2026/10/14/fo.dump" },
          });
          return {
            ids: [bad, oldVersion],
            counts: await runTick(boss, handlers, { log }),
          };
        },
        { connectionString: loginUrl },
      );
      expect(calls).toBe(0);
      expect(counts).toEqual({
        fetched: 2,
        completed: 0,
        failed: 0,
        rejected: 2,
      });
      const states = await scratch.sql<{ state: string }[]>`
        SELECT state::text AS state FROM pgboss.job WHERE id = ANY(${ids as string[]}::uuid[])`;
      expect(states.map((row) => row.state)).toEqual([
        "cancelled",
        "cancelled",
      ]);
      // The refusal is logged by path and code only: no payload value reaches a log line.
      const text = JSON.stringify(log.lines);
      expect(text).toContain("payload.objectKey:invalid_type");
      expect(text).not.toContain("backups/2026/10/14");
    });

    it("a handler that throws fails the job (pg-boss retries it), and the tick still answers", async () => {
      const handlers: JobHandlers = {
        "neon.usage_probe": async () => {
          throw new RangeError("boom");
        },
      };
      const counts = await withBoss(
        async (boss) => {
          await ensureQueues(boss);
          await enqueue(
            boss,
            "neon.usage_probe",
            {},
            { requestId: "system:test" },
          );
          return runTick(boss, handlers, { log: recordingLogger() });
        },
        { connectionString: loginUrl },
      );
      expect(counts).toEqual({
        fetched: 1,
        completed: 0,
        failed: 1,
        rejected: 0,
      });
      const [row] = await scratch.sql<{ state: string; output: unknown }[]>`
        SELECT state::text AS state, output FROM pgboss.job WHERE name = 'neon.usage_probe'`;
      expect(row?.state).toBe("retry");
      expect(row?.output).toEqual({ error: "RangeError" });
    });

    it("T-23 (database half): probeDbHealth reports the newest applied migration and the waiting jobs", async () => {
      await scratch.sql`DELETE FROM pgboss.job`;
      const health = await withBoss(
        async (boss) => {
          await ensureQueues(boss);
          await enqueue(
            boss,
            "media.derive_variants",
            { assetId: "a1", reason: "upload" },
            {
              requestId: "system:test",
            },
          );
          await enqueue(
            boss,
            "media.derive_variants",
            { assetId: "a2", reason: "backfill" },
            {
              requestId: "system:test",
            },
          );
          return probeDbHealth(boss);
        },
        { connectionString: loginUrl },
      );
      const [newest] = await scratch.sql<{ latest: string }[]>`
        SELECT version || '_' || name AS latest FROM public.schema_migrations
        ORDER BY version DESC LIMIT 1`;
      expect(newest?.latest).toBe(NEWEST_MIGRATION);
      expect(health.latest_migration).toBe(newest?.latest);
      expect(health.pending_jobs).toBe(2);
      expect(health.latency_ms).toBeGreaterThanOrEqual(0);
    });
  },
);
