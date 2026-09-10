/**
 * T-11 (spec 006 AC-11; TASK-076): `pnpm seed:diff`.
 *
 * The order is the acceptance criterion's. The merged tree diffs empty; a snapshot with **one**
 * changed price reports exactly one update naming the SKU, the country, the tier and both amounts;
 * an added product inserts across every table it touches; a `source = "real"` target row is a
 * conflict and never an update; `--dry-run` writes nothing (a clean `git status` **and** unchanged
 * snapshot mtimes); the report is byte-stable; and the committed snapshot equals a fresh
 * projection of the dataset, so a dataset edit that forgets `--write` fails with the table named.
 *
 * Two testing decisions worth defending:
 *
 *  - **the target is mutated, not the dataset**, for the update and conflict cases. AC-11 says
 *    "against a snapshot with one changed price", and the dataset is the thing under review: a
 *    fixture that edited `seed/data/` would be testing the projector, which
 *    `tests/unit/seed-dataset.test.ts` already pins. `memoryTarget` over the committed snapshot's
 *    own rows keeps the fixture one field wide.
 *  - **the insert case overlays the dataset** through `readSeedTree()`'s overlay parameter — the
 *    same mechanism `seed/check-cases.ts` uses — so "an added product" is five small JSON edits in
 *    memory rather than a committed 12th product nobody wants in the catalogue.
 *
 * `readSeedTree()` re-projects the whole dataset (Prettier over 35 files), so the shared tree is
 * built once in `beforeAll` with an explicit timeout, the convention `tests/unit/seed-check.test.ts`
 * established.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { type SeedTree, readSeedTree } from "../../seed/check.ts";
import {
  DEFAULT_ROWS_PER_KIND,
  PHASE_0_AUDIT,
  SEED_DIFF_ACTOR,
  datasetRows,
  diffSeedDataset,
  diffTable,
  formatSeedDiff,
  hasChanges,
  hasConflicts,
  parseSeedDiffArgs,
  seedDiffExitCode,
} from "../../seed/diff.ts";
import {
  type SeedRow,
  type SeedTable,
  SEED_DIFF_TABLES,
  SEED_DIFF_TABLES_NOT_COMPARED,
  SEED_SNAPSHOT_DIR,
  memoryTarget,
  readSnapshotTable,
  rowKey,
  snapshotFiles,
  snapshotMtimes,
  snapshotPathFor,
  snapshotTarget,
} from "../../seed/target.ts";
import { PROJECTION_ROW_COLUMNS } from "../../src/config/catalogue/projections.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const TREE_TIMEOUT = 60_000;

/** Every row of the committed snapshot, as the differ reads it. */
function committedSnapshotRows(): readonly SeedRow[] {
  return SEED_DIFF_TABLES.flatMap((table) => readSnapshotTable(ROOT, table));
}

/** A deep clone of one raw dataset file, for an overlay. */
function rawClone(tree: SeedTree, path: string): Record<string, unknown> {
  const raw = tree.raw.get(path);
  expect(raw, `${path} is in the tree`).toBeDefined();
  return structuredClone(raw) as Record<string, unknown>;
}

/** Clone a file and append one row to it (the "added product" overlay). */
function withExtraRow(
  tree: SeedTree,
  path: string,
  pick: (rows: readonly Record<string, unknown>[]) => Record<string, unknown>,
): Record<string, unknown> {
  const file = rawClone(tree, path);
  const rows = file["rows"] as Record<string, unknown>[];
  rows.push(pick(rows));
  return file;
}

