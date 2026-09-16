/**
 * `pnpm db:check` (spec 001 §2 "Scripts", §5.1; spec 002 §2, §13 Q2; TASK-011, extended by
 * TASK-014).
 *
 * The gate's offline half: rollback pairing, version sequence, the `SET LOCAL ROLE app_owner`
 * ownership preamble and table-level drift between `db/schema/` and `db/migrations/`. The failure
 * paths matter more than the happy one — a gate that only proves it can say "ok" is not a gate —
 * so each rule is driven from a fixture that breaks it and each failure must name the file.
 *
 * The connected half (column-level drift, RLS coverage, the money pair, `bytea`, the
 * recipient-email ban) is AC-26 on TASK-027 and needs `DATABASE_URL_UNPOOLED`.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BOOTSTRAP_VERSION,
  checkMigrations,
  checkSources,
  DRIZZLE_META_DIR,
  formatProblems,
  formatSourceProblems,
  formatSummary,
  MIGRATIONS_DIR,
  OWNER_PREAMBLE,
  readMigrationDir,
  readSources,
  runDbCheck,
  SCHEMA_DIR,
} from "../../scripts/db-check.ts";

const repoRoot = resolve(__dirname, "../..");

describe("pnpm db:check on the committed tree (spec 002 §13 Q2)", () => {
  it("exits 0, reporting the committed migrations and their rollbacks", () => {
    const stdout = execFileSync(process.execPath, ["scripts/db-check.ts"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(stdout.trim()).toMatch(/^\d+ migration\(s\), each with a rollback$/);
  });

  it("is wired to the `db:check` package script", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts["db:check"]).toBe("node scripts/db-check.ts");
  });

  it("reads migrations from `db/migrations`, not from a vendor directory (§13 Q2 option A)", () => {
    expect(MIGRATIONS_DIR).toBe("db/migrations");
    expect(SCHEMA_DIR).toBe("db/schema");
    expect(existsSync(resolve(repoRoot, "supabase"))).toBe(false);
  });

  it("finds migration 0001 with its hand-written rollback", () => {
    const entries = readdirSync(resolve(repoRoot, MIGRATIONS_DIR));
    expect(entries).toContain("0001_roles_grants_updated_at.sql");
    expect(entries).toContain("0001_roles_grants_updated_at.down.sql");
    expect(
      runDbCheck(
        resolve(repoRoot, MIGRATIONS_DIR),
        resolve(repoRoot, SCHEMA_DIR),
      ).ok,
    ).toBe(true);
  });

  it("treats a missing directory as no migrations rather than crashing", () => {
    expect(readMigrationDir(resolve(repoRoot, "db/does-not-exist"))).toEqual(
      [],
    );
    expect(
      readSources(resolve(repoRoot, "db/does-not-exist"), ".sql").size,
    ).toBe(0);
  });
});

describe("the rules spec 002 inherits", () => {
  it("accepts a migration with its rollback", () => {
    const report = checkMigrations([
      ".gitkeep",
      "0001_init.sql",
      "0001_init.down.sql",
      "0002_orders.sql",
      "0002_orders.down.sql",
    ]);
    expect(report.ok).toBe(true);
    expect(report.migrations.map((m) => m.file)).toEqual([
      "0001_init.sql",
      "0002_orders.sql",
    ]);
    expect(formatSummary(report)).toBe("2 migration(s), each with a rollback");
    expect(formatProblems(report)).toEqual([]);
  });

  it("rejects a migration with no rollback file, naming the file it wants", () => {
    const report = checkMigrations(["0001_init.sql"]);
    expect(report.ok).toBe(false);
    expect(report.missingRollbacks).toEqual(["0001_init.sql"]);
    expect(formatProblems(report)[0]).toContain("0001_init.down.sql");
  });

  it("rejects a rollback with no forward migration", () => {
    const report = checkMigrations(["0001_init.down.sql"]);
    expect(report.ok).toBe(false);
    expect(report.orphanRollbacks).toEqual(["0001_init.down.sql"]);
    expect(report.migrations).toEqual([]);
  });

  it("rejects two migrations claiming the same version prefix", () => {
    const report = checkMigrations([
      "0001_init.sql",
      "0001_init.down.sql",
      "0001_partners.sql",
      "0001_partners.down.sql",
    ]);
    expect(report.ok).toBe(false);
    expect(report.duplicateVersions).toEqual(["0001"]);
    expect(formatProblems(report).join("\n")).toContain(
      "version 0001 is claimed",
    );
  });

  it("rejects a file that is not a migration filename", () => {
    const report = checkMigrations(["init.sql", "0002_Orders.sql"]);
    expect(report.ok).toBe(false);
    expect(report.unparseableFiles).toEqual(["0002_Orders.sql", "init.sql"]);
  });

  it("reports every problem in one run rather than stopping at the first", () => {
    const report = checkMigrations([
      "0001_init.sql",
      "0002_x.down.sql",
      "junk",
    ]);
    expect(formatProblems(report)).toHaveLength(3);
  });

  it("exits non-zero, printing the problems, when the rules are broken", () => {
    const report = checkMigrations(["0001_init.sql"]);
    expect(report.ok).toBe(false);
    // `runDbCheck` is what the CLI branch calls; a broken set must never reach `formatSummary`.
    expect(formatProblems(report)).not.toEqual([]);
  });
});

describe("the version sequence (spec 002 AC-4)", () => {
  it("accepts a contiguous run from 0001", () => {
    const report = checkMigrations([
      "0001_a.sql",
      "0001_a.down.sql",
      "0002_b.sql",
      "0002_b.down.sql",
      "0003_c.sql",
      "0003_c.down.sql",
    ]);
    expect(report.versionGaps).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("rejects a gap, naming the file that jumps", () => {
    const report = checkMigrations([
      "0001_a.sql",
      "0001_a.down.sql",
      "0003_c.sql",
      "0003_c.down.sql",
    ]);
    expect(report.ok).toBe(false);
    expect(report.versionGaps).toEqual([
      "0003_c.sql: version 0003 does not continue the sequence (expected 0002)",
    ]);
    expect(formatProblems(report)).toContain(report.versionGaps[0]);
  });

  it("rejects a set that does not start at 0001", () => {
    const report = checkMigrations(["0002_b.sql", "0002_b.down.sql"]);
    expect(report.ok).toBe(false);
    expect(formatProblems(report).join("\n")).toContain("expected 0001");
  });
});

describe('the ownership preamble (spec 002 §2 "RLS and roles")', () => {
  const withPreamble = `${OWNER_PREAMBLE}\n\nCREATE TABLE country (id uuid PRIMARY KEY);\n`;

  it("accepts a migration that opens with SET LOCAL ROLE app_owner", () => {
    const report = checkSources(
      new Map([["0002_geo.sql", withPreamble]]),
      new Map([["geo.ts", 'export const country = pgTable("country", {});']]),
    );
    expect(report.ok).toBe(true);
    expect(formatSourceProblems(report)).toEqual([]);
  });

  it("rejects a migration that forgets it, naming the file", () => {
    const report = checkSources(
      new Map([
        ["0002_geo.sql", "CREATE TABLE country (id uuid PRIMARY KEY);"],
      ]),
      new Map([["geo.ts", 'export const country = pgTable("country", {});']]),
    );
    expect(report.ok).toBe(false);
    expect(report.missingOwnerPreamble).toHaveLength(1);
    expect(report.missingOwnerPreamble[0]).toContain("0002_geo.sql");
    expect(report.missingOwnerPreamble[0]).toContain(OWNER_PREAMBLE);
  });

  it("exempts the bootstrap migration, which creates the role", () => {
    const report = checkSources(
      new Map([
        [`${BOOTSTRAP_VERSION}_roles.sql`, "CREATE ROLE app_owner NOLOGIN;"],
      ]),
      new Map(),
    );
    expect(report.missingOwnerPreamble).toEqual([]);
  });

  it("ignores leading comments and blank lines when looking for the preamble", () => {
    const report = checkSources(
      new Map([["0002_geo.sql", `-- why\n\n${withPreamble}`]]),
      new Map([["geo.ts", 'export const country = pgTable("country", {});']]),
    );
    expect(report.missingOwnerPreamble).toEqual([]);
  });

  it("does not require the preamble in a rollback (a role cannot drop itself)", () => {
    const report = checkSources(
      new Map([
        ["0002_geo.sql", withPreamble],
        ["0002_geo.down.sql", "DROP TABLE country;"],
      ]),
      new Map([["geo.ts", 'export const country = pgTable("country", {});']]),
    );
    expect(report.missingOwnerPreamble).toEqual([]);
  });
});

describe("table-level drift (the offline half of AC-26)", () => {
  it("reports a table declared in Drizzle that no migration creates", () => {
    const report = checkSources(
      new Map([
        ["0002_geo.sql", `${OWNER_PREAMBLE}\nCREATE TABLE country (id uuid);`],
      ]),
      new Map([
        [
          "geo.ts",
          'export const country = pgTable("country", {});\nexport const city = pgTable("city", {});',
        ],
      ]),
    );
    expect(report.ok).toBe(false);
    expect(report.driftMissingInMigrations).toHaveLength(1);
    expect(report.driftMissingInMigrations[0]).toContain("geo.ts");
    expect(report.driftMissingInMigrations[0]).toContain("city");
  });

  it("reports a table created by a migration that Drizzle does not declare", () => {
    const report = checkSources(
      new Map([
        [
          "0002_geo.sql",
          `${OWNER_PREAMBLE}\nCREATE TABLE IF NOT EXISTS public."country" (id uuid);\nCREATE TABLE city (id uuid);`,
        ],
      ]),
      new Map([["geo.ts", 'export const country = pgTable("country", {});']]),
    );
    expect(report.ok).toBe(false);
    expect(report.driftMissingInSchema).toHaveLength(1);
    expect(report.driftMissingInSchema[0]).toContain("0002_geo.sql");
    expect(report.driftMissingInSchema[0]).toContain("city");
  });

  it("agrees when both sides name the same tables, however they are quoted", () => {
    const report = checkSources(
      new Map([
        [
          "0002_geo.sql",
          `${OWNER_PREAMBLE}\nCREATE TABLE public.country (id uuid);\nCREATE TABLE IF NOT EXISTS "city" (id uuid);`,
        ],
      ]),
      new Map([
        [
          "geo.ts",
          "export const country = pgTable(\"country\", {});\nexport const city = pgTable('city', {});",
        ],
      ]),
    );
    expect(report.ok).toBe(true);
  });

  it("is silent while the schema directory is empty, as it is until TASK-015", () => {
    expect(
      checkSources(
        new Map([["0001_roles.sql", "CREATE ROLE app_owner NOLOGIN;"]]),
        new Map(),
      ).ok,
    ).toBe(true);
  });
});

/**
 * `pnpm db:generate` — the command `db/migrations/README.md` tells the next implementer to run —
 * writes Drizzle Kit's `meta/` (the journal, plus one snapshot per generated migration) into the
 * migrations root. `meta/` is committed, because drizzle-kit needs the journal to generate the
 * *next* migration incrementally, so the gate has to know it is not a migration (`/review 71`).
 */
