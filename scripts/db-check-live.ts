/**
 * `pnpm db:check`, connected half (spec 002 §2, AC-5, AC-22, AC-26, AC-27; §13 Q6; TASK-027).
 *
 * `scripts/db-check.ts` decides everything the tree alone can (rollback pairing, versions, the
 * ownership preamble, table-level drift, the recipient-email ban on the SQL and the mirror). This
 * file is the rest, read from a **migrated database** over `DATABASE_URL_UNPOOLED`, one line per
 * problem:
 *
 *  - **column drift** — every column of every table the Drizzle mirror (`db/schema/`) declares is
 *    in the database with the same type and nullability, and every column in the database is in
 *    the mirror ("a column added in TS but not in a migration, and the reverse");
 *  - **RLS coverage** — every `public` table has row-level security enabled and at least one
 *    policy, unless `db/rls.ts`'s `RLS_EXEMPT_TABLES` names it with a reason;
 *  - **money** — every `*_minor` column is `bigint` and its table has a currency column
 *    (`currency_code`, `*_currency_code`, `currency` or `*_currency`); no `numeric`, `real`,
 *    `double precision` or `money` column is named like an amount (AC-5);
 *  - **no `bytea`** anywhere in `public` (AC-22, ADR-0015: keys, never bytes);
 *  - **no recipient email** in the live catalogue (AC-27): `db-check.ts` passes its
 *    `recipientEmailViolations` in, because this module is imported by that one (a cycle would
 *    deadlock its top-level `await`);
 *  - **catalogue drift** — what the mirror cannot express is pinned by a committed snapshot of the
 *    migrated catalogue, `scripts/db-check.snapshot.json`: every CHECK, foreign-key, unique and
 *    exclusion **definition** (so a weakened expression is drift, not only a renamed one), every
 *    index definition (so `NULLS NOT DISTINCT` and a partial index's predicate are pinned), every
 *    trigger, every function's definition with its `SECURITY DEFINER` flag and pinned
 *    `search_path`, every policy, every view with its options (`security_barrier`), and every
 *    column default. A migration that changes any of them must regenerate the snapshot
 *    (`pnpm db:check --write-snapshot`), so the change is a reviewed diff (TASK-017 holes 5 and 8,
 *    TASK-018 breaker holes 2 and 4).
 *
 * On success it prints the applied-migration count and the RLS coverage. It logs no row and no
 * value: catalogue names and definitions only.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import type postgres from "postgres";

import { RLS_EXEMPT_TABLES } from "../db/rls.ts";

type Sql = postgres.Sql | postgres.TransactionSql;

/** Where the catalogue snapshot lives, relative to the repository root. */
export const SNAPSHOT_FILE = "scripts/db-check.snapshot.json";

/** Tables in `public` that are not application tables (they are on the exemption list too). */
const BOOKKEEPING_TABLES = new Set(Object.keys(RLS_EXEMPT_TABLES));

const AMOUNT_NAME = /(price|amount|total|payout|fee)/i;
const FLOAT_TYPES = new Set(["numeric", "real", "double precision", "money"]);
const CURRENCY_COLUMN = /^(currency|currency_code|[a-z_]+_currency(_code)?)$/;

/** Postgres spells some types differently from Drizzle's `getSQLType()`. */
export function canonicalSqlType(type: string): string {
  const aliases: Readonly<Record<string, string>> = {
    time: "time without time zone",
    timestamp: "timestamp without time zone",
    timestamptz: "timestamp with time zone",
    varchar: "character varying",
    int: "integer",
    int4: "integer",
    int8: "bigint",
    int2: "smallint",
    bool: "boolean",
  };
  // A length-bearing alias keeps its length: Drizzle's `char(64)` is Postgres's `character(64)`
  // (`auth_email_send.identifier_hash`, spec 012 §5.1; TASK-217), `varchar(n)` its
  // `character varying(n)`.
  const lengthAliases: Readonly<Record<string, string>> = {
    char: "character",
    varchar: "character varying",
  };
  const array = type.endsWith("[]");
  const base = array ? type.slice(0, -2) : type;
  const sized = /^([a-z]+)(\(\d+\))$/.exec(base);
  const sizedAlias = sized ? lengthAliases[sized[1] ?? ""] : undefined;
  const canonical =
    sized && sizedAlias !== undefined
      ? `${sizedAlias}${sized[2] ?? ""}`
      : (aliases[base] ?? base);
  return array ? `${canonical}[]` : canonical;
}

