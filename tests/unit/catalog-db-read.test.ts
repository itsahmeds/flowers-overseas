/**
 * The database providers' shared read path, without a database (spec 005 AC-27, AC-28; TASK-070).
 *
 * `tests/integration/catalog-db-providers.test.ts` runs the providers against Postgres; this file
 * pins the three properties of `src/modules/catalog/db/read.ts` that hold with no server at all:
 * outside a React server request the production scope keeps nothing (so a script, a job or a
 * route handler never reads a price another call cached), one scope answers a key once and drops a
 * failed read, and a `bigint` becomes an integer only when a number holds it exactly.
 */
import { describe, expect, it } from "vitest";

import type { DbTransaction } from "../../src/lib/db.ts";
import {
  type CatalogDbRead,
  requestReadScope,
  safeInteger,
  scopedRead,
} from "../../src/modules/catalog/db/read.ts";

/** A read that never touches a database: it counts the transactions it would have opened. */
function countingRead(): { read: CatalogDbRead; calls: () => number } {
  let calls = 0;
  const read: CatalogDbRead = (query) => {
    calls += 1;
    return query({} as DbTransaction);
  };
  return { read, calls: () => calls };
}

describe("the request read scope (AC-28)", () => {
  it("keeps nothing outside a React server request: every call is a fresh scope", () => {
    const first = requestReadScope();
    first.set("price.countryPrices", Promise.resolve([]));
    expect(requestReadScope()).not.toBe(first);
    expect(requestReadScope().size).toBe(0);
  });

  it("answers a key once per scope, frozen, and again in a new scope", async () => {
    const { read, calls } = countingRead();
    const scope = new Map<string, Promise<unknown>>();
    const options = { read, scope: () => scope };
    const load = () => Promise.resolve([{ sku: "FO-BQ-001", tags: ["a"] }]);

    const first = await scopedRead(options, "catalogue.products", load);
    const second = await scopedRead(options, "catalogue.products", load);
    expect(calls()).toBe(1);
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(Object.isFrozen(first[0]?.tags)).toBe(true);

    await scopedRead(
      { read, scope: () => new Map<string, Promise<unknown>>() },
      "catalogue.products",
      load,
    );
    expect(calls()).toBe(2);
  });

  it("drops a failed read, so the next call in the same request reads again", async () => {
    const { read, calls } = countingRead();
    const scope = new Map<string, Promise<unknown>>();
    const options = { read, scope: () => scope };
    let attempt = 0;
    const load = () => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error("connection reset"))
        : Promise.resolve([1, 2]);
    };

    await expect(scopedRead(options, "fx.fxRates", load)).rejects.toThrow(
      "connection reset",
    );
    expect(scope.has("fx.fxRates")).toBe(false);
    expect(await scopedRead(options, "fx.fxRates", load)).toEqual([1, 2]);
    expect(calls()).toBe(2);
  });
});

describe("safeInteger: a bigint column as an exact integer (money is never a float)", () => {
  it.each([
    [0n, 0],
    [1n, 1],
    [14_900n, 14_900],
    [-1n, -1],
    [9_007_199_254_740_991n, Number.MAX_SAFE_INTEGER],
    [-9_007_199_254_740_991n, Number.MIN_SAFE_INTEGER],
  ])("%s → %s", (value, expected) => {
    expect(safeInteger(value, "country_price.retail_minor")).toBe(expected);
  });

  it.each([9_007_199_254_740_992n, -9_007_199_254_740_992n, 10n ** 20n])(
    "refuses %s rather than round it",
    (value) => {
      expect(() => safeInteger(value, "country_price.retail_minor")).toThrow(
        /country_price\.retail_minor holds .* refused rather than rounded/u,
      );
    },
  );
});
