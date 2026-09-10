/**
 * `pnpm seed:diff` — the per-table diff between `seed/data/**` and a `SeedTarget`
 * (spec 006 §2.1's import row, §5.2, §11, AC-11, T-11; TASK-076).
 *
 * ```
 * pnpm seed:diff                      # dataset vs the committed snapshot; exit 1 on any drift
 * pnpm seed:diff --target snapshot    # the same, said explicitly (`db` arrives with TASK-083)
 * pnpm seed:diff --write              # regenerate `seed/snapshot/**` from the dataset
 * pnpm seed:diff --dry-run            # never writes anything, whatever the other flags say
 * pnpm seed:diff --report             # also append the report to the GitHub step summary
 * pnpm seed:diff --all                # list every changed row, not the first 25 per table
 * ```
 *
 * ## What it is for
 *
 * Three different readers, one report.
 *
 *  - **The founder**, editing a product or a price: the diff is the review artefact. "Exactly one
 *    update: `FO-BQ-001` in PL, `standard`, 19 900 → 21 900 PLN" is a sentence a non-programmer
 *    can check against what they meant to do, and it is the sentence AC-11 asks for.
 *  - **CI**, on the snapshot target: the snapshot is a committed artefact, so a dataset edit that
 *    forgets to re-snapshot fails here with the table named — the same "generated files are
 *    asserted, never trusted" rule ADR-0017 applies to `seed/data/` itself.
 *  - **The importer** (TASK-083, spec 002 AC-26/AC-29): `pnpm db:seed` prints *this* report
 *    against `dbTarget`, so what the seed says it will do and what it does are the same text, and
 *    "a seed run that touches more rows than the diff predicted" is a signal you can act on
 *    (spec 006 §11).
 *
 * ## The three properties that make it usable as evidence
 *
 * **It compares projected rows, not files.** Every row goes through the `to*Row()` projections
 * re-exported by `seed/schema/catalogue.ts` (ADR-0017's clarification, spec 006 §5.1's projection
 * table), so the differ speaks spec 002 §5.1's column names and a difference is reported in the
 * vocabulary of the table that will hold it. There is no second row shape here — the file contains
 * no column list of its own.
 *
 * **It is pure and offline.** `datasetRows()` and `diffSeedDataset()` are functions of a `SeedTree`
 * value and a target's rows: no clock (nothing in the report is a timestamp — a report that
 * changes at midnight is not diffable), no network, no environment beyond `GITHUB_STEP_SUMMARY`
 * inside `main()`, and no database (`pnpm check:no-db` covers this file and `seed/target.ts`). Two
 * runs on the same tree print byte-identical text.
 *
 * **It never writes unless asked.** `--dry-run` short-circuits the one write path in the module
 * (`writeSnapshot`), which is what AC-11's "clean `git status` **and** an unchanged snapshot mtime"
 * asserts; and `writeSnapshot` skips a file whose bytes are unchanged, so even `--write` on an
 * up-to-date tree touches nothing.
 *
 * ## What it does not do
 *
 * It assumes the dataset is **valid**: `pnpm seed:check` (TASK-075) owns "does this parse, are the
 * counts right, do the references resolve", with one line per problem. A parse failure here throws
 * once, naming the file and pointing at that gate, rather than growing a second error reporter
 * that would drift from the first.
 *
 * The report also carries the two fields §11 requires of a post-002 run — `actor = system:seed`
 * and a `request_id` — and the dirtied cache-tag list, printed as `n/a` in Phase 0 because there
 * is no request and no cache to dirty yet. They are in the header now so that TASK-083 fills in
 * values rather than changing the format that spec 002 AC-29 pins.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { appendFileSync } from "node:fs";

import { type SeedTree, readSeedTree } from "./check.ts";
import { seedCopyPath } from "./copy.ts";
import {
  type SeedRow,
  type SeedTable,
  type SeedTarget,
  type SeedValue,
  SEED_DIFF_TABLES,
  SEED_DIFF_TABLES_NOT_COMPARED,
  SEED_SNAPSHOT_DIR,
  canonicalValue,
  isRealRow,
  rowKey,
  seedRow,
  snapshotTarget,
  writeSnapshot,
} from "./target.ts";
import {
  seedProductTierRecords,
  toAddonCountryPriceRow,
  toAddonRow,
  toCategoryRow,
  toCountryPriceRow,
  toOccasionCountryRow,
  toOccasionRow,
  toProductRow,
  toProductTierRow,
} from "./schema/catalogue.ts";
import { toProductTranslationRow } from "./schema/copy.ts";
import {
  toMediaVariantRow,
  toProductMediaAltRow,
  toProductMediaRow,
} from "./schema/media.ts";
import {
  AddonPricesFileSchema,
  AddonsFileSchema,
  AltFileSchema,
  CategoriesFileSchema,
  CopyProductsFileSchema,
  MediaFileSchema,
  MediaVariantsFileSchema,
  OccasionCountryFileSchema,
  OccasionsFileSchema,
  PricesFileSchema,
  ProductTiersFileSchema,
  ProductsFileSchema,
  SEED_DATA_DIR,
  seedAddonPriceFilePath,
  seedPriceFilePath,
} from "./schema/files.ts";

export const CLI_NAME = "seed:diff";

/* -------------------------------------------------------------------------- */
/* The dataset side: files → projected rows.                                  */
/* -------------------------------------------------------------------------- */