export interface LiveColumn {
  readonly table: string;
  readonly column: string;
  readonly type: string;
  readonly notNull: boolean;
}

export interface MirrorColumn {
  readonly table: string;
  readonly column: string;
  readonly type: string;
  readonly notNull: boolean;
}

/** The mirror's columns, read the way Drizzle evaluates them. */
export function mirrorColumns(
  mirror: Readonly<Record<string, unknown>>,
): MirrorColumn[] {
  const out: MirrorColumn[] = [];
  for (const value of Object.values(mirror)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    if (config.schema !== undefined && config.schema !== "public") continue;
    for (const column of config.columns) {
      out.push({
        table: config.name,
        column: column.name,
        type: canonicalSqlType(column.getSQLType()),
        notNull: column.notNull,
      });
    }
  }
  return out;
}

/** Column-level drift between the mirror and the live catalogue, one line per problem. */
export function columnDrift(
  mirror: readonly MirrorColumn[],
  live: readonly LiveColumn[],
): string[] {
  const lines: string[] = [];
  const key = (c: { table: string; column: string }) =>
    `public.${c.table}.${c.column}`;
  const liveByKey = new Map(live.map((c) => [key(c), c]));
  const mirrorByKey = new Map(mirror.map((c) => [key(c), c]));
  const mirrorTables = new Set(mirror.map((c) => c.table));
  for (const [name, column] of mirrorByKey) {
    const found = liveByKey.get(name);
    if (found === undefined) {
      lines.push(
        `drift: column ${name} is declared in db/schema but no migration creates it`,
      );
      continue;
    }
    if (canonicalSqlType(found.type) !== column.type) {
      lines.push(
        `drift: column ${name} is ${found.type} in the database and ${column.type} in db/schema`,
      );
    }
    if (found.notNull !== column.notNull) {
      lines.push(
        `drift: column ${name} is ${found.notNull ? "NOT NULL" : "nullable"} in the database and ${column.notNull ? "NOT NULL" : "nullable"} in db/schema`,
      );
    }
  }
  for (const [name, column] of liveByKey) {
    if (BOOKKEEPING_TABLES.has(column.table)) continue;
    if (!mirrorByKey.has(name)) {
      lines.push(
        mirrorTables.has(column.table)
          ? `drift: column ${name} exists in the database but is not declared in db/schema`
          : `drift: table public.${column.table} exists in the database but is not declared in db/schema`,
      );
    }
  }
  // One line per table that is missing from the mirror, not one per column.
  return [...new Set(lines)];
}

/** Money and bytea rules over the live columns, one line per problem. */
export function columnRules(live: readonly LiveColumn[]): string[] {
  const lines: string[] = [];
  const byTable = new Map<string, LiveColumn[]>();
  for (const column of live) {
    byTable.set(column.table, [...(byTable.get(column.table) ?? []), column]);
  }
  for (const [table, columns] of byTable) {
    const hasCurrency = columns.some((c) => CURRENCY_COLUMN.test(c.column));
    for (const column of columns) {
      const name = `public.${table}.${column.column}`;
      const base = column.type.replace(/\(.*\)$/, "");
      if (column.column.endsWith("_minor")) {
        if (column.type !== "bigint") {
          lines.push(
            `money: ${name} is ${column.type}; a *_minor column is bigint`,
          );
        }
        if (!hasCurrency) {
          lines.push(
            `money: ${name} has no currency column in public.${table} (spec 002 §2 money pair)`,
          );
        }
      }
      if (FLOAT_TYPES.has(base) && AMOUNT_NAME.test(column.column)) {
        lines.push(
          `money: ${name} is ${column.type}; money is integer minor units (*_minor bigint) plus a currency`,
        );
      }
      if (base === "bytea") {
        lines.push(
          `bytea: ${name} stores bytes; media lives in R2 and the database keeps keys (ADR-0015, AC-22)`,
        );
      }
    }
  }
  return lines;
}

