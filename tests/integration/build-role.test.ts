/**
 * T-04 (the database half) and T-02 (the country half) — the build's read-only role and the
 * country registry parity (spec 012b §2.0 item 2, §2.2 "Parity before the switch", §5.1 item 1,
 * AC-2, AC-4; TASK-292).
 *
 * A scratch database migrated by the real runner and seeded by the real seed; `app_build` given a
 * login and a throwaway password for the run, as the founder does in Neon (§12 founder action 4),
 * and returned to `NOLOGIN` afterwards (roles are cluster-wide). Then, connected **as that login**:
 *
 *  - every `SELECT` on the public reference set succeeds and sees the rows a public render sees;
 *  - every `INSERT`, `UPDATE`, `DELETE` and `TRUNCATE` on it, and every `SELECT` outside it, is
 *    refused with `insufficient_privilege`;
 *  - `src/lib/db.ts`'s build-phase client connects through `DATABASE_BUILD_URL` as `app_build`
 *    (never through `DATABASE_URL`, which points at the same database as the superuser here, so a
 *    fallback would show), and fails when that database cannot be reached;
 *  - `dbCountryRegistry` gives back the file registry, and `pnpm catalogue:parity` exits 0 on the
 *    fresh seed and 1 naming every URL and field once a country's status differs.
 *
 * The CI-image half of T-04 (no layer, history entry or label carries the value) is the
 * `container` job's; the end-to-end "a build with the database stopped exits non-zero" belongs
 * with the first build that reads the database, TASK-294's cutover.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { sql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  BUILD_ROLE_BLOG_TABLES,
  BUILD_ROLE_FILTERED_TABLES,
  BUILD_ROLE_READ_TABLES,
  PUBLIC_VIEWS,
} from "../../db/rls.ts";
import * as schema from "../../db/schema/index.ts";
import { readSeedTree } from "../../seed/check.ts";
import { runSeed } from "../../seed/index.ts";
import { buildSeedPlan } from "../../seed/plan.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import {
  pgFailure,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);

const BUILD_SET = [
  ...BUILD_ROLE_READ_TABLES,
  ...Object.keys(BUILD_ROLE_FILTERED_TABLES),
  // spec 044 §5.1 item 7 (migration `0024_blog`, TASK-321).
  ...BUILD_ROLE_BLOG_TABLES,
].sort();

const MIRROR_TABLES = Object.values(schema)
  .filter(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      Symbol.for("drizzle:IsDrizzleTable") in value,
  )
  .map((table) => getTableConfig(table as PgTable).name)
  .sort();

/** The private tables AC-4 names, which must be in the refused set. */
const NAMED_PRIVATE = [
  "customer",
  "order",
  "fulfillment_partner",
  "users",
  "audit_log",
] as const;

const quoted = (table: string) => `public."${table}"`;

/** `url` with its user and password replaced. */
function asLogin(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}

