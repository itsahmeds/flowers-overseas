/**
 * Integration suite placeholder (spec 001 §2 "Testing harness", AC-16 / T-17, TASK-008).
 *
 * `pnpm test:integration` must exit 0 today with the suite *reported as skipped*, and the
 * `postgres:16` service container must already start in CI, so spec 002 only has to delete the
 * `.skip` and write queries.
 *
 * TODO(spec 002 — schema, Drizzle, migrations, RLS): replace this with real coverage —
 * migrations apply and roll back against `DATABASE_URL`, generated types match the schema, RLS
 * denies anonymous reads — and drop the `.skip`. Until then nothing here connects to Postgres.
 */
import { describe, expect, it } from "vitest";

describe.skip("integration (spec 002)", () => {
  it("connects to the database named by DATABASE_URL", () => {
    expect(process.env.DATABASE_URL).toBeDefined();
  });
});
