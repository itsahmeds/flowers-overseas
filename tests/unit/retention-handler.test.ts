/**
 * The production `retention.sweep` handler (`src/jobs/handlers.ts`; spec 002 AC-20; TASK-025,
 * breaker hole 1 on PR 245): the job's `dryRun` reaches the sweep, the sweep runs as `system`
 * under the job's own name, and a dry run issues no `UPDATE`, `DELETE` or `INSERT`.
 *
 * `withSystemContext` is replaced by one that hands the handler a recording database whose
 * reads return a policy table and one due row per count, so a sweep that ignored `dryRun` would
 * issue the `DELETE`s of `fraud_signals` and `consent_records` here.
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dialect = new PgDialect();
const executed: string[] = [];
const contexts: string[] = [];

const POLICIES = [
  { key: "consent_records", retention_days: 1825, action: "delete" },
  { key: "fraud_signals", retention_days: 365, action: "delete" },
  { key: "invoice_archive", retention_days: 3650, action: "keep" },
];

vi.mock("../../src/lib/db", () => ({
  withSystemContext: async (
    job: string,
    fn: (db: { execute: (query: SQL) => Promise<unknown> }) => Promise<unknown>,
  ) => {
    contexts.push(job);
    return fn({
      async execute(query: SQL) {
        const text = dialect.sqlToQuery(query).sql;
        executed.push(text);
        if (text.includes("FROM public.retention_policy")) return POLICIES;
        if (text.includes("count(*)")) return [{ count: 1 }];
        return [];
      },
    });
  },
}));

const writes = () =>
  executed.filter((text) => /^\s*(UPDATE|DELETE|INSERT)\b/i.test(text));

describe("JOB_HANDLERS['retention.sweep'] (AC-20, hole 1)", () => {
  beforeEach(() => {
    executed.length = 0;
    contexts.length = 0;
  });

  it("a dry run reads and writes nothing", async () => {
    const { JOB_HANDLERS } = await import("../../src/jobs/handlers");
    await JOB_HANDLERS["retention.sweep"]?.(
      { dryRun: true },
      { jobId: "j1", requestId: "system:test" },
    );
    expect(contexts).toEqual(["retention.sweep"]);
    expect(executed.length).toBeGreaterThan(0);
    expect(writes()).toEqual([]);
  });

  it("a real run deletes what is due", async () => {
    const { JOB_HANDLERS } = await import("../../src/jobs/handlers");
    await JOB_HANDLERS["retention.sweep"]?.(
      { dryRun: false },
      { jobId: "j2", requestId: "system:test" },
    );
    expect(writes().length).toBe(2);
  });
});
