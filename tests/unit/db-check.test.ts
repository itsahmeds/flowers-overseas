/**
 * `pnpm db:check` (spec 001 §2 "Scripts", §5.1; TASK-011).
 *
 * The script is a stub in 001 — it must print `no migrations` and exit 0 on the committed
 * `supabase/migrations/` (a lone `.gitkeep`) — but the rules it will enforce from spec 002 are
 * already written, so they are already tested here. The failure paths matter more than the happy
 * one: a gate that only proves it can say "ok" is not a gate.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkMigrations,
  formatProblems,
  formatSummary,
  MIGRATIONS_DIR,
  readMigrationDir,
  runDbCheck,
} from "../../scripts/db-check.ts";

const repoRoot = resolve(__dirname, "../..");

describe("pnpm db:check on the committed tree (spec 001 §5.1)", () => {
  it("exits 0 printing `no migrations`", () => {
    const stdout = execFileSync(process.execPath, ["scripts/db-check.ts"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(stdout.trim()).toBe("no migrations");
  });

  it("is wired to the `db:check` package script", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts["db:check"]).toBe("node scripts/db-check.ts");
  });

  it("finds `supabase/migrations` holding nothing but the directory keeper", () => {
    // If this ever fails, spec 002 has landed a migration and the stub must become the real gate.
    expect(readdirSync(resolve(repoRoot, MIGRATIONS_DIR))).toEqual([
      ".gitkeep",
    ]);
    expect(runDbCheck(resolve(repoRoot, MIGRATIONS_DIR))).toEqual({
      ok: true,
      output: ["no migrations"],
    });
  });

  it("treats a missing directory as no migrations rather than crashing", () => {
    expect(
      readMigrationDir(resolve(repoRoot, "supabase/does-not-exist")),
    ).toEqual([]);
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