export interface LiveTable {
  readonly table: string;
  readonly rls: boolean;
  readonly policies: number;
}

/** RLS enabled and a policy per table unless exempt, one line per problem. */
export function rlsCoverage(tables: readonly LiveTable[]): {
  lines: string[];
  summary: string;
} {
  const lines: string[] = [];
  let covered = 0;
  let exempt = 0;
  for (const { table, rls, policies } of tables) {
    if (Object.hasOwn(RLS_EXEMPT_TABLES, table)) {
      exempt += 1;
      continue;
    }
    if (!rls) {
      lines.push(
        `rls: public.${table} has row-level security disabled and is not on RLS_EXEMPT_TABLES (db/rls.ts)`,
      );
    } else if (policies === 0) {
      lines.push(
        `rls: public.${table} has no policy and is not on RLS_EXEMPT_TABLES (db/rls.ts)`,
      );
    } else {
      covered += 1;
    }
  }
  const total = tables.length - exempt;
  return {
    lines,
    summary: `RLS coverage: ${String(covered)}/${String(total)} tables with RLS enabled and a policy (${String(exempt)} exempt: ${Object.keys(RLS_EXEMPT_TABLES).join(", ")})`,
  };
}

/** The catalogue facts the snapshot pins, as sorted `name → definition` maps. */
export type CatalogueSnapshot = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

async function pairs(sql: Sql, query: string): Promise<Record<string, string>> {
  const rows = await sql.unsafe<{ k: string; v: string | null }[]>(query);
  const out: Record<string, string> = {};
  for (const row of [...rows].sort((a, b) => a.k.localeCompare(b.k))) {
    out[row.k] = row.v ?? "";
  }
  return out;
}

/** Reads the snapshot facts of schema `public` from a migrated database. */
export async function readCatalogue(sql: Sql): Promise<CatalogueSnapshot> {
  return {
    constraints: await pairs(
      sql,
      `SELECT c.conrelid::regclass::text || ' ' || c.conname AS k, pg_get_constraintdef(c.oid) AS v
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'public' AND c.conrelid <> 0`,
    ),
    indexes: await pairs(
      sql,
      `SELECT indexname AS k, indexdef AS v FROM pg_indexes WHERE schemaname = 'public'`,
    ),
    triggers: await pairs(
      sql,
      `SELECT t.tgrelid::regclass::text || ' ' || t.tgname AS k, pg_get_triggerdef(t.oid) AS v
       FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = r.relnamespace
       WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
    ),
    functions: await pairs(
      sql,
      `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS k,
              'security_definer=' || p.prosecdef || ' config=' || coalesce(array_to_string(p.proconfig, ','), '')
              || ' md5=' || md5(pg_get_functiondef(p.oid)) AS v
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prokind = 'f'`,
    ),
    policies: await pairs(
      sql,
      `SELECT tablename || ' ' || policyname AS k,
              permissive || ' ' || cmd || ' to ' || array_to_string(roles, ',')
              || ' using ' || coalesce(qual, '-') || ' check ' || coalesce(with_check, '-') AS v
       FROM pg_policies WHERE schemaname = 'public'`,
    ),
    views: await pairs(
      sql,
      `SELECT c.relname AS k,
              'options=' || coalesce(array_to_string(c.reloptions, ','), '') || ' md5=' || md5(pg_get_viewdef(c.oid)) AS v
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'v'`,
    ),
    defaults: await pairs(
      sql,
      `SELECT table_name || '.' || column_name AS k, column_default AS v
       FROM information_schema.columns
       WHERE table_schema = 'public' AND column_default IS NOT NULL`,
    ),
    rls: await pairs(
      sql,
      `SELECT c.relname AS k, 'enabled=' || c.relrowsecurity || ' forced=' || c.relforcerowsecurity AS v
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    ),
  };
}

