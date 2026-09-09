/**
 * T-02 (spec 003 AC-2, TASK-033): the no-database seam, asserted rather than promised.
 *
 * Spec 003 §1 and §3 make it a hard requirement that nothing this spec adds reads Postgres —
 * that is why it is implementable while spec 002's provisioning is parked (TASK-013 `blocked`).
 * `pnpm check:no-db` scans the spec-003 file set for an import of the database client, an ORM or
 * a Postgres driver, and for a read of `DATABASE_URL`; the second half is how AC-2's
 * "`DATABASE_URL` unset" clause is met without weakening `src/lib/env.schema.ts`, which still
 * requires the key for the app as a whole.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  BANNED_MODULE_PATTERNS,
  SCANNED_PATHS,
  findDatabaseImports,
  findDatabaseUrlReads,
} from "../../scripts/check-no-db-imports.ts";

const repoRoot = resolve(__dirname, "../..");
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

function tempTree(contents: string, file = "src/config/locales.ts"): string {
  const root = mkdtempSync(join(tmpdir(), "fo-no-db-"));
  tempRoots.push(root);
  const full = join(root, file);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
  return root;
}

describe("AC-2: no database import in the spec 003 file set (T-02)", () => {
  it("scans the spec 003 file set, and the list is explicit and extendable", () => {
    expect([...SCANNED_PATHS]).toEqual([
      "src/config",
      "src/modules/i18n",
      // spec 005 AC-2 (TASK-060): the catalogue and pricing module, whose whole design is a
      // no-database provider seam. `src/config/catalogue/**` (TASK-061's dataset) needs no entry
      // of its own — the `src/config` walk is recursive.
      "src/modules/catalog",
      // spec 006 AC-1 (TASK-072): the seed dataset's schemas and its deterministic projector.
      // Named file by file rather than as `seed`, because §2.6's `seed/index.ts` and
      // `seed/upload.ts` import the client on purpose once spec 002 unparks; TASK-081 owns the
      // whole-seam assertion over the files spec 006 adds.
      "seed/schema",
      "seed/project.ts",
    ]);
  });

  /**
   * spec 006 AC-1's clause "`pnpm check:no-db` covers every file added by §2.2–§2.5", as a
   * coverage assertion: what has to hold is that the dataset's schemas and its generator are
   * inside the scanned set, however the set is spelled.
   */
  it("covers the spec 006 seed schema paths (AC-1)", () => {
    for (const covered of [
      "seed/schema",
      "seed/schema/media.ts",
      "seed/project.ts",
    ]) {
      expect(
        SCANNED_PATHS.some(
          (path) => covered === path || covered.startsWith(`${path}/`),
        ),
        covered,
      ).toBe(true);
    }
  });

  it("scans a `SCANNED_PATHS` entry that names one file, not a directory", () => {
    const root = tempTree(
      'import { db } from "@/lib/db";\n',
      "seed/project.ts",
    );
    expect(
      findDatabaseImports(root, ["seed/project.ts"]).map((hit) => hit.banned),
    ).toEqual(["src/lib/db"]);
    // A non-code file named directly is skipped rather than read as TypeScript.
    const jsonRoot = tempTree("{}\n", "seed/data/products.json");
    expect(findDatabaseImports(jsonRoot, ["seed/data/products.json"])).toEqual(
      [],
    );
  });

  /**
   * spec 005 AC-2's clause "`pnpm check:no-db` passes for `src/modules/catalog/**` and
   * `src/config/catalogue/**`", as a coverage assertion rather than a path-list equality: the
   * dataset directory is reached through `src/config`, so what has to hold is that both paths are
   * *inside* the scanned set, however the set is spelled.
   */
  it("covers both spec 005 paths, the dataset directory included (AC-2)", () => {
    for (const covered of [
      "src/modules/catalog",
      "src/modules/catalog/static",
      "src/config/catalogue",
    ]) {
      expect(
        SCANNED_PATHS.some(
          (path) => covered === path || covered.startsWith(`${path}/`),
        ),
        covered,
      ).toBe(true);
    }
  });

  it("finds no database import in this repository", () => {
    expect(findDatabaseImports(repoRoot)).toEqual([]);
  });

  it("finds no `DATABASE_URL` read in this repository's spec 003 file set", () => {
    expect(findDatabaseUrlReads(repoRoot)).toEqual([]);
  });

  it("exits 0 as a script", () => {
    const out = execFileSync(
      process.execPath,
      [join(repoRoot, "scripts/check-no-db-imports.ts"), repoRoot],
      { encoding: "utf8" },
    );
    expect(out).toContain("AC-2");
  });

  it("flags every banned module, in static, type-only and dynamic import form", () => {
    const specifiers = [
      "@/lib/db",
      "@/lib/db/client",
      "../lib/db",
      "drizzle-orm",
      "drizzle-orm/node-postgres",
      "pg",
      "pg/lib/client",
      "postgres",
      "@neondatabase/serverless",
    ];
    for (const specifier of specifiers) {
      for (const form of [
        `import { x } from "${specifier}";`,
        `import type { X } from "${specifier}";`,
        `const m = await import("${specifier}");`,
        `export { x } from "${specifier}";`,
      ]) {
        const root = tempTree(`${form}\nexport const a = 1;\n`);
        const hits = findDatabaseImports(root);
        expect(hits.length, `${specifier} / ${form}`).toBe(1);
        expect(hits[0]?.file).toBe("src/config/locales.ts");
        expect(hits[0]?.specifier).toBe(specifier);
      }
    }
    expect(BANNED_MODULE_PATTERNS.length).toBeGreaterThan(0);
  });

  it("scans `src/modules/i18n` too, so TASK-034 onward cannot slip one in", () => {
    const root = tempTree(
      'import { db } from "@/lib/db";\nexport const a = db;\n',
      "src/modules/i18n/registry.ts",
    );
    expect(findDatabaseImports(root).map((hit) => hit.file)).toEqual([
      "src/modules/i18n/registry.ts",
    ]);
  });

  it("allows imports that merely look like one", () => {
    const root = tempTree(
      [
        'import { z } from "zod";',
        'import { logger } from "@/lib/logger";',
        'import { formatMoney } from "@/modules/i18n";',
        'import { CURRENCIES } from "./currencies.ts";',
        "export const a = 1;",
      ].join("\n"),
    );
    expect(findDatabaseImports(root)).toEqual([]);
  });

  it("flags a `DATABASE_URL` read in the spec 003 file set", () => {
    const root = tempTree(
      "export const url = process.env.DATABASE_URL ?? '';\n",
    );
    const hits = findDatabaseUrlReads(root);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.file).toBe("src/config/locales.ts");
  });

  it("exits non-zero as a script when a database import exists", () => {
    const root = tempTree('import { db } from "pg";\nexport const a = db;\n');
    expect(() =>
      execFileSync(
        process.execPath,
        [join(repoRoot, "scripts/check-no-db-imports.ts"), root],
        { encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow();
  });

  it("exits non-zero as a script when `DATABASE_URL` is read", () => {
    const root = tempTree("export const u = process.env.DATABASE_URL;\n");
    expect(() =>
      execFileSync(
        process.execPath,
        [join(repoRoot, "scripts/check-no-db-imports.ts"), root],
        { encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow();
  });
});
