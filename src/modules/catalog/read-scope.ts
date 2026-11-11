/**
 * An explicit catalogue read scope for work that runs outside a React server render: a route
 * handler, a job, a script (spec 005 AC-28; spec 012b §2.0; TASK-295, TASK-294 carry-forward 1).
 *
 * The database providers keep each table read in the request's scope (`./db/read.ts`), and that
 * scope is React's `cache()`, which memoises only inside a server component render. A route
 * handler is not one, so `/api/prices/{locale}/{iso2}` read the whole `country_price` table once
 * per product card it priced, and a database-mode build timed out on it (Next's 60 s limit per
 * static page). `withCatalogReadScope(work)` gives `work` and everything it awaits one `Map`, so
 * each table is read **once** for the whole document, however many products it lists.
 *
 * The scope lives exactly as long as `work`: it is never a process-wide cache, so nothing here can
 * hold a superseded price past an admin edit. Nested calls join the outer scope. It imports no
 * database client (`pnpm check:no-db` scans this directory).
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** One read scope: table key to the pending, frozen rows. */
export type CatalogReadScopeMap = Map<string, Promise<unknown>>;

const scopes = new AsyncLocalStorage<CatalogReadScopeMap>();

/** Runs `work` with one catalogue read scope shared by everything it awaits; nested calls join it. */
export function withCatalogReadScope<T>(work: () => Promise<T>): Promise<T> {
  if (scopes.getStore() !== undefined) return work();
  return scopes.run(new Map(), work);
}

/** The scope `withCatalogReadScope` opened around the current call, if any. */
export function activeCatalogReadScope(): CatalogReadScopeMap | undefined {
  return scopes.getStore();
}
