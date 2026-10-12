/**
 * Reading a hand-written migration as text, and its Drizzle mirror as data, so a unit test can
 * hold the two equal without a database (spec 002 §5.1, AC-26's offline half; TASK-019…023).
 *
 * The migrations follow one layout (`db/migrations/README.md`): `CREATE TABLE public.<name> (`
 * (the reserved word `"order"` quoted), one column per line until the first `CONSTRAINT`, every
 * constraint named, and indexes as separate `CREATE [UNIQUE] INDEX <name> ON public.<table>`
 * statements. Anything else is a reason for the parity test to fail, not to be clever here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import * as schema from "../../../db/schema/index.ts";

export const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

/** SQL with `--` line comments and block comments removed, so a rule never matches prose. */
export function withoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

export const readMigration = (file: string): string =>
  withoutComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));

const TABLE = String.raw`public\.(?:"(\w+)"|(\w+))`;

/** The tables a migration creates, in order. */
export function createdTables(sql: string): string[] {
  return [...sql.matchAll(new RegExp(`CREATE TABLE ${TABLE} \\(`, "g"))].map(
    (m) => m[1] ?? m[2] ?? "",
  );
}

/** The tables a rollback drops, in order. */
export function droppedTables(sql: string): string[] {
  return [
    ...sql.matchAll(new RegExp(`DROP TABLE IF EXISTS ${TABLE};`, "g")),
  ].map((m) => m[1] ?? m[2] ?? "");
}

function quoted(table: string): string {
  return table === "order" || table === "user"
    ? `public\\."${table}"`
    : `public\\.${table}`;
}

export function tableBody(sql: string, table: string): string {
  const match = new RegExp(
    `CREATE TABLE ${quoted(table)} \\(([\\s\\S]*?)\\n\\);`,
  ).exec(sql);
  if (match?.[1] === undefined) throw new Error(`${table} is not created`);
  return match[1];
}

const SQL_TYPE: Record<string, string> = {
  timestamptz: "timestamp with time zone",
};

export interface Column {
  readonly name: string;
  readonly type: string;
  readonly notNull: boolean;
}

/** One entry per column, in declaration order; constraints come after the last column. */
export function columnsOf(sql: string, table: string): Column[] {
  const columns: Column[] = [];
  for (const raw of tableBody(sql, table).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("CONSTRAINT")) break;
    const match = /^"?([a-z_0-9]+)"?\s+([a-z[\]0-9]+)/i.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    columns.push({
      name: match[1],
      type: SQL_TYPE[match[2]] ?? match[2],
      notNull: /\bNOT NULL\b|\bPRIMARY KEY\b/.test(line),
    });
  }
  return columns;
}

export interface Shape {
  readonly columns: Column[];
  readonly checks: string[];
  readonly uniques: string[];
  readonly primaryKeys: string[];
  readonly foreignKeys: string[];
  readonly indexes: string[];
}

/** `name(cols)->parent(cols) RULE`, the form both sides are reduced to. */
function fkKey(
  name: string,
  columns: string,
  parent: string,
  parentColumns: string,
  rule: string,
): string {
  const norm = (value: string): string => value.replace(/\s+/g, "");
  return `${name}(${norm(columns)})->${parent}(${norm(parentColumns)}) ${rule.toUpperCase()}`;
}

/** The shape of `table` as the migration text declares it. */
export function sqlShape(sql: string, table: string): Shape {
  const body = tableBody(sql, table);
  const named = (kind: string): string[] =>
    [...body.matchAll(new RegExp(`CONSTRAINT (\\w+) ${kind}`, "g"))]
      .map((m) => m[1] ?? "")
      .sort();
  const foreignKeys = [
    ...body.matchAll(
      new RegExp(
        String.raw`CONSTRAINT (\w+) FOREIGN KEY \(([^)]*)\)\s+REFERENCES ${TABLE} \(([^)]*)\) ON DELETE (SET NULL|\w+)`,
        "g",
      ),
    ),
  ]
    .map((m) =>
      fkKey(m[1] ?? "", m[2] ?? "", m[3] ?? m[4] ?? "", m[5] ?? "", m[6] ?? ""),
    )
    .sort();
  const indexes = [
    ...sql.matchAll(
      new RegExp(`CREATE (UNIQUE )?INDEX (\\w+)\\s+ON ${quoted(table)} `, "g"),
    ),
  ]
    .map((m) => `${m[1] === undefined ? "" : "unique "}${m[2] ?? ""}`)
    .sort();
  return {
    columns: columnsOf(sql, table),
    checks: named("CHECK"),
    uniques: named("UNIQUE"),
    primaryKeys: named("PRIMARY KEY"),
    foreignKeys,
    indexes,
  };
}

const mirrorTables = new Map<string, PgTable>();
for (const value of Object.values(schema)) {
  if (
    value !== null &&
    typeof value === "object" &&
    Symbol.for("drizzle:IsDrizzleTable") in value
  ) {
    const table = value as PgTable;
    mirrorTables.set(getTableConfig(table).name, table);
  }
}

export function mirrorTable(name: string): PgTable {
  const table = mirrorTables.get(name);
  if (table === undefined) throw new Error(`no Drizzle mirror for ${name}`);
  return table;
}

/** The shape of `table` as `db/schema/` declares it. */
export function mirrorShape(name: string): Shape {
  const config = getTableConfig(mirrorTable(name));
  return {
    columns: config.columns.map((column) => ({
      name: column.name,
      type: column.getSQLType(),
      notNull: column.notNull,
    })),
    checks: config.checks.map((c) => c.name).sort(),
    uniques: config.uniqueConstraints.map((u) => u.getName() ?? "").sort(),
    primaryKeys: config.primaryKeys.map((pk) => pk.getName()).sort(),
    foreignKeys: config.foreignKeys
      .map((fk) => {
        const reference = fk.reference();
        return fkKey(
          fk.getName(),
          reference.columns.map((column) => column.name).join(","),
          getTableConfig(reference.foreignTable).name,
          reference.foreignColumns.map((column) => column.name).join(","),
          fk.onDelete ?? "no action",
        );
      })
      .sort(),
    indexes: config.indexes
      .map(
        (ix) => `${ix.config.unique ? "unique " : ""}${ix.config.name ?? ""}`,
      )
      .sort(),
  };
}

/** `('a', 'b', …)` of `CONSTRAINT <name> CHECK (<column> IN (…))`, or undefined. */
export function checkList(
  sql: string,
  constraint: string,
): readonly string[] | undefined {
  const match = new RegExp(
    String.raw`CONSTRAINT\s+${constraint}\s+CHECK\s*\(\s*\w+\s+IN\s*\(([^)]*)\)`,
    "i",
  ).exec(sql);
  if (match?.[1] === undefined) return undefined;
  return [...match[1].matchAll(/'([^']*)'/g)].map((value) => value[1] ?? "");
}
