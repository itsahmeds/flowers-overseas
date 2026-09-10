/**
 * `SeedTarget` — what the seed is compared against, and the Phase-0 implementation of it
 * (spec 006 §2.1's import row, §5.2's `SeedTarget`, AC-11; TASK-076).
 *
 * **One differ, two targets.** Spec 006 §2.1 promises that `pnpm seed:diff` "compares the dataset
 * against a committed JSON snapshot and prints a per-table diff" now and "compares against the
 * database" once spec 002 unparks, with "one differ, two `SeedTarget` implementations". This file
 * is the interface and `snapshotTarget`; `dbTarget` is TASK-083's and adds no field to the
 * interface below. The founder therefore learns one command in Phase 0 and keeps it afterwards,
 * and `pnpm db:seed`'s report is this report (spec 002 AC-29 extended to media and copy).
 *
 * ## The row shape, and the one decision that makes two targets comparable
 *
 * A compared row is `{ table, key, values }`:
 *
 *  - **`key`** is the row's **natural** key as ordered named fields — `sku=FO-BQ-001`,
 *    `sku=FO-BQ-001;country=PL;tier=standard;surcharge=retail;active_from=2026-01-01` — because
 *    the natural key is what the importer upserts on (`plan/10` §4) and the only identity that
 *    exists on both sides: a snapshot has no `uuid` and the database mints one per row.
 *  - **`values`** is the projected spec 002 §5.1 row **minus the surrogate foreign-key columns**
 *    (`SURROGATE_REF_COLUMNS`). Those columns hold a `uuid` in Postgres and would differ from any
 *    Phase-0 stand-in on every single row, so a differ that compared them would report 4 000
 *    updates against a correctly seeded database. The identity they express is already in `key`,
 *    which is exactly why the projections take their parents' ids as a `ref` argument
 *    (`src/config/catalogue/projections.ts` convention 2): `dbTarget` will read the natural keys
 *    back through the same joins the importer uses and produce this same shape.
 *
 * Everything else in `values` is compared literally, so a changed price, a reworded description,
 * a flipped `is_default` or a new checksum is an update with the field, the old value and the new
 * value named.
 *
 * ## Why the snapshot lives in `seed/snapshot/` and not in `seed/data/`
 *
 * Spec 006 §5.2 sketched it as "a committed `seed/data/.snapshot.json`". It is committed here as
 * one file per table under `seed/snapshot/`, and the reason is that **`seed/data/` is the
 * dataset**:
 *
 *  1. every path under `seed/data/` is enumerated by `SEED_DATA_FILES` and read by
 *     `readSeedTree()`, and `seed:check`'s rule 1 reports any file there that has no schema in the
 *     layout ("unknown-file"). A snapshot inside the dataset would have to be either registered as
 *     a dataset file — which it is not; it is the *target* the dataset is compared against — or
 *     exempted by name, and a gate with an exemption is a gate with a hole;
 *  2. the snapshot is the Phase-0 **stand-in for the database**, and `dbTarget` replaces it whole.
 *     It belongs beside the target implementation, not beside the data the founder edits;
 *  3. a dot-file is invisible in a review and in a `ls`, and this artefact must be seen: it is
 *     what a reviewer reads to check that a dataset change is the change that was intended;
 *  4. one file per table (rather than one 1.4 MB object) keeps a diff of a price change readable
 *     in a pull request and keeps `git status`/mtime assertions per table.
 *
 * `pnpm seed:diff --write` regenerates it, and `tests/unit/seed-diff.test.ts` asserts the merged
 * tree diffs empty — so a dataset edit that forgets to re-snapshot fails with the table named
 * (AC-11). Regeneration is the differ's own flag rather than `pnpm seed:project`'s, because
 * `seed:project` has exactly one job under ADR-0017 (project `src/config/catalogue/` onto
 * `seed/data/`) and the snapshot is not a projection of the authored config: it is the target.
 *
 * No clock, no network, no environment and no database — `pnpm check:no-db` covers this file.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { format, resolveConfig } from "prettier";
import { z } from "zod";

import { SEED_DATASET_VERSION, SEED_SOURCE } from "./schema/header.ts";

/* -------------------------------------------------------------------------- */
/* The tables, in report order.                                               */
/* -------------------------------------------------------------------------- */