describe("directory entries in the migrations root (/review 71)", () => {
  it("passes with Drizzle Kit's committed `meta/` next to the migration pair", () => {
    const report = checkMigrations([
      { name: "0001_init.sql", isFile: true },
      { name: "0001_init.down.sql", isFile: true },
      { name: DRIZZLE_META_DIR, isFile: false },
      { name: "README.md", isFile: true },
    ]);
    expect(report.ok).toBe(true);
    expect(formatProblems(report)).toEqual([]);
    expect(report.migrations.map((migration) => migration.file)).toEqual([
      "0001_init.sql",
    ]);
  });

  it("ignores a stray `.sql` inside `meta/`, because the listing is not recursive", () => {
    const dir = mkdtempSync(join(tmpdir(), "db-check-meta-"));
    mkdirSync(join(dir, DRIZZLE_META_DIR));
    writeFileSync(join(dir, DRIZZLE_META_DIR, "_journal.json"), "{}");
    writeFileSync(join(dir, DRIZZLE_META_DIR, "0009_stray.sql"), "SELECT 1;");
    writeFileSync(join(dir, "0001_init.sql"), `${OWNER_PREAMBLE}\n`);
    writeFileSync(join(dir, "0001_init.down.sql"), `${OWNER_PREAMBLE}\n`);

    expect(readMigrationDir(dir).map((entry) => entry.name)).toEqual([
      "0001_init.down.sql",
      "0001_init.sql",
    ]);
    expect([...readSources(dir, ".sql").keys()]).toEqual([
      "0001_init.down.sql",
      "0001_init.sql",
    ]);
    expect(runDbCheck(dir).ok).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it("reports a directory named like a migration, which db:migrate would never read", () => {
    const report = checkMigrations([
      { name: "0001_init.sql", isFile: true },
      { name: "0001_init.down.sql", isFile: true },
      { name: "0002_orders.sql", isFile: false },
    ]);
    expect(report.ok).toBe(false);
    expect(report.directoryEntries).toEqual(["0002_orders.sql"]);
    expect(formatProblems(report)).toEqual([
      "0002_orders.sql: is a directory, not a migration file; db:migrate reads files only.",
    ]);
  });

  it("says nothing about a directory that does not claim to be a migration", () => {
    const report = checkMigrations([
      { name: "0001_init.sql", isFile: true },
      { name: "0001_init.down.sql", isFile: true },
      { name: "scratch", isFile: false },
    ]);
    expect(report.ok).toBe(true);
    expect(report.unparseableFiles).toEqual([]);
  });

  it("survives `pnpm db:generate` on the committed tree: `meta/_journal.json` is committed", () => {
    const journal = resolve(
      repoRoot,
      MIGRATIONS_DIR,
      DRIZZLE_META_DIR,
      "_journal.json",
    );
    expect(existsSync(journal)).toBe(true);
    expect(
      runDbCheck(
        resolve(repoRoot, MIGRATIONS_DIR),
        resolve(repoRoot, SCHEMA_DIR),
      ).ok,
    ).toBe(true);
  });
});