/**
 * Parse one dataset file, or throw naming the gate that reports parse errors properly.
 *
 * A file that is absent reads as `undefined` and the caller contributes no rows for it — the
 * Phase-0 states `readSeedTree()` already tolerates (`media-variants.json` before TASK-078 derives
 * the ladder, `alt/` before TASK-077 authors it).
 */
function parseFile<T>(
  tree: SeedTree,
  path: string,
  schema: { parse: (value: unknown) => T },
): T | undefined {
  const raw = tree.raw.get(path);
  if (raw === undefined) return undefined;
  try {
    return schema.parse(raw);
  } catch (error) {
    throw new Error(
      `${SEED_DATA_DIR}/${path} does not parse under its schema — run \`pnpm seed:check\` for one line per problem (spec 006 §2.3 rule 1): ${String(error)}`,
    );
  }
}

/** `prices/` and `addon-prices/`, derived from the layout rather than spelled out again. */
const PRICES_PREFIX = seedPriceFilePath("XX").slice(0, -"XX.json".length);
const ADDON_PRICES_PREFIX = seedAddonPriceFilePath("XX").slice(
  0,
  -"XX.json".length,
);

/**
 * The per-destination price files present in the tree, sorted by path so the row order (and
 * therefore the snapshot) does not depend on the order the directory was read in.
 */
function priceFilePaths(tree: SeedTree, prefix: string): readonly string[] {
  return [...tree.raw.keys()].filter((path) => path.startsWith(prefix)).sort();
}

/**
 * The dataset as comparable rows, in dependency order (`SEED_DIFF_TABLES`).
 *
 * Two mappings are worth defending, because both could have been done the other way:
 *
 *  - **`product_translation` comes from `copy/{locale}/products.json`**, not from
 *    `toProductTranslationRow(product)` in `src/config/catalogue/projections.ts`. That projection
 *    is spec 002's *skeleton* — an `en` name and slug with a null description, which is exactly
 *    what keeps a product non-indexable until copy exists (spec 006 §1, spec 005 §7) — and this
 *    spec is the one that supplies the copy. Diffing the skeleton would report every authored
 *    description as an update forever.
 *  - **the natural key is passed where the projections take a parent id**
 *    (`toProductTierRow(tier, { productId: sku })`). The surrogate columns are then dropped from
 *    the compared values by `seedRow()`; `seed/target.ts`'s header says why, and it is the reason
 *    `dbTarget` can produce the same rows from real UUIDs.
 */
