/**
 * T-26 (connected half) — `pnpm db:check` against a migrated database: every failure mode of
 * AC-26 (and AC-5, AC-22, AC-27 over the live catalogue) made by a temporary fixture exits
 * non-zero with the offender named, one line per problem; the clean tree exits 0 and prints the
 * applied-migration count and the RLS coverage (spec 002 AC-26; TASK-027).
 *
 * Each fixture is DDL inside a transaction that is rolled back, so the cases are independent and
 * the scratch database stays the merged tree's. The offline half (missing rollback, duplicate
 * version) is `tests/unit/db-check.test.ts`; the CLI is run here once each way for its exit code.
 * Local, disposable server only (`support/scratch-db.ts`).
 */
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as committedMirror from "../../db/schema/index.ts";
import { recipientEmailViolations } from "../../scripts/db-check.ts";
import {
  SNAPSHOT_FILE,
  liveCheck,
  readSnapshot,
  type CatalogueSnapshot,
} from "../../scripts/db-check-live.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);

describe.skipIf(server.url === undefined)(
  `T-26 — db:check, connected half${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let snapshot: CatalogueSnapshot;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "dbcheck");
      snapshot = readSnapshot(resolve(REPO_ROOT, SNAPSHOT_FILE));
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    /** The problems `db:check` reports after `ddl` runs, in a transaction rolled back after. */
    async function problemsAfter(ddl: string): Promise<readonly string[]> {
      return rolledBack(scratch.sql, async (tx: Tx) => {
        await tx.unsafe(ddl);
        const result = await liveCheck(
          tx,
          committedMirror,
          snapshot,
          recipientEmailViolations,
        );
        return result.problems;
      });
    }

    it("the merged tree is clean and reports the applied migrations and the RLS coverage", async () => {
      const result = await liveCheck(
        scratch.sql,
        committedMirror,
        snapshot,
        recipientEmailViolations,
      );
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.summary[0]).toMatch(
        /^applied migrations: \d+ \(latest \d{4}_[a-z0-9_]+\)$/,
      );
      expect(result.summary[1]).toMatch(
        /^RLS coverage: (\d+)\/\1 tables with RLS enabled and a policy \(1 exempt: schema_migrations\)$/,
      );
    });

    it.each([
      [
        "a column in a migration but not in db/schema",
        "ALTER TABLE public.country ADD COLUMN extra_note text",
        "drift: column public.country.extra_note exists in the database but is not declared in db/schema",
      ],
      [
        "a column in db/schema but not in a migration",
        "ALTER TABLE public.country DROP COLUMN guide_published",
        "drift: column public.country.guide_published is declared in db/schema but no migration creates it",
      ],
      [
        "a column whose type moved",
        "ALTER TABLE public.country ALTER COLUMN vat_rate_bp TYPE bigint",
        "drift: column public.country.vat_rate_bp is bigint in the database and integer in db/schema",
      ],
      [
        "a column whose nullability moved",
        "ALTER TABLE public.country ALTER COLUMN iana_zone DROP NOT NULL",
        "drift: column public.country.iana_zone is nullable in the database and NOT NULL in db/schema",
      ],
      [
        "a table with RLS disabled",
        "ALTER TABLE public.country DISABLE ROW LEVEL SECURITY",
        "rls: public.country has row-level security disabled and is not on RLS_EXEMPT_TABLES (db/rls.ts)",
      ],
      [
        "a table with RLS on and no policy",
        "CREATE TABLE public.orphan_fixture (id integer); ALTER TABLE public.orphan_fixture ENABLE ROW LEVEL SECURITY",
        "rls: public.orphan_fixture has no policy and is not on RLS_EXEMPT_TABLES (db/rls.ts)",
      ],
      [
        "a *_minor column with no currency column",
        "ALTER TABLE public.product ADD COLUMN deposit_minor bigint",
        "money: public.product.deposit_minor has no currency column in public.product (spec 002 §2 money pair)",
      ],
      [
        "a float-shaped money column (AC-5)",
        "ALTER TABLE public.product ADD COLUMN list_price numeric",
        "money: public.product.list_price is numeric; money is integer minor units (*_minor bigint) plus a currency",
      ],
      [
        "a bytea column (AC-22)",
        "ALTER TABLE public.media_asset ADD COLUMN body bytea",
        "bytea: public.media_asset.body stores bytes; media lives in R2 and the database keeps keys (ADR-0015, AC-22)",
      ],
      [
        "a recipient email column (AC-27)",
        "ALTER TABLE public.recipient ADD COLUMN email text",
        "plan/07",
      ],
    ])("fails on %s, naming it", async (_label, ddl, expected) => {
      const problems = await problemsAfter(ddl);
      expect(problems.some((line) => line.includes(expected))).toBe(true);
    });

    it.each([
      [
        "a weakened CHECK expression (TASK-017 hole 8)",
        `ALTER TABLE public.product_media_alt DROP CONSTRAINT product_media_alt_alt_check;
         ALTER TABLE public.product_media_alt ADD CONSTRAINT product_media_alt_alt_check CHECK (alt <> '')`,
        "constraint product_media_alt product_media_alt_alt_check differs",
      ],
      [
        "an object-key check dropped (TASK-017 hole 8)",
        "ALTER TABLE public.media_asset DROP CONSTRAINT media_asset_object_key_check",
        "constraint media_asset media_asset_object_key_check is in the snapshot but not in the database",
      ],
      [
        "NULLS NOT DISTINCT dropped from a unique index (TASK-018)",
        `DROP INDEX public.partner_catalog_mapping_partner_product_tier_idx;
         CREATE UNIQUE INDEX partner_catalog_mapping_partner_product_tier_idx
           ON public.partner_catalog_mapping (partner_id, product_id, tier_key)`,
        "index partner_catalog_mapping_partner_product_tier_idx differs",
      ],
      [
        "a partial index's predicate changed (TASK-017 hole 5)",
        `DROP INDEX public.product_media_primary_idx;
         CREATE UNIQUE INDEX product_media_primary_idx ON public.product_media (product_id)`,
        "index product_media_primary_idx differs",
      ],
      [
        "a trigger function rewritten (TASK-018)",
        `CREATE OR REPLACE FUNCTION public.payout_currency_check() RETURNS trigger
           LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`,
        "function payout_currency_check() differs",
      ],
      [
        "a trigger renamed away",
        "ALTER TRIGGER country_set_updated_at ON public.country RENAME TO country_touch",
        "trigger country country_set_updated_at is in the snapshot but not in the database",
      ],
      [
        "app_current_role() losing its pinned search_path (PR 210)",
        "ALTER FUNCTION public.app_current_role() RESET search_path",
        "function app_current_role() differs",
      ],
      [
        "a view losing security_barrier (PR 210)",
        "ALTER VIEW public.partner_order RESET (security_barrier)",
        "view partner_order differs",
      ],
      [
        "a policy loosened",
        `DROP POLICY payout_partner ON public.payout;
         CREATE POLICY payout_partner ON public.payout FOR SELECT TO app_web USING (true)`,
        "policy payout payout_partner differs",
      ],
    ])("fails on %s, naming it", async (_label, ddl, expected) => {
      const problems = await problemsAfter(ddl);
      expect(
        problems.some((line) => line.includes(`catalogue drift: ${expected}`)),
        problems.join("\n"),
      ).toBe(true);
    });

    it("reports one line per problem", async () => {
      const problems = await problemsAfter(
        `ALTER TABLE public.media_asset ADD COLUMN body bytea;
         ALTER TABLE public.product ADD COLUMN extra_bytes bytea`,
      );
      const bytea = problems.filter((line) => line.startsWith("bytea: "));
      expect(bytea).toHaveLength(2);
      expect(new Set(problems).size).toBe(problems.length);
    });

    it("the CLI exits 0 on the merged tree and 1 with the offender on stderr", async () => {
      const env = { ...process.env, DATABASE_URL_UNPOOLED: scratch.url };
      const clean = await run(
        process.execPath,
        [resolve(REPO_ROOT, "scripts/db-check.ts")],
        { cwd: REPO_ROOT, env, timeout: 120_000 },
      );
      expect(clean.stdout).toMatch(/^applied migrations: /m);
      expect(clean.stdout).toMatch(/^RLS coverage: /m);
      await scratch.sql.unsafe(
        "ALTER TABLE public.country ADD COLUMN cli_fixture text",
      );
      try {
        await run(
          process.execPath,
          [resolve(REPO_ROOT, "scripts/db-check.ts")],
          { cwd: REPO_ROOT, env, timeout: 120_000 },
        );
        expect.unreachable("db:check exited 0 with a drifted column");
      } catch (error) {
        const failure = error as { code?: number; stderr?: string };
        expect(failure.code).toBe(1);
        expect(failure.stderr).toContain("public.country.cli_fixture");
      } finally {
        await scratch.sql.unsafe(
          "ALTER TABLE public.country DROP COLUMN cli_fixture",
        );
      }
    }, 240_000);
  },
);
