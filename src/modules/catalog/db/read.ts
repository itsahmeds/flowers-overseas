/**
 * What the three database providers share: how a read reaches Postgres, how a request reads each
 * table once, and how a `bigint` column becomes an integer minor unit (spec 005 §5.4, AC-27, AC-28;
 * TASK-070).
 *
 * **One statement per read, once per request.** A provider read is one `SELECT` over its whole
 * table, run in one public-context transaction (`withDbContext`, so `app_web` at request time and
 * `app_build` while `next build` runs, `src/lib/db.ts`). The promise is kept in the request's
 * **read scope**: React's `cache()` gives each server request its own `Map`, so the first
 * `countryPrices()` of a render queries and every later one in the same render (another tier,
 * another product card, the quote) is answered from the scope with **zero** queries. Pricing a
 * product therefore costs one price query however many tiers it has, and a listing of forty cards
 * costs the same one (AC-28: "one batched query per (product, country) rather than one per tier").
 * A cached ISR page renders nothing, so it reads nothing (spec 002 §5.4).
 *
 * Outside a server request (a script, a job, a test) React's `cache()` memoises nothing, so every
 * read queries afresh: nothing here is a process-wide cache that could hold a superseded price past
 * an admin edit. A rejected read is dropped from the scope, so one failed query is not replayed to
 * the rest of the request.
 *
 * Every value handed out is deep-frozen (`../frozen.ts`, TASK-148): one request's callers share it.
 */
import { randomUUID } from "node:crypto";

import { cache } from "react";

import { type DbTransaction, withDbContext } from "@/lib/db";

import { deepFrozenCopy } from "../frozen";

/** Runs one read in one transaction and hands back its result. */
export type CatalogDbRead = <T>(
  query: (db: DbTransaction) => Promise<T>,
) => Promise<T>;

/** The current request's read scope: the same `Map` for the whole of one request. */
export type CatalogReadScope = () => Map<string, Promise<unknown>>;

/** How the database providers reach Postgres and where they keep a request's reads. */
export interface CatalogDbOptions {
  readonly read: CatalogDbRead;
  readonly scope: CatalogReadScope;
}

/**
 * The public context, as a page render reads the catalogue: no user, no partner (spec 002 §2
 * "RLS and roles"). A read has no request id of its own to forward, so it mints one per
 * transaction, as `dbCountryRegistry` does (`src/modules/geo/db/registry.ts`).
 */
export const publicCatalogRead: CatalogDbRead = (query) =>
  withDbContext({ role: "public", requestId: randomUUID() }, query);

/** One `Map` per server request (React's `cache()`); a fresh one per call anywhere else. */
export const requestReadScope: CatalogReadScope = cache(
  () => new Map<string, Promise<unknown>>(),
);

/** The production wiring: the public context and the request's scope. */
export const DEFAULT_CATALOG_DB_OPTIONS: CatalogDbOptions = {
  read: publicCatalogRead,
  scope: requestReadScope,
};

/**
 * The rows of `key` for this request: from the scope when this request has read them, otherwise
 * from one query whose result is parsed, deep-frozen and kept for the rest of the request.
 */
export function scopedRead<Row>(
  options: CatalogDbOptions,
  key: string,
  load: (db: DbTransaction) => Promise<readonly Row[]>,
): Promise<readonly Row[]> {
  const scope = options.scope();
  const kept = scope.get(key);
  if (kept !== undefined) return kept as Promise<readonly Row[]>;
  const pending = options
    .read(load)
    .then((rows) => deepFrozenCopy(rows))
    .catch((error: unknown) => {
      scope.delete(key);
      throw error;
    });
  scope.set(key, pending);
  return pending;
}

/**
 * A `bigint` column (`retail_minor`, `rate_ppm`) as the integer the dataset's schemas carry.
 * Money is never a float (`CLAUDE.md`), and a value past `Number.MAX_SAFE_INTEGER` cannot be held
 * exactly as one, so it throws rather than round: a price nobody can state exactly is not shown.
 */
export function safeInteger(value: bigint, column: string): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError(
      `${column} holds ${value.toString()}, beyond the integers a number holds exactly; it is refused rather than rounded (spec 005 §5.2)`,
    );
  }
  return Number(value);
}