const SINGULAR: Readonly<Record<string, string>> = {
  constraints: "constraint",
  indexes: "index",
  triggers: "trigger",
  functions: "function",
  policies: "policy",
  views: "view",
  defaults: "default",
  rls: "rls",
};

/** Differences between the committed snapshot and the live catalogue, one line per object. */
export function catalogueDrift(
  committed: CatalogueSnapshot,
  live: CatalogueSnapshot,
): string[] {
  const lines: string[] = [];
  const kinds = [
    ...new Set([...Object.keys(committed), ...Object.keys(live)]),
  ].sort();
  for (const kind of kinds) {
    const want = committed[kind] ?? {};
    const have = live[kind] ?? {};
    const names = [
      ...new Set([...Object.keys(want), ...Object.keys(have)]),
    ].sort();
    for (const name of names) {
      const a = want[name];
      const b = have[name];
      if (a === b) continue;
      const where =
        a === undefined
          ? "is in the database but not in the snapshot"
          : b === undefined
            ? "is in the snapshot but not in the database"
            : `differs: the database has ${JSON.stringify(b)}, the snapshot ${JSON.stringify(a)}`;
      lines.push(
        `catalogue drift: ${SINGULAR[kind] ?? kind} ${name} ${where} (${SNAPSHOT_FILE}; regenerate with pnpm db:check --write-snapshot after a reviewed migration)`,
      );
    }
  }
  return lines;
}

export function readSnapshot(path: string): CatalogueSnapshot {
  return JSON.parse(readFileSync(path, "utf8")) as CatalogueSnapshot;
}

export function writeSnapshot(path: string, snapshot: CatalogueSnapshot): void {
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export interface LiveCheckResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly summary: readonly string[];
}

/** Every connected rule; see the header. */
export async function liveCheck(
  sql: Sql,
  mirror: Readonly<Record<string, unknown>>,
  snapshot: CatalogueSnapshot | undefined,
  recipientEmailViolations: (
    columns: readonly { table: string; column: string }[],
  ) => string[],
): Promise<LiveCheckResult> {
  const live = await sql<
    { table: string; column: string; type: string; not_null: boolean }[]
  >`
    SELECT c.relname AS table, a.attname AS column,
           format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY 1, 2`;
  const columns: LiveColumn[] = live.map((row) => ({
    table: row.table,
    column: row.column,
    type: row.type,
    notNull: row.not_null,
  }));
  const tables = await sql<{ table: string; rls: boolean; policies: number }[]>`
    SELECT c.relname AS table, c.relrowsecurity AS rls,
           (SELECT count(*) FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = c.relname)::int AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY 1`;
  const [applied] = await sql<{ n: number; latest: string | null }[]>`
    SELECT count(*)::int AS n, max(version || '_' || name) AS latest
    FROM public.schema_migrations`;
  const rls = rlsCoverage(tables);
  const recipient = recipientEmailViolations(columns);
  const problems = [
    ...columnDrift(mirrorColumns(mirror), columns),
    ...rls.lines,
    ...columnRules(columns),
    ...recipient,
    ...(snapshot === undefined
      ? [
          `catalogue drift: ${SNAPSHOT_FILE} is missing (pnpm db:check --write-snapshot)`,
        ]
      : catalogueDrift(snapshot, await readCatalogue(sql))),
  ];
  return {
    ok: problems.length === 0,
    problems,
    summary: [
      `applied migrations: ${String(applied?.n ?? 0)} (latest ${applied?.latest ?? "none"})`,
      rls.summary,
    ],
  };
}
