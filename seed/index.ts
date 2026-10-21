/**
 * `pnpm db:seed` — the idempotent database seed (spec 002 §2 "Seed", AC-28, AC-29, AC-32;
 * `plan/10` §4; TASK-026).
 *
 * Usage:
 *   pnpm db:seed [--only=reference,geo,catalog,partners] [--dry-run] [--insert-only]
 *
 * Contract:
 *  - **natural keys only.** Every table is upserted on the key `seed/plan.ts` names (`iso2`,
 *    `sku`, `code`, `key`, and the parents' keys for child rows); a parent's surrogate id is read
 *    back from the database by its natural key, never assumed;
 *  - **a second run changes nothing.** A row is updated only when one of its seeded values differs
 *    (`IS DISTINCT FROM`), so `updated_at` does not move on a rerun and the report says
 *    `0 inserted, 0 updated` (AC-28, AC-29);
 *  - **never a `real` row, nor a row under one.** On a table with `source`, a row whose
 *    `source = 'real'` is reported `real` and left exactly as it is (`plan/10` §4). So is every
 *    row whose parent product, country or florist is `real` (`product_id`, `country_id`,
 *    `partner_id`): it is neither updated nor inserted, so a product, country or florist an admin
 *    has written keeps its translations, tiers, prices, mappings and coverage exactly as admin left
 *    them (spec 012b §2.2, AC-1; TASK-292);
 *  - **`--insert-only` adds what is missing and changes nothing** (spec 012b §2.0 item 5, AC-1):
 *    no `UPDATE` is issued at all, so every existing row keeps its exact contents. It is the only
 *    mode allowed when `APP_ENV=production`: a plain seed there refuses to start
 *    (`assertSeedModeAllowed`), because putting a hand-edited seeded value "back" in production
 *    would overwrite the live catalogue;
 *  - **`--dry-run` writes nothing.** The run happens inside a transaction that is rolled back, so
 *    the counts it prints are the ones a real run would produce;
 *  - **`--only`** runs the named groups in dependency order; the parents a group reads must
 *    already be seeded;
 *  - the connection is `DATABASE_URL_UNPOOLED` (§13 Q6), from the process environment only, and
 *    the writes run as `app_owner`, which owns every table (so RLS does not apply to the seed).
 *
 * One statement per table: the rows go in as one `jsonb` array, typed by `jsonb_to_recordset` with
 * the table's own column types, and a data-modifying CTE updates what differs and inserts what is
 * missing. Logs counts per table, never a row.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";
import { z } from "zod";

import { appEnvironment, type EnvSource } from "../src/lib/env.schema.ts";

import { readSeedTree } from "./check.ts";
import {
  SEED_GROUPS,
  buildSeedPlan,
  cityKey,
  type SeedCell,
  type SeedDbRow,
  type SeedGroup,
  type SeedRef,
  type SeedTablePlan,
} from "./plan.ts";

export const CLI_NAME = "db:seed";

export type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;

/** What one table's upsert did. */
export interface SeedTableReport {
  readonly table: string;
  readonly rows: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Rows left alone because a human flipped them to `source = 'real'`. */
  readonly real: number;
  /**
   * Rows left alone (neither updated nor inserted) because their parent product, country or
   * florist is `real`, and which are not `real` themselves (spec 012b AC-1).
   */
  readonly underReal: number;
}

export interface SeedReport {
  readonly dryRun: boolean;
  readonly insertOnly: boolean;
  readonly groups: readonly SeedGroup[];
  readonly tables: readonly SeedTableReport[];
}

export interface SeedOptions {
  readonly only?: readonly SeedGroup[];
  readonly dryRun?: boolean;
  /** Insert missing rows, update none (spec 012b AC-1). */
  readonly insertOnly?: boolean;
}

const OptionsSchema = z.object({
  only: z.array(z.enum(SEED_GROUPS)).min(1).optional(),
  dryRun: z.boolean(),
  insertOnly: z.boolean(),
});

/** `--only=a,b`, `--dry-run` and `--insert-only`; anything else is refused. */
export function parseSeedArgs(argv: readonly string[]): SeedOptions {
  let only: string[] | undefined;
  let dryRun = false;
  let insertOnly = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--insert-only") insertOnly = true;
    else if (arg.startsWith("--only=")) {
      only = arg
        .slice("--only=".length)
        .split(",")
        .map((group) => group.trim())
        .filter((group) => group !== "");
    } else {
      throw new Error(`${CLI_NAME}: unknown argument ${JSON.stringify(arg)}`);
    }
  }
  const parsed = OptionsSchema.parse({
    dryRun,
    insertOnly,
    ...(only === undefined ? {} : { only }),
  });
  return {
    dryRun: parsed.dryRun,
    insertOnly: parsed.insertOnly,
    ...(parsed.only === undefined ? {} : { only: parsed.only }),
  };
}