/**
 * The spec 002 §5.1 tables this dataset writes, in the order the report prints them: the entities
 * first, then their translations and tiers, then the dated money rows, then the media edges. The
 * order is the dependency order an importer inserts in, so a reader of a report sees the cause
 * above the consequence.
 */
export const SEED_DIFF_TABLES = [
  "product",
  "product_translation",
  "product_tier",
  "category",
  "occasion",
  "occasion_country",
  "addon",
  "country_price",
  "addon_country_price",
  "product_media",
  "media_variant",
  "product_media_alt",
] as const;

export type SeedTable = (typeof SEED_DIFF_TABLES)[number];

/**
 * Tables spec 002 §5.1 holds that this differ deliberately does **not** compare, with the reason
 * printed in the report's footer rather than left as a silent gap. Neither entry is a judgement
 * about whether the rows matter; both are missing *inputs* in Phase 0:
 *
 *  - **`media_asset`** — `toMediaAssetRow(asset, original)` needs the byte facts of the original
 *    (bucket, object key, mime, dimensions, bytes, checksum, EXIF state) and no original is ever
 *    committed (spec 006 §2.4: they live in the founder's store and a git-ignored folder, and move
 *    to R2 in §2.6). Projecting a partial row here would be the "second row shape" ADR-0017's
 *    clarification forbids. TASK-083 supplies the originals from R2 and the table joins the list
 *    with no format change — its counts appear in the same table with the same five columns.
 *  - **`category_translation`, `occasion_translation`, `addon_translation`** — spec 002 §5.1 names
 *    them only as "same translation shape" and no `to*Row()` projection for them has landed
 *    (`seed/schema/copy.ts` projects `product_translation` alone). The copy rows are in the
 *    dataset and gated by `seed:check`; the projection is spec 002's to name, and inventing three
 *    column lists here is inventing schema.
 */
export const SEED_DIFF_TABLES_NOT_COMPARED: readonly {
  readonly table: string;
  readonly reason: string;
}[] = [
  {
    table: "media_asset",
    reason:
      "toMediaAssetRow() needs the original's byte facts and no original is committed (spec 006 §2.4); TASK-083 supplies them from R2",
  },
  {
    table: "fx_rate",
    reason:
      "the FX snapshot is committed config, not dataset (`src/config/catalogue/fx.data.ts`), and spec 002's rows are written by the `fx.refresh` job (TASK-071), never seeded",
  },
  {
    table: "category_translation, occasion_translation, addon_translation",
    reason:
      "spec 002 §5.1 names the columns only as `same translation shape` and no projection has landed; the copy rows are gated by `pnpm seed:check`",
  },
];

/**
 * Columns that hold a database-minted surrogate id and are therefore not compared (see the header).
 * The identity they carry is in the row's natural `key`.
 */
export const SURROGATE_REF_COLUMNS = [
  "product_id",
  "country_id",
  "addon_id",
  "occasion_id",
  "media_asset_id",
  "product_media_id",
] as const;

/** The `source` column value a seeded row carries (`plan/10` §4). */
export const SEED_ROW_SOURCE = SEED_SOURCE;

/**
 * The `source` value the importer must never touch: a row a human has corrected in production
 * (`plan/10` §4, spec 006 §2.6, spec 002 AC-26).
 */
export const REAL_ROW_SOURCE = "real";

/* -------------------------------------------------------------------------- */
/* Rows.                                                                      */
/* -------------------------------------------------------------------------- */

/** A projected column value: JSON, because `occasion_country.rule` is jsonb. */
export type SeedValue =
  | string
  | number
  | boolean
  | null
  | readonly SeedValue[]
  | { readonly [key: string]: SeedValue };

const SeedValueSchema: z.ZodType<SeedValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(SeedValueSchema),
    z.record(z.string(), SeedValueSchema),
  ]),
);

/** One comparable row of one table (see the header for `key` versus `values`). */
export interface SeedRow {
  readonly table: SeedTable;
  /** The natural key, as ordered named fields. */
  readonly key: Readonly<Record<string, string>>;
  /** The projected spec 002 §5.1 columns, minus `SURROGATE_REF_COLUMNS`. */
  readonly values: Readonly<Record<string, SeedValue>>;
}

export const SeedRowSchema = z
  .object({
    key: z.record(z.string(), z.string()),
    values: z.record(z.string(), SeedValueSchema),
  })
  .strict();

