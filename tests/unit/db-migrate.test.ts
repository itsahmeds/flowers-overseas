/**
 * `scripts/db-migrate.ts` and migration `0001` — spec 002 §5.1, AC-4 (the offline half); §13 Q6;
 * TASK-014.
 *
 * The runner's planning is pure and is tested here without a database: which files run, in which
 * direction, in which order, and which connection string is read. The *connected* round trip
 * (migrate → rollback → migrate against Postgres) is T-01/T-02, owned by TASK-022 as AC-4 and run
 * by hand against the shared preview database on every PR from here — the record goes in the PR
 * body.
 *
 * Migration `0001` itself is asserted as text: the two roles, their attributes, the grants and
 * the trigger function are the contract spec 002 §2 states, and a later edit that quietly drops
 * `NOBYPASSRLS` would otherwise only be caught by AC-18, three specs from now.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BOOKKEEPING_TABLE,
  DEFAULT_ROLLBACK_TARGET,
  formatPlan,
  type Migration,
  parseArgs,
  planDown,
  planUp,
  readMigrations,
  resolveDirectUrl,
} from "../../scripts/db-migrate.ts";
import { MIGRATIONS_DIR } from "../../scripts/db-check.ts";

const repoRoot = resolve(__dirname, "../..");
const migrationsDir = join(repoRoot, MIGRATIONS_DIR);

function migration(version: string, name: string): Migration {
  return {
    version,
    name,
    file: `${version}_${name}.sql`,
    downFile: `${version}_${name}.down.sql`,
  };
}

const available = [
  migration("0001", "roles"),
  migration("0002", "geo"),
  migration("0003", "catalog"),
];

describe("the CLI contract", () => {
  it("defaults to a forward run", () => {
    expect(parseArgs([])).toEqual({ direction: "up", dryRun: false });
  });

  it("reads --down --to NNNN in both spellings", () => {
    expect(parseArgs(["--down", "--to", "0002"])).toEqual({
      direction: "down",
      to: "0002",
      dryRun: false,
    });
    expect(parseArgs(["--down", "--to=0002", "--dry-run"])).toEqual({
      direction: "down",
      to: "0002",
      dryRun: true,
    });
  });

  it("rolls everything back when --to is omitted", () => {
    expect(parseArgs(["--down"]).to).toBe(DEFAULT_ROLLBACK_TARGET);
  });

  it("refuses --to on a forward run rather than ignoring it", () => {
    expect(() => parseArgs(["--to", "0002"])).toThrow(/db:rollback/);
  });

  it("refuses a --to that is not a version", () => {
    expect(() => parseArgs(["--down", "--to", "latest"])).toThrow();
  });
});

describe("the plan", () => {
  it("applies only what is not yet applied, in ascending order", () => {
    expect(planUp(available, ["0001"]).map((m) => m.file)).toEqual([
      "0002_geo.sql",
      "0003_catalog.sql",
    ]);
    expect(planUp(available, ["0001", "0002", "0003"])).toEqual([]);
  });

  it("rolls back applied migrations only, newest first, down to but not including --to", () => {
    expect(
      planDown(available, ["0001", "0002", "0003"], "0001").map(
        (m) => m.downFile,
      ),
    ).toEqual(["0003_catalog.down.sql", "0002_geo.down.sql"]);
  });

  it("rolls everything back for --to 0000", () => {
    expect(
      planDown(available, ["0001", "0002"], "0000").map((m) => m.version),
    ).toEqual(["0002", "0001"]);
  });

  it("never rolls back a migration that was never applied", () => {
    expect(planDown(available, ["0001"], "0000").map((m) => m.version)).toEqual(
      ["0001"],
    );
  });

  it("prints the plan it is about to run, and says so when there is nothing to do", () => {
    expect(
      formatPlan(
        { direction: "up", dryRun: true },
        planUp(available, ["0001"]),
      ),
    ).toEqual([
      "db:migrate: apply 2 migration(s)",
      "  0002_geo.sql",
      "  0003_catalog.sql",
    ]);
    expect(formatPlan({ direction: "up", dryRun: false }, [])).toEqual([
      "db:migrate: nothing to apply",
    ]);
    expect(
      formatPlan({ direction: "down", to: "0000", dryRun: false }, []),
    ).toEqual(["db:rollback: nothing to roll back"]);
  });
});

describe("the connection (§13 Q6)", () => {
  it("reads the direct URL and names the key, never the value, when it is missing", () => {
    expect(
      resolveDirectUrl({ DATABASE_URL_UNPOOLED: "postgres://u:p@h:5432/db" }),
    ).toBe("postgres://u:p@h:5432/db");
    expect(() => resolveDirectUrl({})).toThrow(/DATABASE_URL_UNPOOLED/);
    try {
      resolveDirectUrl({ DATABASE_URL_UNPOOLED: "https://example.test/db" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("example.test");
    }
  });

  it("does not read the pooled URL, which belongs to web requests", () => {
    const source = readFileSync(
      join(repoRoot, "scripts/db-migrate.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/DATABASE_URL\b(?!_UNPOOLED)/);
  });

  it("records applied migrations in one bookkeeping table", () => {
    expect(BOOKKEEPING_TABLE).toBe("public.schema_migrations");
  });
});

describe("the committed migration set", () => {
  // Every migration added from here on extends this list, in order: the runner applies exactly
  // what it reads from the directory, so the committed set is worth pinning (TASK-015 added 0002,
  // TASK-016 added 0003).
  it("reads each committed migration and its rollback from db/migrations", () => {
    expect(readMigrations(migrationsDir).map((m) => m.file)).toEqual([
      "0001_roles_grants_updated_at.sql",
      "0002_i18n_geo.sql",
      "0003_catalog_pricing.sql",
    ]);
  });
});

describe('migration 0001 (spec 002 §2 "RLS and roles", §5.1)', () => {
  const forward = readFileSync(
    join(migrationsDir, "0001_roles_grants_updated_at.sql"),
    "utf8",
  );
  const rollback = readFileSync(
    join(migrationsDir, "0001_roles_grants_updated_at.down.sql"),
    "utf8",
  );
  /** The SQL without its commentary, for the assertions about what it must *not* do. */
  const statementsOnly = forward
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("creates both roles with no login, no superuser and no BYPASSRLS", () => {
    for (const role of ["app_owner", "app_web"]) {
      const create = new RegExp(
        `CREATE ROLE ${role}\\s+NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
      );
      expect(forward, role).toMatch(create);
    }
  });

  it("creates each role only when it is absent, so a second database in the cluster still migrates", () => {
    expect(forward).toContain(
      "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner')",
    );
    expect(forward).toContain(
      "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_web')",
    );
  });

  it("grants app_web DML only — no DDL, no TRUNCATE, no GRANT ALL", () => {
    expect(forward).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_web",
    );
    expect(statementsOnly).not.toMatch(/GRANT ALL/i);
    expect(statementsOnly).not.toMatch(/TRUNCATE/i);
    expect(statementsOnly).not.toMatch(
      /GRANT CREATE ON SCHEMA public TO app_web/i,
    );
  });

  it("creates its objects as app_owner", () => {
    expect(forward).toContain("SET LOCAL ROLE app_owner;");
    expect(forward).toContain("RESET ROLE;");
  });

  it("defines set_updated_at() as an unconditional assignment (AC-10)", () => {
    expect(forward).toContain(
      "CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger",
    );
    expect(forward).toContain("NEW.updated_at := now();");
    // A conditional (`IF NEW IS DISTINCT FROM OLD`) would let an UPDATE that changes no other
    // column leave `updated_at` behind, and sitemap <lastmod> would go stale.
    expect(statementsOnly).not.toMatch(/IS DISTINCT FROM/i);
  });

  it("creates no extension and no enum type (AC-7, ADR-0015 portability)", () => {
    expect(statementsOnly).not.toMatch(/CREATE EXTENSION/i);
    expect(statementsOnly).not.toMatch(/CREATE TYPE/i);
    expect(rollback).not.toMatch(/CREATE EXTENSION/i);
  });

  it("rolls back the function, the privileges and both roles, in reverse order", () => {
    expect(rollback).toContain(
      "DROP FUNCTION IF EXISTS public.set_updated_at()",
    );
    expect(rollback).toContain("REASSIGN OWNED BY app_owner TO CURRENT_USER");
    expect(rollback).toContain("DROP OWNED BY app_owner");
    expect(rollback).toContain("DROP ROLE app_web");
    expect(rollback).toContain("DROP ROLE app_owner");
    expect(rollback.indexOf("DROP FUNCTION")).toBeLessThan(
      rollback.indexOf("DROP ROLE app_owner"),
    );
  });

  it("drops each role only if it exists, so the rollback is re-runnable", () => {
    expect(rollback.match(/IF EXISTS \(SELECT 1 FROM pg_roles/g)).toHaveLength(
      4,
    );
  });
});