/** What a plain seed in production prints before it exits non-zero (spec 012b AC-1). */
export const PRODUCTION_REFUSAL = `${CLI_NAME}: APP_ENV=production allows only --insert-only (a plain seed would overwrite rows the live catalogue owns)`;

/**
 * Refuses a plain seed in production (spec 012b §2.0 item 5, AC-1). The environment is
 * `appEnvironment()`'s, the one every other gate reads (an unparseable `APP_ENV` throws there).
 */
export function assertSeedModeAllowed(
  environment: EnvSource,
  options: SeedOptions,
): void {
  if (
    appEnvironment(environment) === "production" &&
    options.insertOnly !== true
  ) {
    throw new Error(PRODUCTION_REFUSAL);
  }
}

/**
 * The parent columns whose row, when `source = 'real'`, puts the child out of the seed's reach
 * (spec 012b §2.2, AC-1): the product, the country and the florist.
 */
export const REAL_PARENT_COLUMNS: Readonly<Record<string, string>> = {
  product_id: "product",
  country_id: "country",
  partner_id: "fulfillment_partner",
};

function isRef(cell: SeedCell): cell is SeedRef {
  return (
    typeof cell === "object" &&
    cell !== null &&
    !Array.isArray(cell) &&
    "ref" in cell &&
    "key" in cell &&
    Object.keys(cell).length === 2
  );
}

/** The natural key → id maps a plan's refs read, loaded fresh before each table. */
async function loadRefs(
  tx: Tx,
  kinds: ReadonlySet<SeedRef["ref"]>,
): Promise<Map<SeedRef["ref"], Map<string, string>>> {
  const maps = new Map<SeedRef["ref"], Map<string, string>>();
  const load = async (
    kind: SeedRef["ref"],
    query: Promise<readonly { k: string; id: string }[]>,
  ) => {
    maps.set(kind, new Map((await query).map((row) => [row.k, row.id])));
  };
  for (const kind of kinds) {
    if (kind === "country")
      await load(kind, tx`SELECT iso2 AS k, id FROM public.country`);
    if (kind === "product")
      await load(kind, tx`SELECT sku AS k, id FROM public.product`);
    if (kind === "addon")
      await load(kind, tx`SELECT key AS k, id FROM public.addon`);
    if (kind === "occasion")
      await load(kind, tx`SELECT key AS k, id FROM public.occasion`);
    if (kind === "partner")
      await load(
        kind,
        tx`SELECT code AS k, id FROM public.fulfillment_partner`,
      );
    if (kind === "city")
      await load(
        kind,
        tx`SELECT c.iso2 || '/' || t.slug AS k, t.city_id AS id
           FROM public.city_translation t JOIN public.country c ON c.id = t.country_id
           WHERE t.locale_code = 'en'`,
      );
  }
  return maps;
}

function resolveRows(
  plan: SeedTablePlan,
  rows: readonly SeedDbRow[],
  refs: Map<SeedRef["ref"], Map<string, string>>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [column, cell] of Object.entries(row)) {
      if (isRef(cell)) {
        const id = refs.get(cell.ref)?.get(cell.key);
        if (id === undefined) {
          throw new Error(
            `${CLI_NAME}: ${plan.table}.${column} names ${cell.ref} "${cell.key}", which is not seeded (run its group first)`,
          );
        }
        out[column] = id;
      } else {
        out[column] = cell;
      }
    }
    return out;
  });
}

function refKinds(rows: readonly SeedDbRow[]): Set<SeedRef["ref"]> {
  const kinds = new Set<SeedRef["ref"]>();
  for (const row of rows) {
    for (const cell of Object.values(row)) if (isRef(cell)) kinds.add(cell.ref);
  }
  return kinds;
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`${CLI_NAME}: not a plain identifier: ${name}`);
  }
  return `"${name}"`;
}

/** The SQL types of `table`'s columns, as `format_type` prints them. */
async function columnTypes(
  tx: Tx,
  table: string,
): Promise<Map<string, string>> {
  const rows = await tx<{ name: string; type: string }[]>`
    SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_attribute a
    WHERE a.attrelid = ${`public.${table}`}::regclass AND a.attnum > 0 AND NOT a.attisdropped`;
  return new Map(rows.map((row) => [row.name, row.type]));
}