/**
 * A row's key as one stable string: `sku=FO-BQ-001;locale=en`. Field order is the order the key
 * was built in — the order the natural key is declared in spec 002 §5.1 — so the string is a
 * deterministic identity and sorting by it groups a product's rows together.
 */
export function rowKey(key: Readonly<Record<string, string>>): string {
  return Object.entries(key)
    .map(([field, value]) => `${field}=${value}`)
    .join(";");
}

/**
 * A value as canonical JSON, with object keys sorted, for equality and for printing. Sorting is
 * what makes the comparison independent of the order a projection or a JSON parse happened to
 * produce, and printing through the same function means the report shows exactly what was
 * compared.
 */
export function canonicalValue(value: SeedValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalValue(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, SeedValue>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries.map(([field, item]) => `${JSON.stringify(field)}:${canonicalValue(item)}`).join(",")}}`;
}

/** Whether a target row is a human-owned production row the importer must not touch. */
export function isRealRow(row: SeedRow): boolean {
  return row.values["source"] === REAL_ROW_SOURCE;
}

/**
 * Build a comparable row from a projected spec 002 §5.1 row: drop the surrogate ref columns and
 * keep everything else in projection order. The one place the "minus the foreign keys" rule of the
 * header is applied, so the dataset side and both targets cannot disagree about it.
 */
export function seedRow<Projected extends object>(
  table: SeedTable,
  key: Readonly<Record<string, string>>,
  projected: Projected,
): SeedRow {
  const values: Record<string, SeedValue> = {};
  for (const [column, value] of Object.entries(projected)) {
    if ((SURROGATE_REF_COLUMNS as readonly string[]).includes(column)) continue;
    values[column] = value as SeedValue;
  }
  return { table, key, values };
}

/* -------------------------------------------------------------------------- */
/* The interface.                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What the dataset is compared against (spec 006 §5.2). `read` is async because `dbTarget` is; the
 * snapshot implementation is synchronous under the hood and says so.
 *
 * `gateOnDrift` is the one behavioural difference between the two targets and it belongs to the
 * target, not to the CLI: a **snapshot** that disagrees with the dataset is a stale committed
 * artefact and must fail the build (AC-11's "the table is named"), whereas a **database** that
 * disagrees is the normal state before `pnpm db:seed` runs and the diff is a preview. A conflict
 * fails on either target.
 */
export interface SeedTarget {
  /** `snapshot` | `db` — printed in the report header. */
  readonly name: string;
  /** Where the rows came from, for the report header (a repo path or a redacted host). */
  readonly origin: string;
  /** Whether a non-empty diff is a failure (see above). */
  readonly gateOnDrift: boolean;
  read(table: SeedTable): Promise<readonly SeedRow[]>;
}

/* -------------------------------------------------------------------------- */
/* The committed snapshot.                                                    */
/* -------------------------------------------------------------------------- */

/** The snapshot directory, relative to the repository root. */
export const SEED_SNAPSHOT_DIR = "seed/snapshot";

/** `seed/snapshot/{table}.json`, relative to the repository root. */
export function snapshotPathFor(table: SeedTable): string {
  return `${SEED_SNAPSHOT_DIR}/${table}.json`;
}

/**
 * One snapshot file: the dataset header, the table it holds and its rows. Zod at the boundary, so
 * a hand-edited or half-written snapshot is a parse error naming the file rather than a diff full
 * of phantom inserts.
 */
export const SnapshotFileSchema = z
  .object({
    version: z.literal(SEED_DATASET_VERSION),
    source: z.literal(SEED_SOURCE),
    table: z.enum(SEED_DIFF_TABLES),
    rows: z.array(SeedRowSchema),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.rows.forEach((row, index) => {
      const key = rowKey(row.key);
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "key"],
          message: `duplicate row \`${key}\` in the \`${file.table}\` snapshot: a natural key identifies one row`,
        });
      }
      seen.add(key);
    });
  });

export type SnapshotFile = z.infer<typeof SnapshotFileSchema>;