describe("seed:diff — the dataset side", () => {
  let tree: SeedTree;
  let rows: readonly SeedRow[];

  beforeAll(async () => {
    tree = await readSeedTree(ROOT);
    rows = datasetRows(tree);
  }, TREE_TIMEOUT);

  it("projects every table of the dataset through the landed to*Row() projections", () => {
    const byTable = new Map<SeedTable, number>();
    for (const row of rows) {
      byTable.set(row.table, (byTable.get(row.table) ?? 0) + 1);
    }
    expect(byTable.get("product")).toBe(84);
    expect(byTable.get("category")).toBe(23);
    expect(byTable.get("addon")).toBe(6);
    // Spec 002 §5.1's column names, not the dataset's camelCase: the differ speaks the vocabulary
    // of the table that will hold the row (ADR-0017's clarification).
    const product = rows.find((row) => row.key["sku"] === "FO-BQ-001");
    expect(Object.keys(product?.values ?? {})).toContain("product_type");
    expect(Object.keys(product?.values ?? {})).not.toContain("productType");
  });

  it("drops the surrogate foreign-key columns and keeps the natural key", () => {
    for (const row of rows) {
      expect(Object.keys(row.values)).not.toContain("product_id");
      expect(Object.keys(row.values)).not.toContain("country_id");
      expect(Object.keys(row.values)).not.toContain("media_asset_id");
      expect(rowKey(row.key).length).toBeGreaterThan(0);
    }
  });

  it("names every spec 002 §5.1 table it does not compare, and why", () => {
    const compared = new Set<string>(SEED_DIFF_TABLES);
    const excused = SEED_DIFF_TABLES_NOT_COMPARED.flatMap((entry) =>
      entry.table.split(", "),
    );
    for (const table of Object.keys(PROJECTION_ROW_COLUMNS)) {
      expect(
        compared.has(table) || excused.includes(table),
        `${table} is either diffed or listed in SEED_DIFF_TABLES_NOT_COMPARED with a reason`,
      ).toBe(true);
    }
    for (const entry of SEED_DIFF_TABLES_NOT_COMPARED) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it(
    "throws pointing at `pnpm seed:check` when a dataset file does not parse",
    async () => {
      const broken = await readSeedTree(
        ROOT,
        new Map([["addons.json", { version: 1, source: "seed" }]]),
      );
      expect(() => datasetRows(broken)).toThrow(/pnpm seed:check/u);
    },
    TREE_TIMEOUT,
  );
});

describe("seed:diff — AC-11 against the committed snapshot", () => {
  let tree: SeedTree;
  let rows: readonly SeedRow[];

  beforeAll(async () => {
    tree = await readSeedTree(ROOT);
    rows = datasetRows(tree);
  }, TREE_TIMEOUT);

  it("reports zero inserts, zero updates and zero conflicts on the merged tree", async () => {
    const target = snapshotTarget(ROOT);
    const diff = await diffSeedDataset(rows, target);
    for (const table of diff.tables) {
      expect(table.inserts, `${table.table} inserts`).toEqual([]);
      expect(table.updates, `${table.table} updates`).toEqual([]);
      expect(table.conflicts, `${table.table} conflicts`).toEqual([]);
      expect(table.orphans, `${table.table} orphans`).toEqual([]);
      expect(table.skippedReal, `${table.table} skipped-real`).toEqual([]);
    }
    expect(hasChanges(diff)).toBe(false);
    expect(seedDiffExitCode(diff, target)).toBe(0);
    expect(formatSeedDiff(diff)).toContain("no difference");
  });

  it("reports exactly one update naming the SKU, country, tier and both amounts", async () => {
    const snapshot = committedSnapshotRows();
    const index = snapshot.findIndex(
      (row) =>
        row.table === "country_price" &&
        row.key["sku"] === "FO-BQ-001" &&
        row.key["country"] === "PL" &&
        row.key["surcharge"] === "retail" &&
        row.key["tier"] !== "-",
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const original = snapshot[index] as SeedRow;
    const currentMinor = original.values["retail_minor"] as number;
    const changed: SeedRow = {
      ...original,
      values: { ...original.values, retail_minor: currentMinor - 1000 },
    };
    const target = memoryTarget([
      ...snapshot.slice(0, index),
      changed,
      ...snapshot.slice(index + 1),
    ]);

    const diff = await diffSeedDataset(rows, target);
    const updates = diff.tables.flatMap((table) => table.updates);
    expect(updates).toHaveLength(1);
    expect(diff.tables.flatMap((table) => table.inserts)).toEqual([]);
    expect(diff.tables.flatMap((table) => table.conflicts)).toEqual([]);

    const update = updates[0];
    expect(update?.table).toBe("country_price");
    expect(update?.keyFields["sku"]).toBe("FO-BQ-001");
    expect(update?.keyFields["country"]).toBe("PL");
    expect(update?.keyFields["tier"]).toBe(original.key["tier"]);
    expect(update?.changes).toHaveLength(1);
    expect(update?.changes[0]?.column).toBe("retail_minor");
    expect(update?.changes[0]?.from).toBe(currentMinor - 1000);
    expect(update?.changes[0]?.to).toBe(currentMinor);

    // The printed report is what the founder reads: the key line carries SKU, country and tier,
    // and the field line carries both amounts with the row's own currency.
    const report = formatSeedDiff(diff);
    const line = report
      .split("\n")
      .find((text) => text.includes("country_price  update"));
    expect(line).toContain("sku=FO-BQ-001");
    expect(line).toContain("country=PL");
    expect(line).toContain(`tier=${String(original.key["tier"])}`);
    expect(report).toContain(
      `retail_minor: ${String(currentMinor - 1000)} ${String(original.values["currency_code"])} -> ${String(currentMinor)} ${String(original.values["currency_code"])}`,
    );
    expect(seedDiffExitCode(diff, { gateOnDrift: true })).toBe(1);
  });

  it(
    "inserts across product, its copy, its tiers, its prices and its media edges when a product is added",
    async () => {
      const sku = "FO-BQ-999";
      const overlay = new Map<string, unknown>([
        [
          "products.json",
          withExtraRow(tree, "products.json", (existing) => ({
            ...(existing[0] as Record<string, unknown>),
            sku,
            name: "Diff Fixture",
            slug: "diff-fixture",
          })),
        ],
        [
          "copy/en/products.json",
          withExtraRow(tree, "copy/en/products.json", (existing) => ({
            ...(existing[0] as Record<string, unknown>),
            key: sku,
            name: "Diff Fixture",
            slug: "diff-fixture",
          })),
        ],
        [
          "product-tiers.json",
          withExtraRow(tree, "product-tiers.json", (existing) => ({
            ...structuredClone(existing[0] as Record<string, unknown>),
            sku,
          })),
        ],
        [
          "prices/PL.json",
          withExtraRow(tree, "prices/PL.json", (existing) => ({
            ...(existing[0] as Record<string, unknown>),
            sku,
          })),
        ],
        [
          "media.json",
          withExtraRow(tree, "media.json", (existing) => ({
            ...(existing[0] as Record<string, unknown>),
            id: "fo-bq-999-hero",
            productSku: sku,
          })),
        ],
      ]);

      const extended = datasetRows(await readSeedTree(ROOT, overlay));
      const diff = await diffSeedDataset(extended, snapshotTarget(ROOT));
      const insertedTables = new Map(
        diff.tables.map((table) => [table.table, table.inserts]),
      );

      expect(insertedTables.get("product")?.map((row) => row.key)).toEqual([
        `sku=${sku}`,
      ]);
      expect(
        insertedTables.get("product_translation")?.map((row) => row.key),
      ).toEqual([`sku=${sku};locale=en`]);
      expect(insertedTables.get("product_tier")?.length).toBeGreaterThan(0);
      expect(insertedTables.get("country_price")?.length).toBe(1);
      expect(
        insertedTables.get("product_media")?.map((row) => row.key),
      ).toEqual([`sku=${sku};asset=fo-bq-999-hero`]);
      for (const table of insertedTables.get("product_tier") ?? []) {
        expect(table.key.startsWith(`sku=${sku};`)).toBe(true);
      }
      // Nothing else moved: an added row is an insert, never an update of a neighbour.
      expect(diff.tables.flatMap((table) => table.updates)).toEqual([]);
      expect(diff.tables.flatMap((table) => table.orphans)).toEqual([]);
      expect(formatSeedDiff(diff)).toContain(`product  insert  sku=${sku}`);
    },
    TREE_TIMEOUT,
  );

  it('reports a `source = "real"` target row as a conflict and never as an update', async () => {
    const snapshot = committedSnapshotRows();
    const index = snapshot.findIndex(
      (row) => row.table === "product" && row.key["sku"] === "FO-BQ-002",
    );
    const original = snapshot[index] as SeedRow;
    const real: SeedRow = {
      ...original,
      values: {
        ...original.values,
        source: "real",
        // A change a florist made in production: the differ must still refuse to touch it.
        freshness_days: 99,
      },
    };
    const diff = await diffSeedDataset(
      rows,
      memoryTarget([
        ...snapshot.slice(0, index),
        real,
        ...snapshot.slice(index + 1),
      ]),
    );

    const product = diff.tables.find((table) => table.table === "product");
    expect(product?.updates).toEqual([]);
    expect(product?.conflicts).toHaveLength(1);
    expect(product?.conflicts[0]?.kind).toBe("source-real");
    expect(product?.conflicts[0]?.key).toBe("sku=FO-BQ-002");
    expect(product?.conflicts[0]?.message).toContain("plan/10");
    expect(product?.skippedReal.map((row) => row.key)).toEqual([
      "sku=FO-BQ-002",
    ]);
    expect(hasConflicts(diff)).toBe(true);
    expect(seedDiffExitCode(diff, { gateOnDrift: false })).toBe(1);
    expect(formatSeedDiff(diff)).toContain("conflict[source-real]");
  });

  it('keeps a `source = "real"` row the dataset does not know, without calling it drift', () => {
    const table = diffTable(
      "product",
      [],
      [
        {
          table: "product",
          key: { sku: "FO-BQ-500" },
          values: { sku: "FO-BQ-500", source: "real" },
        },
      ],
    );
    expect(table.orphans).toEqual([]);
    expect(table.conflicts).toEqual([]);
    expect(table.skippedReal.map((row) => row.key)).toEqual(["sku=FO-BQ-500"]);
  });

  it("reports a row the target has and the dataset lost as an orphan", () => {
    const table = diffTable(
      "product",
      [],
      [
        {
          table: "product",
          key: { sku: "FO-BQ-501" },
          values: { sku: "FO-BQ-501", source: "seed" },
        },
      ],
    );
    expect(table.orphans.map((row) => row.key)).toEqual(["sku=FO-BQ-501"]);
    expect(
      hasChanges({ target: { name: "t", origin: "o" }, tables: [table] }),
    ).toBe(true);
  });

  it("reports a natural-key collision on either side as a conflict", () => {
    const row: SeedRow = {
      table: "product",
      key: { sku: "FO-BQ-001" },
      values: { sku: "FO-BQ-001", source: "seed" },
    };
    expect(diffTable("product", [row, row], []).conflicts[0]?.kind).toBe(
      "duplicate-dataset-key",
    );
    expect(diffTable("product", [], [row, row]).conflicts[0]?.kind).toBe(
      "duplicate-target-key",
    );
  });
});

describe("seed:diff — the report", () => {
  let rows: readonly SeedRow[];

  beforeAll(async () => {
    rows = datasetRows(await readSeedTree(ROOT));
  }, TREE_TIMEOUT);

  it("is byte-stable across two runs and carries §11's audit fields", async () => {
    const target = snapshotTarget(ROOT);
    const first = formatSeedDiff(await diffSeedDataset(rows, target));
    const second = formatSeedDiff(await diffSeedDataset(rows, target));
    expect(first).toBe(second);
    // No clock anywhere in the report: a line that changed at midnight would not be diffable.
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T/u);
    expect(first).toContain(`actor: ${SEED_DIFF_ACTOR}`);
    expect(first).toContain("request_id: n/a");
    expect(first).toContain("dirtied cache tags: n/a");
    expect(PHASE_0_AUDIT.requestId).toBeUndefined();
    expect(PHASE_0_AUDIT.dirtiedTags).toBeUndefined();
  });

  it("fills the same header from a post-002 run without changing the format", async () => {
    const diff = await diffSeedDataset(rows, snapshotTarget(ROOT));
    const phase0 = formatSeedDiff(diff).split("\n");
    const post002 = formatSeedDiff(diff, {
      actor: SEED_DIFF_ACTOR,
      requestId: "01J8Z6XY3A",
      dirtiedTags: ["product:FO-BQ-001", "catalog:PL"],
    }).split("\n");
    expect(post002).toHaveLength(phase0.length);
    expect(post002[1]).toBe(
      `actor: ${SEED_DIFF_ACTOR} · request_id: 01J8Z6XY3A · dirtied cache tags: catalog:PL, product:FO-BQ-001`,
    );
    expect(post002.slice(2)).toEqual(phase0.slice(2));
  });

  it("caps the per-table row listing and says how many it left out", async () => {
    const diff = await diffSeedDataset(rows, memoryTarget([]));
    const report = formatSeedDiff(diff);
    expect(
      report.split("\n").filter((line) => line.includes("product  insert  "))
        .length,
    ).toBe(DEFAULT_ROWS_PER_KIND + 1);
    expect(report).toContain("… and 59 more (`--all` lists every row)");
    expect(
      formatSeedDiff(diff, PHASE_0_AUDIT, { rowsPerKind: 1000 })
        .split("\n")
        .filter((line) => line.includes("product  insert  ")).length,
    ).toBe(84);
  });
});

describe("seed:diff — the committed snapshot", () => {
  let rows: readonly SeedRow[];

  beforeAll(async () => {
    rows = datasetRows(await readSeedTree(ROOT));
  }, TREE_TIMEOUT);

  it(
    "is byte-identical to a fresh projection of the dataset, per table",
    async () => {
      for (const file of await snapshotFiles(ROOT, rows)) {
        expect(
          readFileSync(resolve(ROOT, file.path), "utf8"),
          `${file.path} differs from a fresh projection — run \`pnpm seed:diff --write\``,
        ).toBe(file.contents);
      }
    },
    TREE_TIMEOUT,
  );

  it("holds one file per diffed table under seed/snapshot/", () => {
    for (const table of SEED_DIFF_TABLES) {
      expect(snapshotPathFor(table)).toBe(`${SEED_SNAPSHOT_DIR}/${table}.json`);
      const file = JSON.parse(
        readFileSync(resolve(ROOT, snapshotPathFor(table)), "utf8"),
      ) as { table: string; source: string; version: number };
      expect(file.table).toBe(table);
      expect(file.source).toBe("seed");
      expect(file.version).toBe(1);
    }
  });

  it("keeps the dataset directory free of target files", () => {
    // The snapshot is the target, not dataset: `seed/data/` is enumerated by `SEED_DATA_FILES`
    // and `seed:check` rejects a file there that has no schema (see `seed/target.ts`'s header).
    const listing = execFileSync("git", ["ls-files", "seed/data"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(listing).not.toContain("snapshot");
  });
});

describe("seed:diff — the CLI", () => {
  it(
    "writes nothing under --dry-run (clean git status, unchanged snapshot mtimes)",
    () => {
      const before = snapshotMtimes(ROOT);
      const dirtyBefore = execFileSync(
        "git",
        ["status", "--porcelain", SEED_SNAPSHOT_DIR],
        { cwd: ROOT, encoding: "utf8" },
      );
      const stdout = execFileSync(
        "node",
        ["seed/diff.ts", "--dry-run", "--write"],
        { cwd: ROOT, encoding: "utf8" },
      );
      const after = snapshotMtimes(ROOT);
      const dirtyAfter = execFileSync(
        "git",
        ["status", "--porcelain", SEED_SNAPSHOT_DIR],
        { cwd: ROOT, encoding: "utf8" },
      );

      expect(stdout).toContain("--dry-run: nothing written");
      expect(stdout).toContain("--write suppressed");
      expect([...after.entries()]).toEqual([...before.entries()]);
      expect(dirtyAfter).toBe(dirtyBefore);
      expect(after.size).toBe(SEED_DIFF_TABLES.length);
    },
    TREE_TIMEOUT,
  );

  it(
    "exits 0 with an all-zero report on the merged tree",
    () => {
      const stdout = execFileSync("node", ["seed/diff.ts"], {
        cwd: ROOT,
        encoding: "utf8",
      });
      expect(stdout).toContain("no difference");
      expect(stdout).toContain("total");
    },
    TREE_TIMEOUT,
  );

  it(
    "prints byte-identical text on two consecutive runs",
    () => {
      const run = (): string =>
        execFileSync("node", ["seed/diff.ts"], { cwd: ROOT, encoding: "utf8" });
      expect(run()).toBe(run());
    },
    TREE_TIMEOUT,
  );

  it("parses its flags and rejects an unknown one or an unavailable target", () => {
    expect(parseSeedDiffArgs([])).toEqual({
      target: "snapshot",
      dryRun: false,
      write: false,
      report: false,
      all: false,
    });
    expect(
      parseSeedDiffArgs(["--dry-run", "--write", "--all", "--report"]),
    ).toEqual({
      target: "snapshot",
      dryRun: true,
      write: true,
      report: true,
      all: true,
    });
    expect(parseSeedDiffArgs(["--target", "snapshot"]).target).toBe("snapshot");
    expect(parseSeedDiffArgs(["--target=snapshot"]).target).toBe("snapshot");
    // `db` is TASK-083's and must not silently fall back to the snapshot.
    expect(() => parseSeedDiffArgs(["--target", "db"])).toThrow(/--target/u);
    expect(() => parseSeedDiffArgs(["--dry"])).toThrow(/unknown flag/u);
  });
});