/** Upserts one table's rows in one statement; see the header. */
async function upsertTable(
  tx: Tx,
  plan: SeedTablePlan,
  rows: readonly Record<string, unknown>[],
  insertOnly: boolean,
): Promise<SeedTableReport> {
  const empty = {
    table: plan.table,
    rows: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    real: 0,
    underReal: 0,
  };
  const first = rows[0];
  if (first === undefined) return empty;
  const columns = Object.keys(first);
  const types = await columnTypes(tx, plan.table);
  for (const column of columns) {
    if (!types.has(column)) {
      throw new Error(
        `${CLI_NAME}: ${plan.table} has no column ${column} (the projection and the migration disagree)`,
      );
    }
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify(plan.key.map((column) => row[column] ?? null));
    if (seen.has(key)) {
      throw new Error(
        `${CLI_NAME}: duplicate natural key in ${plan.table}: ${key}`,
      );
    }
    seen.add(key);
  }
  const table = `public.${ident(plan.table)}`;
  const recordset = columns
    .map((column) => `${ident(column)} ${types.get(column) ?? "text"}`)
    .join(", ");
  const keyMatch = plan.key
    .map(
      (column) => `t.${ident(column)} IS NOT DISTINCT FROM i.${ident(column)}`,
    )
    .join(" AND ");
  const insertOnlyColumns = plan.insertOnlyColumns ?? [];
  const valueColumns = columns.filter(
    (column) =>
      !plan.key.includes(column) && !insertOnlyColumns.includes(column),
  );
  const differs =
    valueColumns.length === 0
      ? "false"
      : `(${valueColumns.map((c) => `t.${ident(c)}`).join(", ")}) IS DISTINCT FROM (${valueColumns
          .map((c) => `i.${ident(c)}`)
          .join(", ")})`;
  const set = valueColumns
    .map((column) => `${ident(column)} = i.${ident(column)}`)
    .join(", ");
  const guard = plan.sourceGuarded ? `AND t.source <> 'real'` : "";
  // A row under a `real` product, country or florist is out of reach (see the header).
  const parentReal = columns
    .filter((column) => REAL_PARENT_COLUMNS[column] !== undefined)
    .map(
      (column) =>
        `EXISTS (SELECT 1 FROM public.${ident(REAL_PARENT_COLUMNS[column] ?? "")} p WHERE p.id = r.${ident(column)} AND p.source = 'real')`,
    );
  const parentRealExpr =
    parentReal.length === 0 ? "false" : parentReal.join(" OR ");
  const selfReal = plan.sourceGuarded
    ? `EXISTS (SELECT 1 FROM ${table} t WHERE ${keyMatch} AND t.source = 'real')`
    : "false";
  const update =
    insertOnly || valueColumns.length === 0
      ? `upd AS (SELECT 1 WHERE false)`
      : `upd AS (UPDATE ${table} t SET ${set} FROM i WHERE ${keyMatch} ${guard} AND NOT i.fo_parent_real AND ${differs} RETURNING 1)`;
  const statement = `
    WITH r AS (SELECT * FROM jsonb_to_recordset($1::text::jsonb) AS x(${recordset})),
    i AS (SELECT r.*, (${parentRealExpr}) AS fo_parent_real FROM r),
    ${update},
    ins AS (
      INSERT INTO ${table} (${columns.map(ident).join(", ")})
      SELECT ${columns.map((c) => `i.${ident(c)}`).join(", ")} FROM i
      WHERE NOT i.fo_parent_real AND NOT EXISTS (SELECT 1 FROM ${table} t WHERE ${keyMatch})
      RETURNING 1)
    SELECT (SELECT count(*) FROM ins)::int AS inserted,
           (SELECT count(*) FROM upd)::int AS updated,
           (SELECT count(*) FROM i WHERE ${selfReal})::int AS real,
           (SELECT count(*) FROM i WHERE i.fo_parent_real AND NOT ${selfReal})::int AS under_real`;
  const [counts] = await tx.unsafe<
    { inserted: number; updated: number; real: number; under_real: number }[]
  >(statement, [JSON.stringify(rows)]);
  const inserted = counts?.inserted ?? 0;
  const updated = counts?.updated ?? 0;
  const real = counts?.real ?? 0;
  const underReal = counts?.under_real ?? 0;
  return {
    table: plan.table,
    rows: rows.length,
    inserted,
    updated,
    real,
    underReal,
    unchanged: rows.length - inserted - updated - real - underReal,
  };
}

/**
 * Cities have no natural-key column of their own: a city is identified by its country and its
 * `en` slug in `city_translation`. A missing one gets a `city` row and its `en` translation; an
 * existing one gets its `en` name brought up to date.
 */