/** The rows of one snapshot file, parsed. A file that is not on disk reads as no rows. */
export function readSnapshotTable(
  root: string,
  table: SeedTable,
): readonly SeedRow[] {
  const path = join(root, snapshotPathFor(table));
  if (!existsSync(path)) return [];
  const file = SnapshotFileSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  ) as SnapshotFile;
  if (file.table !== table) {
    throw new Error(
      `${snapshotPathFor(table)}: holds the \`${file.table}\` table`,
    );
  }
  return file.rows.map((row) => ({
    table,
    key: row.key,
    values: row.values,
  }));
}

/**
 * The Phase-0 target: the committed snapshot under `seed/snapshot/`.
 *
 * A missing file reads as an empty table rather than throwing, so a fresh checkout of a table that
 * has no rows yet (`media_variant` until TASK-078 derives the ladder, `product_media_alt` until
 * TASK-077 authors the alt text) behaves the same as a committed empty one — and a *deleted*
 * snapshot shows up loudly as inserts, which is the report we want.
 */
export function snapshotTarget(root: string): SeedTarget {
  return {
    name: "snapshot",
    origin: SEED_SNAPSHOT_DIR,
    gateOnDrift: true,
    read(table) {
      return Promise.resolve(readSnapshotTable(root, table));
    },
  };
}

/**
 * An in-memory target, for tests and for `--target` implementations that already hold their rows.
 * `gateOnDrift` is the caller's, because "is a difference a failure" is a property of what the
 * rows came from.
 */
export function memoryTarget(
  rows: readonly SeedRow[],
  options: {
    readonly name?: string;
    readonly origin?: string;
    readonly gateOnDrift?: boolean;
  } = {},
): SeedTarget {
  return {
    name: options.name ?? "memory",
    origin: options.origin ?? "(in memory)",
    gateOnDrift: options.gateOnDrift ?? true,
    read(table) {
      return Promise.resolve(rows.filter((row) => row.table === table));
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Writing the snapshot (`pnpm seed:diff --write`).                           */
/* -------------------------------------------------------------------------- */

/**
 * Serialise the snapshot for one table exactly as `pnpm format:check` expects it — `seed/data`'s
 * projector does the same, and for the same reason: one formatter, one gate, no generated-file
 * exemption. Row order is the dataset's own order (never a sort), so a snapshot diff reads like
 * the dataset diff that caused it.
 */
export async function snapshotFileContents(
  root: string,
  table: SeedTable,
  rows: readonly SeedRow[],
): Promise<string> {
  const filepath = join(root, snapshotPathFor(table));
  const config = await resolveConfig(filepath);
  const value = {
    version: SEED_DATASET_VERSION,
    source: SEED_SOURCE,
    table,
    rows: rows.map((row) => ({ key: row.key, values: row.values })),
  };
  return await format(JSON.stringify(value, null, 2), {
    ...(config ?? {}),
    filepath,
  });
}

/** The whole snapshot as `{ path, contents }`, ready to write or to compare. */
export async function snapshotFiles(
  root: string,
  rows: readonly SeedRow[],
): Promise<readonly { path: string; contents: string }[]> {
  return await Promise.all(
    SEED_DIFF_TABLES.map(async (table) => ({
      path: snapshotPathFor(table),
      contents: await snapshotFileContents(
        root,
        table,
        rows.filter((row) => row.table === table),
      ),
    })),
  );
}

/** Write the snapshot. The **only** write in the seed:diff path, and never under `--dry-run`. */
export async function writeSnapshot(
  root: string,
  rows: readonly SeedRow[],
): Promise<readonly string[]> {
  const files = await snapshotFiles(root, rows);
  const written: string[] = [];
  for (const file of files) {
    const path = join(root, file.path);
    mkdirSync(dirname(path), { recursive: true });
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    // Rewriting identical bytes would change the file's mtime, which AC-11's `--dry-run`
    // assertion watches and which would make a no-op run look like a change to any watcher.
    if (current === file.contents) continue;
    writeFileSync(path, file.contents);
    written.push(file.path);
  }
  return written;
}

/** The snapshot files' modification times, for the `--dry-run` assertion of AC-11. */
export function snapshotMtimes(root: string): ReadonlyMap<string, number> {
  const mtimes = new Map<string, number>();
  for (const table of SEED_DIFF_TABLES) {
    const path = join(root, snapshotPathFor(table));
    if (existsSync(path))
      mtimes.set(snapshotPathFor(table), statSync(path).mtimeMs);
  }
  return mtimes;
}