describe.skipIf(server.url === undefined)(
  `T-04 / T-02 — the build role and country parity${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let buildUrl: string;
    let build: Sql;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "buildrole");
      await runSeed(scratch.sql, buildSeedPlan(await readSeedTree(REPO_ROOT)));
      const password = randomBytes(12).toString("hex");
      await scratch.sql.unsafe(
        `ALTER ROLE app_build LOGIN PASSWORD '${password}'`,
      );
      buildUrl = asLogin(scratch.url, "app_build", password);
      build = postgres(buildUrl, { max: 2, onnotice: () => undefined });
    }, 600_000);

    afterAll(async () => {
      await build.end({ timeout: 5 });
      await scratch.sql.unsafe("ALTER ROLE app_build NOLOGIN PASSWORD NULL");
      await scratch.drop();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("AC-4: app_build is a plain role: no superuser, no BYPASSRLS, no CREATEROLE, no inheritance", async () => {
      const [role] = await scratch.sql<
        {
          rolsuper: boolean;
          rolbypassrls: boolean;
          rolcreaterole: boolean;
          rolcreatedb: boolean;
          rolinherit: boolean;
        }[]
      >`SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit
        FROM pg_roles WHERE rolname = 'app_build'`;
      expect(role).toEqual({
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolinherit: false,
      });
      const [who] = await build<{ u: string; role: string }[]>`
        SELECT current_user AS u,
               coalesce(nullif(current_setting('app.role', true), ''), 'public') AS role`;
      expect(who).toEqual({ u: "app_build", role: "public" });
    });

    it("AC-4: as app_build every SELECT on the public reference set succeeds and sees the seeded rows", async () => {
      for (const table of BUILD_SET) {
        const [mine] = await build.unsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM ${quoted(table)}`,
        );
        const [all] = await scratch.sql.unsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM ${quoted(table)}`,
        );
        // The seed writes no media or review row (§6), so those two counts are 0 = 0.
        expect(mine?.n, table).toBe(all?.n);
      }
      const [country] = await build<{ n: number }[]>`
        SELECT count(*)::int AS n FROM country`;
      const [price] = await build<{ n: number }[]>`
        SELECT count(*)::int AS n FROM country_price`;
      expect(country?.n).toBe(COUNTRIES.length);
      expect(price?.n).toBeGreaterThan(0);
    });

    it("AC-4: INSERT, UPDATE, DELETE and TRUNCATE fail on every table of the set", async () => {
      // The grant itself, not only its effect: RLS would refuse a write that a stray grant let
      // through (also 42501), so the privilege catalogue is asserted first.
      const privileges = await scratch.sql<{ t: string; granted: string[] }[]>`
        SELECT t, array_agg(p ORDER BY p) FILTER (WHERE has_table_privilege('app_build', 'public.' || quote_ident(t), p)) AS granted
        FROM unnest(${BUILD_SET}::text[]) AS t
        CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
        GROUP BY t ORDER BY t`;
      for (const { t, granted } of privileges) {
        expect(granted, t).toEqual(["SELECT"]);
      }
      expect(privileges.map((row) => row.t)).toEqual(BUILD_SET);
      await build.begin(async (tx) => {
        for (const table of BUILD_SET) {
          const [column] = await tx<{ name: string }[]>`
            SELECT column_name AS name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ${table}
            ORDER BY ordinal_position LIMIT 1`;
          const col = `"${column?.name ?? "id"}"`;
          for (const statement of [
            `INSERT INTO ${quoted(table)} DEFAULT VALUES`,
            `UPDATE ${quoted(table)} SET ${col} = ${col}`,
            `DELETE FROM ${quoted(table)}`,
            `TRUNCATE ${quoted(table)}`,
          ]) {
            const failure = await pgFailure(tx, (sp) => sp.unsafe(statement));
            expect(failure.code, statement).toBe("42501");
          }
        }
      });
    });

    it("AC-4: every SELECT outside the set fails, the named private tables and the partner views among them", async () => {
      const relations = await scratch.sql<{ name: string }[]>`
        SELECT relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
          AND relname <> 'schema_migrations'
        ORDER BY 1`;
      // The column-limited public views the build also reads (spec 044 §5.1 item 7, `0024_blog`).
      const readableViews: readonly string[] = Object.keys(PUBLIC_VIEWS);
      const outside = relations
        .map((r) => r.name)
        .filter((name) => !BUILD_SET.includes(name) && !readableViews.includes(name));
      for (const table of NAMED_PRIVATE) expect(outside).toContain(table);
      expect(outside).toContain("partner_catalog_mapping");
      expect(outside).toContain("partner_coverage");
      expect(outside).toContain("partner_order");
      // Every table the mirror declares is either readable or refused: none is unaccounted for.
      for (const table of MIRROR_TABLES) {
        expect(
          BUILD_SET.includes(table) || outside.includes(table),
          table,
        ).toBe(true);
      }
      await build.begin(async (tx) => {
        for (const table of [...outside, "pgboss.job"]) {
          const target = table.includes(".") ? table : quoted(table);
          const failure = await pgFailure(tx, (sp) =>
            sp.unsafe(`SELECT 1 FROM ${target} LIMIT 1`),
          );
          expect(failure.code, table).toBe("42501");
        }
      });
    });

    it("AC-4: during the build, db.ts connects through DATABASE_BUILD_URL as app_build and never through DATABASE_URL", async () => {
      vi.stubEnv("NEXT_PHASE", "phase-production-build");
      vi.stubEnv("DATABASE_BUILD_URL", buildUrl);
      // The superuser on the same database: a fallback to it would read as `postgres`.
      vi.stubEnv("DATABASE_URL", scratch.url);
      vi.resetModules();
      const { withDbContext } = await import("../../src/lib/db.ts");
      const { dbCountryRegistry } =
        await import("../../src/modules/geo/db/registry.ts");
      const who = await withDbContext(
        { role: "public", requestId: "build-role-test" },
        async (db) =>
          db.execute<{ u: string; s: string }>(
            sql`SELECT current_user AS u, session_user AS s`,
          ),
      );
      expect([...who]).toEqual([{ u: "app_build", s: "app_build" }]);
      expect(await dbCountryRegistry.countries()).toEqual(COUNTRIES);
      const refused = await withDbContext(
        { role: "public", requestId: "build-role-test" },
        (db) =>
          db.execute(
            sql`UPDATE country SET vat_rate_bp = vat_rate_bp WHERE iso2 = 'PL'`,
          ),
      ).then(
        () => "written",
        (error: unknown) =>
          error instanceof Error &&
          error.cause instanceof postgres.PostgresError
            ? error.cause.code
            : String(error),
      );
      expect(refused).toBe("42501");
    });

    it("AC-4: during the build, an unreachable DATABASE_BUILD_URL fails the read, with no fallback", async () => {
      vi.stubEnv("NEXT_PHASE", "phase-production-build");
      vi.stubEnv(
        "DATABASE_BUILD_URL",
        asLogin("postgres://127.0.0.1:1/fo", "app_build", "x"),
      );
      vi.stubEnv("DATABASE_URL", scratch.url);
      vi.resetModules();
      const { dbCountryRegistry } =
        await import("../../src/modules/geo/db/registry.ts");
      await expect(dbCountryRegistry.countries()).rejects.toThrow(
        /ECONNREFUSED|connect/u,
      );
    }, 60_000);

    it("AC-2 / T-02: catalogue:parity as app_build is empty on the fresh seed and names every URL and field once a status differs", async () => {
      const cli = resolve(REPO_ROOT, "scripts/catalogue-parity.ts");
      const clean = await run(process.execPath, [cli, `--target=${buildUrl}`], {
        cwd: REPO_ROOT,
        timeout: 120_000,
      });
      expect(clean.stdout).toContain(
        "7 countries agree on every registry field",
      );
      expect(clean.stdout).not.toContain(buildUrl);

      // The admin path, the only one `status_flip_guard()` allows.
      const flip = (status: string) =>
        scratch.sql.begin(async (tx) => {
          await tx.unsafe("SET LOCAL app.role = 'admin'");
          await tx.unsafe("SET LOCAL app.audit_action = 'country.status'");
          await tx`UPDATE country SET status = ${status} WHERE iso2 = 'FR'`;
        });
      await flip("live");
      try {
        const drifted = await run(
          process.execPath,
          [cli, `--target=${buildUrl}`],
          { cwd: REPO_ROOT, timeout: 120_000 },
        ).then(
          () => ({ code: 0, stdout: "" }),
          (error: { code?: number; stdout?: string }) => ({
            code: error.code ?? -1,
            stdout: error.stdout ?? "",
          }),
        );
        expect(drifted.code).toBe(1);
        expect(drifted.stdout).toContain(
          '/en/send-flowers-to/france FR.status: static "demo", database "live"',
        );
        expect(drifted.stdout).toContain(
          '/pl/francja/kwiaty FR.status: static "demo", database "live"',
        );
        expect(drifted.stdout).toContain(
          "catalogue:parity: 1 differing field(s) across 8 URL(s)",
        );
      } finally {
        await flip("demo");
      }
    }, 240_000);
  },
);