async function upsertCities(
  tx: Tx,
  plan: SeedTablePlan,
  rows: readonly Record<string, unknown>[],
  insertOnly: boolean,
): Promise<SeedTableReport> {
  let inserted = 0;
  let updated = 0;
  let underReal = 0;
  for (const row of rows) {
    const countryId = String(row["country_id"]);
    const slug = String(row["slug"]);
    const name = String(row["name"]);
    const [country] = await tx<{ source: string }[]>`
      SELECT source FROM public.country WHERE id = ${countryId}`;
    if (country?.source === "real") {
      underReal += 1;
      continue;
    }
    const [existing] = await tx<{ city_id: string; name: string }[]>`
      SELECT city_id, name FROM public.city_translation
      WHERE locale_code = 'en' AND country_id = ${countryId} AND slug = ${slug}`;
    if (existing === undefined) {
      const [city] = await tx<{ id: string }[]>`
        INSERT INTO public.city (country_id) VALUES (${countryId}) RETURNING id`;
      await tx`
        INSERT INTO public.city_translation (city_id, country_id, locale_code, name, slug)
        VALUES (${city?.id ?? ""}, ${countryId}, 'en', ${name}, ${slug})`;
      inserted += 1;
    } else if (!insertOnly && existing.name !== name) {
      await tx`
        UPDATE public.city_translation SET name = ${name}
        WHERE city_id = ${existing.city_id} AND locale_code = 'en'`;
      updated += 1;
    }
  }
  return {
    table: plan.table,
    rows: rows.length,
    inserted,
    updated,
    unchanged: rows.length - inserted - updated - underReal,
    real: 0,
    underReal,
  };
}

class DryRunRollback extends Error {}

/** Runs the plan against `sql`. The CLI's whole job, minus argument parsing and printing. */
export async function runSeed(
  sql: Sql,
  plan: readonly SeedTablePlan[],
  options: SeedOptions = {},
): Promise<SeedReport> {
  const groups = options.only ?? SEED_GROUPS;
  const dryRun = options.dryRun ?? false;
  const insertOnly = options.insertOnly ?? false;
  const reports: SeedTableReport[] = [];
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE app_owner");
      for (const table of plan) {
        if (!groups.includes(table.group)) continue;
        const refs = await loadRefs(tx, refKinds(table.rows));
        const rows = resolveRows(table, table.rows, refs);
        reports.push(
          table.table === "city"
            ? await upsertCities(tx, table, rows, insertOnly)
            : await upsertTable(tx, table, rows, insertOnly),
        );
      }
      if (dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }
  return { dryRun, insertOnly, groups: [...groups], tables: reports };
}

/** The report as printed: one line per table, then the totals. */
export function formatSeedReport(report: SeedReport): string {
  const lines = report.tables.map(
    (t) =>
      `${t.table.padEnd(26)} rows ${String(t.rows).padStart(5)}  inserted ${String(t.inserted).padStart(5)}  updated ${String(t.updated).padStart(5)}  unchanged ${String(t.unchanged).padStart(5)}  real ${String(t.real).padStart(3)}  under real ${String(t.underReal).padStart(4)}`,
  );
  const sum = (field: "inserted" | "updated" | "real" | "underReal") =>
    report.tables.reduce((total, t) => total + t[field], 0);
  lines.push(
    `${CLI_NAME}${report.insertOnly ? " (insert only, no row updated)" : ""}${report.dryRun ? " (dry run, nothing written)" : ""}: ${String(sum("inserted"))} inserted, ${String(sum("updated"))} updated, ${String(sum("real"))} real rows left untouched, ${String(sum("underReal"))} rows under a real parent left untouched`,
  );
  return lines.join("\n");
}

export { cityKey };

function connectionUrl(environment: NodeJS.ProcessEnv): string {
  const url = environment["DATABASE_URL_UNPOOLED"] ?? "";
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(
      `${CLI_NAME}: DATABASE_URL_UNPOOLED is missing or is not a postgres:// connection string (see .env.example)`,
    );
  }
  return url;
}

async function main(): Promise<void> {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const options = parseSeedArgs(process.argv.slice(2));
  assertSeedModeAllowed(process.env, options);
  const plan = buildSeedPlan(await readSeedTree(repoRoot));
  const sql = postgres(connectionUrl(process.env), {
    max: 1,
    onnotice: () => undefined,
  });
  try {
    const report = await runSeed(sql, plan, options);
    process.stdout.write(`${formatSeedReport(report)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