export function datasetRows(tree: SeedTree): readonly SeedRow[] {
  const rows: SeedRow[] = [];

  const products = parseFile(tree, "products.json", ProductsFileSchema);
  for (const product of products?.rows ?? []) {
    rows.push(seedRow("product", { sku: product.sku }, toProductRow(product)));
  }

  for (const locale of tree.copyLocales) {
    const path = seedCopyPath(locale, "product");
    const file = parseFile(tree, path, CopyProductsFileSchema);
    for (const copy of file?.rows ?? []) {
      rows.push(
        seedRow(
          "product_translation",
          { sku: copy.key, locale: copy.locale },
          toProductTranslationRow(copy, { productId: copy.key }),
        ),
      );
    }
  }

  const tiers = parseFile(tree, "product-tiers.json", ProductTiersFileSchema);
  for (const tier of seedProductTierRecords(tiers?.rows ?? [])) {
    rows.push(
      seedRow(
        "product_tier",
        { sku: tier.sku, tier: tier.tierKey },
        toProductTierRow(tier, { productId: tier.sku }),
      ),
    );
  }

  const categories = parseFile(tree, "categories.json", CategoriesFileSchema);
  for (const category of categories?.rows ?? []) {
    rows.push(
      seedRow("category", { key: category.key }, toCategoryRow(category)),
    );
  }

  const occasions = parseFile(tree, "occasions.json", OccasionsFileSchema);
  for (const occasion of occasions?.rows ?? []) {
    rows.push(
      seedRow("occasion", { key: occasion.key }, toOccasionRow(occasion)),
    );
  }

  const calendar = parseFile(
    tree,
    "occasion-country.json",
    OccasionCountryFileSchema,
  );
  for (const entry of calendar?.rows ?? []) {
    rows.push(
      seedRow(
        "occasion_country",
        { occasion: entry.occasionKey, country: entry.countryIso2 },
        toOccasionCountryRow(entry, {
          occasionId: entry.occasionKey,
          countryId: entry.countryIso2,
        }),
      ),
    );
  }

  const addons = parseFile(tree, "addons.json", AddonsFileSchema);
  for (const addon of addons?.rows ?? []) {
    rows.push(seedRow("addon", { key: addon.key }, toAddonRow(addon)));
  }

  for (const path of priceFilePaths(tree, PRICES_PREFIX)) {
    const file = parseFile(tree, path, PricesFileSchema);
    for (const price of file?.rows ?? []) {
      rows.push(
        seedRow(
          "country_price",
          {
            sku: price.sku,
            country: price.countryIso2,
            tier: price.tierKey ?? "-",
            surcharge: price.surchargeKind ?? "retail",
            active_from: price.activeFrom,
          },
          toCountryPriceRow(price, {
            productId: price.sku,
            countryId: price.countryIso2,
          }),
        ),
      );
    }
  }

  for (const path of priceFilePaths(tree, ADDON_PRICES_PREFIX)) {
    const file = parseFile(tree, path, AddonPricesFileSchema);
    for (const price of file?.rows ?? []) {
      rows.push(
        seedRow(
          "addon_country_price",
          {
            addon: price.addonKey,
            country: price.countryIso2,
            active_from: price.activeFrom,
          },
          toAddonCountryPriceRow(price, {
            addonId: price.addonKey,
            countryId: price.countryIso2,
          }),
        ),
      );
    }
  }

  const media = parseFile(tree, "media.json", MediaFileSchema);
  const assetsByProduct = new Map<string, string>();
  for (const asset of media?.rows ?? []) {
    if (asset.productSku === undefined) continue;
    assetsByProduct.set(asset.id, asset.productSku);
    rows.push(
      seedRow(
        "product_media",
        { sku: asset.productSku, asset: asset.id },
        toProductMediaRow(asset, {
          productId: asset.productSku,
          mediaAssetId: asset.id,
        }),
      ),
    );
  }

  const variants = parseFile(
    tree,
    "media-variants.json",
    MediaVariantsFileSchema,
  );
  for (const variant of variants?.rows ?? []) {
    rows.push(
      seedRow(
        "media_variant",
        {
          asset: variant.assetId,
          variant: variant.variant,
          format: variant.format,
        },
        toMediaVariantRow(variant, { mediaAssetId: variant.assetId }),
      ),
    );
  }

  for (const locale of tree.altLocales) {
    const file = parseFile(tree, `alt/${locale}.json`, AltFileSchema);
    for (const entry of file?.rows ?? []) {
      const sku = assetsByProduct.get(entry.assetId);
      // An alt entry for the homepage hero or the delivery band belongs to no product, so there
      // is no `product_media` row for it to hang off (spec 006 §2.4). `seed:check`'s media family
      // owns "does every rendered asset have alt text"; this differ only projects the rows spec
      // 002 §5.1 has a table for.
      if (sku === undefined) continue;
      rows.push(
        seedRow(
          "product_media_alt",
          { sku, asset: entry.assetId, locale },
          toProductMediaAltRow(entry, {
            productMediaId: `${sku}/${entry.assetId}`,
            localeCode: locale,
          }),
        ),
      );
    }
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* The diff.                                                                  */
/* -------------------------------------------------------------------------- */

/** One changed column: the old value and the new one, both printed (AC-11). */
export interface SeedFieldChange {
  readonly column: string;
  readonly from: SeedValue | undefined;
  readonly to: SeedValue | undefined;
}

/** One row the run would insert, or update, or leave alone because it is not ours. */
export interface SeedRowDiff {
  readonly table: SeedTable;
  /** `rowKey()` of the natural key: the identity printed in the report. */
  readonly key: string;
  readonly keyFields: Readonly<Record<string, string>>;
  /** Empty for an insert or an orphan; the changed columns for an update. */
  readonly changes: readonly SeedFieldChange[];
  /**
   * The row's own `currency_code`, where it has one, so a minor amount is printed with its
   * currency (`CLAUDE.md`: money is an integer **and** a currency). Read from the row, never from
   * a country table.
   */
  readonly currency?: string | undefined;
}

/** Why a row cannot be applied as written. */
export const SEED_CONFLICT_KINDS = [
  /** The target row is `source = "real"`: the importer never touches it (`plan/10` §4). */
  "source-real",
  /** Two dataset rows claim one natural key: the importer would upsert over itself. */
  "duplicate-dataset-key",
  /** Two target rows claim one natural key: the target is already inconsistent. */
  "duplicate-target-key",
] as const;

export type SeedConflictKind = (typeof SEED_CONFLICT_KINDS)[number];

export interface SeedConflict {
  readonly table: SeedTable;
  readonly key: string;
  readonly kind: SeedConflictKind;
  readonly message: string;
}

/**
 * One table's diff. `inserts` / `updates` / `unchanged` / `skippedReal` / `conflicts` are spec 006
 * §5.2's tuple; `orphans` is one addition, recorded as a decision rather than taken silently.
 *
 * An **orphan** is a row the target has and the dataset does not, and it is not a deletion
 * instruction: the importer never deletes (a retired product is a dated status flip, `plan/02`
 * §7). It exists because without it, *removing* a product from the dataset would diff empty
 * against a stale snapshot — and "a dataset edit without re-snapshotting fails with the table
 * named" has to hold for removals too. A `source = "real"` row the dataset does not know is **not**
 * an orphan: it is a production row that legitimately outlives the seed.
 */
export interface SeedTableDiff {
  readonly table: SeedTable;
  readonly inserts: readonly SeedRowDiff[];
  readonly updates: readonly SeedRowDiff[];
  readonly unchanged: number;
  readonly skippedReal: readonly SeedRowDiff[];
  readonly orphans: readonly SeedRowDiff[];
  readonly conflicts: readonly SeedConflict[];
}

export interface SeedDiff {
  readonly target: { readonly name: string; readonly origin: string };
  readonly tables: readonly SeedTableDiff[];
}

/** The changed columns between a dataset row and a target row, in projection order. */
function fieldChanges(dataset: SeedRow, target: SeedRow): SeedFieldChange[] {
  const columns = [
    ...Object.keys(dataset.values),
    ...Object.keys(target.values).filter(
      (column) => !(column in dataset.values),
    ),
  ];
  const changes: SeedFieldChange[] = [];
  for (const column of columns) {
    const from = target.values[column];
    const to = dataset.values[column];
    if (canonicalValue(from ?? null) === canonicalValue(to ?? null)) continue;
    changes.push({ column, from, to });
  }
  return changes;
}

const byKey = (left: { key: string }, right: { key: string }): number =>
  left.key.localeCompare(right.key);

/** Index rows by natural key, reporting a collision instead of overwriting it. */
function indexRows(
  table: SeedTable,
  rows: readonly SeedRow[],
  kind: SeedConflictKind,
  side: string,
): { index: Map<string, SeedRow>; conflicts: SeedConflict[] } {
  const index = new Map<string, SeedRow>();
  const conflicts: SeedConflict[] = [];
  for (const row of rows) {
    const key = rowKey(row.key);
    if (index.has(key)) {
      conflicts.push({
        table,
        key,
        kind,
        message: `two ${side} rows claim the natural key \`${key}\`: it identifies exactly one row (\`plan/10\` §4 upserts on it)`,
      });
      continue;
    }
    index.set(key, row);
  }
  return { index, conflicts };
}

/**
 * Diff one table. Pure, and the classification order is the one that matters: a
 * `source = "real"` target row is decided **before** the values are compared, so a real row can
 * never be reported as an update no matter what changed in the dataset (AC-11, `plan/10` §4).
 */
export function diffTable(
  table: SeedTable,
  dataset: readonly SeedRow[],
  target: readonly SeedRow[],
): SeedTableDiff {
  const left = indexRows(table, dataset, "duplicate-dataset-key", "dataset");
  const right = indexRows(table, target, "duplicate-target-key", "target");

  /** The row's own currency, where its table has one (`country_price`, `addon_country_price`). */
  const currencyOf = (row: SeedRow): string | undefined => {
    const currency = row.values["currency_code"];
    return typeof currency === "string" ? currency : undefined;
  };

  const inserts: SeedRowDiff[] = [];
  const updates: SeedRowDiff[] = [];
  const skippedReal: SeedRowDiff[] = [];
  const orphans: SeedRowDiff[] = [];
  const conflicts: SeedConflict[] = [...left.conflicts, ...right.conflicts];
  let unchanged = 0;

  for (const [key, row] of left.index) {
    const current = right.index.get(key);
    if (current === undefined) {
      inserts.push({
        table,
        key,
        keyFields: row.key,
        changes: [],
        currency: currencyOf(row),
      });
      continue;
    }
    if (isRealRow(current)) {
      const changes = fieldChanges(row, current);
      skippedReal.push({
        table,
        key,
        keyFields: row.key,
        changes,
        currency: currencyOf(row),
      });
      conflicts.push({
        table,
        key,
        kind: "source-real",
        message: `the target row is \`source = "${String(current.values["source"])}"\` and the importer never touches it (\`plan/10\` §4, spec 002 AC-29)${changes.length > 0 ? `: ${String(changes.length)} column(s) would otherwise change` : ""}`,
      });
      continue;
    }
    const changes = fieldChanges(row, current);
    if (changes.length === 0) {
      unchanged += 1;
      continue;
    }
    updates.push({
      table,
      key,
      keyFields: row.key,
      changes,
      currency: currencyOf(row),
    });
  }

  for (const [key, row] of right.index) {
    if (left.index.has(key)) continue;
    if (isRealRow(row)) {
      // A production row the seed does not own: left alone, and not drift (see `SeedTableDiff`).
      skippedReal.push({
        table,
        key,
        keyFields: row.key,
        changes: [],
        currency: currencyOf(row),
      });
      continue;
    }
    orphans.push({
      table,
      key,
      keyFields: row.key,
      changes: [],
      currency: currencyOf(row),
    });
  }

  return {
    table,
    inserts: inserts.sort(byKey),
    updates: updates.sort(byKey),
    unchanged,
    skippedReal: skippedReal.sort(byKey),
    orphans: orphans.sort(byKey),
    conflicts: conflicts.sort(
      (a, b) => a.key.localeCompare(b.key) || a.kind.localeCompare(b.kind),
    ),
  };
}

/** Diff every table of `SEED_DIFF_TABLES`, in that order. */
export async function diffSeedDataset(
  rows: readonly SeedRow[],
  target: SeedTarget,
): Promise<SeedDiff> {
  const tables: SeedTableDiff[] = [];
  for (const table of SEED_DIFF_TABLES) {
    tables.push(
      diffTable(
        table,
        rows.filter((row) => row.table === table),
        await target.read(table),
      ),
    );
  }
  return {
    target: { name: target.name, origin: target.origin },
    tables,
  };
}

/** Whether the run would change anything (`unchanged` and `skippedReal` are not changes). */
export function hasChanges(diff: SeedDiff): boolean {
  return diff.tables.some(
    (table) =>
      table.inserts.length > 0 ||
      table.updates.length > 0 ||
      table.orphans.length > 0 ||
      table.conflicts.length > 0,
  );
}

export function hasConflicts(diff: SeedDiff): boolean {
  return diff.tables.some((table) => table.conflicts.length > 0);
}

/**
 * The exit code: a conflict always fails; drift fails only where the target says it should
 * (`SeedTarget.gateOnDrift` — a stale snapshot is a build failure, a not-yet-seeded database is
 * not).
 */
export function seedDiffExitCode(
  diff: SeedDiff,
  target: Pick<SeedTarget, "gateOnDrift">,
): number {
  if (hasConflicts(diff)) return 1;
  return target.gateOnDrift && hasChanges(diff) ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* The report (§11's audit trail).                                            */
/* -------------------------------------------------------------------------- */

/**
 * The §11 audit fields a post-002 run carries. `actor` is fixed by `plan/11` §1's convention;
 * `requestId` and `dirtiedTags` are `undefined` in Phase 0 and print as `n/a` — there is no
 * request and nothing to invalidate until the importer writes to a database (spec 006 §5.4). They
 * are part of the shape now so TASK-083 supplies values without changing the format spec 002
 * AC-29 pins.
 */
export interface SeedDiffAudit {
  readonly actor: string;
  readonly requestId?: string;
  readonly dirtiedTags?: readonly string[];
}

/** `plan/11` §1's actor for a seed run. */
export const SEED_DIFF_ACTOR = "system:seed";

export const PHASE_0_AUDIT: SeedDiffAudit = { actor: SEED_DIFF_ACTOR };

const NOT_AVAILABLE = "n/a";

/** A value as report text: canonical JSON, truncated deterministically when it is prose. */
export function printValue(value: SeedValue | undefined): string {
  if (value === undefined) return "(absent)";
  const text = canonicalValue(value);
  if (text.length <= 96) return text;
  return `${text.slice(0, 93)}…" (${String(text.length)} chars)`;
}

/**
 * One changed column as report text. Where the row carries a currency, an integer minor amount is
 * printed with it — `retail_minor: 19900 -> 21900 PLN` — because a money figure with no currency
 * is not a money figure (`CLAUDE.md`), and because AC-11 asks for **both** amounts in a form the
 * founder can check.
 */
function printChange(
  change: SeedFieldChange,
  currency: string | undefined,
): string {
  const suffix =
    change.column.endsWith("_minor") && currency !== undefined
      ? ` ${currency}`
      : "";
  return `${change.column}: ${printValue(change.from)}${suffix} -> ${printValue(change.to)}${suffix}`;
}

function pad(text: string, width: number): string {
  return text.length >= width
    ? text
    : `${text}${" ".repeat(width - text.length)}`;
}

function padStart(text: string, width: number): string {
  return text.length >= width
    ? text
    : `${" ".repeat(width - text.length)}${text}`;
}

const COUNT_COLUMNS = [
  "inserts",
  "updates",
  "unchanged",
  "skipped-real",
  "orphans",
  "conflicts",
] as const;

function countsOf(table: SeedTableDiff): readonly number[] {
  return [
    table.inserts.length,
    table.updates.length,
    table.unchanged,
    table.skippedReal.length,
    table.orphans.length,
    table.conflicts.length,
  ];
}

/**
 * The report: a per-table count table, then every change with its key and its columns, then the
 * tables this phase cannot compare and why.
 *
 * **Stable by construction.** No clock, no path outside the repository, no set iteration order
 * (tables come from `SEED_DIFF_TABLES`, rows are sorted by natural key, columns are in projection
 * order), and column widths are computed from the printed values. Two runs on one tree produce
 * identical bytes, which is what makes the report diffable and pasteable into a pull request.
 */
export const DEFAULT_ROWS_PER_KIND = 25;

export interface SeedDiffReportOptions {
  /**
   * How many rows of one (table, kind) to list before summarising the rest. A first seed run
   * against an empty target is 4 243 inserts and a wall of text nobody reads; the cap keeps the
   * report a review artefact, the "… and N more" line keeps the number honest, and `--all` prints
   * every row when that is what you want. Deterministic either way: the rows are sorted by
   * natural key before the cap is applied.
   */
  readonly rowsPerKind?: number;
}

export function formatSeedDiff(
  diff: SeedDiff,
  audit: SeedDiffAudit = PHASE_0_AUDIT,
  options: SeedDiffReportOptions = {},
): string {
  const rowsPerKind = options.rowsPerKind ?? DEFAULT_ROWS_PER_KIND;
  const lines: string[] = [];
  lines.push(
    `${CLI_NAME} — dataset \`${SEED_DATA_DIR}\` vs target \`${diff.target.name}\` (${diff.target.origin})`,
  );
  lines.push(
    `actor: ${audit.actor} · request_id: ${audit.requestId ?? NOT_AVAILABLE} · dirtied cache tags: ${
      audit.dirtiedTags === undefined || audit.dirtiedTags.length === 0
        ? NOT_AVAILABLE
        : [...audit.dirtiedTags].sort((a, b) => a.localeCompare(b)).join(", ")
    }`,
  );
  lines.push("");

  const totals = diff.tables.reduce<number[]>(
    (sum, table) =>
      countsOf(table).map((count, index) => count + (sum[index] ?? 0)),
    COUNT_COLUMNS.map(() => 0),
  );
  const tableWidth = Math.max(
    "table".length,
    "total".length,
    ...diff.tables.map((table) => table.table.length),
  );
  const widths = COUNT_COLUMNS.map((column, index) =>
    Math.max(
      column.length,
      String(totals[index] ?? 0).length,
      ...diff.tables.map((table) => String(countsOf(table)[index] ?? 0).length),
    ),
  );
  const row = (label: string, counts: readonly (number | string)[]): string =>
    [
      pad(label, tableWidth),
      ...counts.map((count, index) =>
        padStart(String(count), widths[index] ?? 1),
      ),
    ].join("  ");

  lines.push(row("table", COUNT_COLUMNS));
  for (const table of diff.tables)
    lines.push(row(table.table, countsOf(table)));
  lines.push(row("total", totals));
  lines.push("");

  if (hasChanges(diff)) {
    lines.push("changes");
    for (const table of diff.tables) {
      const kinds: readonly {
        readonly label: string;
        readonly rows: readonly SeedRowDiff[];
      }[] = [
        { label: "insert", rows: table.inserts },
        { label: "update", rows: table.updates },
        { label: "orphan", rows: table.orphans },
      ];
      for (const kind of kinds) {
        for (const change of kind.rows.slice(0, rowsPerKind)) {
          lines.push(`  ${table.table}  ${kind.label}  ${change.key}`);
          for (const field of change.changes) {
            lines.push(`      ${printChange(field, change.currency)}`);
          }
        }
        if (kind.rows.length > rowsPerKind) {
          lines.push(
            `  ${table.table}  ${kind.label}  … and ${String(kind.rows.length - rowsPerKind)} more (\`--all\` lists every row)`,
          );
        }
      }
      // Conflicts are never capped: every one of them is a row the importer would refuse, and a
      // truncated conflict list is the one place a reader could miss the row that matters.
      for (const conflict of table.conflicts) {
        lines.push(
          `  ${table.table}  conflict[${conflict.kind}]  ${conflict.key}  ${conflict.message}`,
        );
      }
    }
    lines.push("");
  } else {
    lines.push(
      `no difference: the dataset and the ${diff.target.name} agree (spec 006 AC-11)`,
    );
    lines.push("");
  }

  lines.push("not compared in this phase");
  for (const entry of SEED_DIFF_TABLES_NOT_COMPARED) {
    lines.push(`  ${entry.table}: ${entry.reason}`);
  }
  return `${lines.join("\n")}\n`;
}

/* -------------------------------------------------------------------------- */
/* CLI.                                                                       */
/* -------------------------------------------------------------------------- */

/** The targets `--target` accepts. `db` lands with TASK-083 and needs no new flag. */
export const SEED_DIFF_TARGETS = ["snapshot"] as const;

export interface SeedDiffOptions {
  readonly target: (typeof SEED_DIFF_TARGETS)[number];
  readonly dryRun: boolean;
  readonly write: boolean;
  readonly report: boolean;
  /** List every changed row instead of the first `DEFAULT_ROWS_PER_KIND` per (table, kind). */
  readonly all: boolean;
}

/** Parse the CLI arguments, rejecting an unknown flag rather than ignoring it. */
export function parseSeedDiffArgs(argv: readonly string[]): SeedDiffOptions {
  let target: (typeof SEED_DIFF_TARGETS)[number] = "snapshot";
  let dryRun = false;
  let write = false;
  let report = false;
  let all = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--write") write = true;
    else if (arg === "--report") report = true;
    else if (arg === "--all") all = true;
    else if (arg === "--target" || arg?.startsWith("--target=")) {
      const value = arg.startsWith("--target=")
        ? arg.slice("--target=".length)
        : argv[(index += 1)];
      if (
        value === undefined ||
        !(SEED_DIFF_TARGETS as readonly string[]).includes(value)
      ) {
        throw new Error(
          `--target must be one of ${SEED_DIFF_TARGETS.join(", ")} (\`db\` arrives with the importer, spec 006 §2.6)`,
        );
      }
      target = value as (typeof SEED_DIFF_TARGETS)[number];
    } else if (arg !== undefined && arg.startsWith("--")) {
      throw new Error(`unknown flag \`${arg}\``);
    }
  }
  return { target, dryRun, write, report, all };
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const options = parseSeedDiffArgs(process.argv.slice(2));
  const root = resolve(process.cwd());
  const tree = await readSeedTree(root);
  const rows = datasetRows(tree);
  const target = snapshotTarget(root);
  const diff = await diffSeedDataset(rows, target);
  const report = formatSeedDiff(
    diff,
    PHASE_0_AUDIT,
    options.all ? { rowsPerKind: Number.MAX_SAFE_INTEGER } : {},
  );
  process.stdout.write(report);

  if (options.report) {
    const summary = process.env["GITHUB_STEP_SUMMARY"];
    if (summary !== undefined && summary !== "") {
      appendFileSync(summary, `## seed:diff\n\n\`\`\`\n${report}\`\`\`\n`);
    }
  }

  if (options.write && !options.dryRun) {
    const written = await writeSnapshot(root, rows);
    process.stdout.write(
      written.length === 0
        ? `${SEED_SNAPSHOT_DIR}: already up to date (${String(rows.length)} row(s))\n`
        : `${SEED_SNAPSHOT_DIR}: wrote ${String(written.length)} file(s): ${written.join(", ")}\n`,
    );
    process.exit(0);
  }

  if (options.dryRun) {
    process.stdout.write(
      `--dry-run: nothing written (${options.write ? "--write suppressed" : "no write was requested"})\n`,
    );
  }

  process.exit(seedDiffExitCode(diff, target));
}
