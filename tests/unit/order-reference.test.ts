/**
 * Order references never clash: `place`'s savepoint retry, without a database (spec 010 §14
 * A2.1, A2.3, A3.1; AC-45 and AC-47 unit halves, T-45; TASK-245).
 *
 * A recording executor stands in for Postgres and raises the driver's unique violation on the
 * `INSERT INTO "order"` it is told to, so the statement order A2.3 prescribes (savepoint, then the
 * switch, then the insert; on a clash of `order_reference_idx` only, back to the savepoint and a
 * new id; at most five attempts) is asserted here. The connected half, where Postgres itself
 * raises the violation, is `tests/integration/order-reference.test.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";
import {
  isOrderEngineError,
  ORDER_ERROR_CODES,
  ORDER_REFERENCE_ATTEMPTS,
  ORDER_REFERENCE_PATTERN,
  orderReference,
  type OrderExecutor,
} from "@/modules/orders";
import { placeWith } from "@/modules/orders/service/place";

import { placeInput } from "../fixtures/order-engine.ts";
import {
  clashingId,
  nearMissId,
  PINNED_REFERENCES,
  scriptedIds,
} from "../fixtures/order-reference.ts";

const dialect = new PgDialect();

const PARENTS = {
  countryId: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
  customerId: "2c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e",
  recipientId: "3d4e5f60-7182-4c9d-8e1f-2a3b4c5d6e7f",
  productId: "4e5f6071-8293-4dae-9f20-3b4c5d6e7f80",
};

/** What postgres.js raises for a unique violation (`PostgresError`'s fields). */
function uniqueViolation(constraint: string | undefined): Error {
  return Object.assign(
    new Error(`duplicate key value violates unique constraint`),
    {
      name: "PostgresError",
      severity: "ERROR",
      code: "23505",
      ...(constraint === undefined ? {} : { constraint_name: constraint }),
    },
  );
}

/** What Drizzle's session raises around it (`DrizzleQueryError`, the driver error as `cause`). */
function wrapped(error: Error): Error {
  return new Error('Failed query: INSERT INTO "order" …', { cause: error });
}

interface Recorded {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * Answers the reads `place` makes; the `n`th `INSERT INTO "order"` throws `failures[n - 1]` when
 * one is given (without running, as Postgres refuses the row), and returns the row otherwise.
 * Once a statement has failed, every statement until `ROLLBACK TO SAVEPOINT` throws "aborted",
 * as Postgres does inside a failed transaction.
 */
function recorder(failures: readonly (Error | undefined)[] = []): {
  log: Recorded[];
  executor: OrderExecutor;
} {
  const log: Recorded[] = [];
  let inserts = 0;
  let aborted = false;
  const executor: OrderExecutor = {
    async execute(query: SQL) {
      const { sql, params } = dialect.sqlToQuery(query);
      log.push({ sql, params });
      await Promise.resolve();
      if (/^ROLLBACK TO SAVEPOINT/.test(sql)) {
        aborted = false;
        return [];
      }
      if (aborted) throw new Error("current transaction is aborted");
      if (/SELECT supply_model FROM country/.test(sql)) {
        return [{ supply_model: null }];
      }
      if (/INSERT INTO "order"/.test(sql)) {
        inserts += 1;
        const failure = failures[inserts - 1];
        if (failure !== undefined) {
          aborted = true;
          throw failure;
        }
        return [{ id: params[0] }];
      }
      if (/coalesce\(max\(seq\), 0\) \+ 1/.test(sql)) return [{ seq: 1 }];
      if (/INSERT INTO order_event/.test(sql)) {
        return [{ id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" }];
      }
      return [];
    },
  };
  return { log, executor };
}

/** The savepoint, setting and order-insert statements, in order, named. */
function placeSequence(log: readonly Recorded[]): string[] {
  const names: string[] = [];
  for (const entry of log) {
    if (/^SAVEPOINT /.test(entry.sql)) names.push("savepoint");
    else if (/^ROLLBACK TO SAVEPOINT /.test(entry.sql)) names.push("rollback");
    else if (/^RELEASE SAVEPOINT /.test(entry.sql)) names.push("release");
    else if (entry.sql.includes("set_config('app.allow_status_write', 'on'"))
      names.push("switch on");
    else if (entry.sql.includes("set_config('app.allow_status_write', ''"))
      names.push("switch reset");
    else if (/INSERT INTO "order"/.test(entry.sql))
      names.push(`insert ${String(entry.params[0])}`);
    else if (/INSERT INTO order_line/.test(entry.sql)) names.push("line");
    else if (/INSERT INTO order_event/.test(entry.sql)) names.push("event");
  }
  return names;
}

async function refusalCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isOrderEngineError(error)) return error.code;
    throw error;
  }
  throw new Error("expected a refusal, and the call succeeded");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("orderReference against the pinned fixture (A2.1; AC-45 TypeScript side)", () => {
  it.each(PINNED_REFERENCES)("%s → %s", (id, reference) => {
    expect(orderReference(id)).toBe(reference);
    expect(reference).toMatch(ORDER_REFERENCE_PATTERN);
  });

  it("the fixture's clashing id derives the same reference, and its near miss a different one", () => {
    for (let index = 0; index < 200; index += 1) {
      const id = crypto.randomUUID();
      const clash = clashingId(id);
      expect(clash).not.toBe(id);
      expect(clash).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(orderReference(clash)).toBe(orderReference(id));
      expect(orderReference(nearMissId(id))).not.toBe(orderReference(id));
    }
  });
});

describe("place retries a reference clash with a new id (A2.3; AC-45 unit half)", () => {
  it("one clash on order_reference_idx: back to the savepoint, a new id, and everything after it on the new id", async () => {
    const ids = scriptedIds([
      "11eb4678-7889-4121-898d-83332035bce5",
      "bd4ac539-cf4b-4ab9-9468-e2597394bdee",
    ]);
    const warn = vi.spyOn(logger, "warn");
    const { log, executor } = recorder([
      uniqueViolation("order_reference_idx"),
    ]);
    const { orderId } = await placeWith(
      executor,
      placeInput(PARENTS),
      undefined,
      ids.next,
    );
    expect(orderId).toBe("bd4ac539-cf4b-4ab9-9468-e2597394bdee");
    expect(ids.calls()).toBe(2);
    expect(placeSequence(log)).toEqual([
      "savepoint",
      "switch on",
      "insert 11eb4678-7889-4121-898d-83332035bce5",
      // The reset after the failed insert is attempted and fails (aborted): swallowed by withSwitch.
      "switch reset",
      "rollback",
      "release",
      "savepoint",
      "switch on",
      "insert bd4ac539-cf4b-4ab9-9468-e2597394bdee",
      "switch reset",
      "release",
      "line",
      "line",
      "event",
    ]);
    // Every later write names the new id, never the clashing one.
    const after = log.slice(
      log.findIndex((entry) =>
        entry.params.includes("bd4ac539-cf4b-4ab9-9468-e2597394bdee"),
      ) + 1,
    );
    for (const entry of after) {
      expect(entry.params).not.toContain(
        "11eb4678-7889-4121-898d-83332035bce5",
      );
    }
    expect(
      log.filter((entry) => /INSERT INTO order_line/.test(entry.sql)),
    ).toHaveLength(2);
    for (const line of log.filter((entry) =>
      /INSERT INTO order_line/.test(entry.sql),
    )) {
      expect(line.params[0]).toBe("bd4ac539-cf4b-4ab9-9468-e2597394bdee");
    }
    // The log line carries the attempt only: no id, no reference.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({ attempt: 1 }, "orders.reference_clash");
  });

  it("recognises the clash through Drizzle's wrapper (the driver error as `cause`)", async () => {
    const ids = scriptedIds([]);
    const { log, executor } = recorder([
      wrapped(uniqueViolation("order_reference_idx")),
    ]);
    await placeWith(executor, placeInput(PARENTS), undefined, ids.next);
    expect(ids.calls()).toBe(2);
    expect(placeSequence(log).filter((name) => name === "rollback")).toEqual([
      "rollback",
    ]);
  });

  it("opens the savepoint before the switch on every attempt, and writes nothing before the order row", async () => {
    const { log, executor } = recorder([
      uniqueViolation("order_reference_idx"),
      uniqueViolation("order_reference_idx"),
    ]);
    await placeWith(executor, placeInput(PARENTS));
    const sequence = placeSequence(log);
    const savepoints = sequence.flatMap((name, index) =>
      name === "savepoint" ? [index] : [],
    );
    expect(savepoints).toHaveLength(3);
    for (const index of savepoints) {
      expect(sequence[index + 1]).toBe("switch on");
      expect(sequence[index + 2]).toMatch(/^insert /);
    }
    // Before the first savepoint: only the country read.
    const first = log.findIndex((entry) => /^SAVEPOINT /.test(entry.sql));
    expect(log.slice(0, first).map((entry) => entry.sql)).toEqual([
      expect.stringMatching(/^\s*SELECT supply_model FROM country/),
    ]);
    // Every savepoint statement names the same savepoint.
    const names = new Set(
      log
        .filter((entry) => /SAVEPOINT /.test(entry.sql))
        .map((entry) => /SAVEPOINT (\S+)/.exec(entry.sql)?.[1]),
    );
    expect(names.size).toBe(1);
  });

  it(`five clashes in a row: ORDER_REFERENCE_UNAVAILABLE after exactly ${String(5)} ids, nothing else written, the savepoint undone`, async () => {
    expect(ORDER_REFERENCE_ATTEMPTS).toBe(5);
    expect(ORDER_ERROR_CODES).toContain("ORDER_REFERENCE_UNAVAILABLE");
    const ids = scriptedIds([]);
    const warn = vi.spyOn(logger, "warn");
    const failures = Array.from({ length: 50 }, () =>
      uniqueViolation("order_reference_idx"),
    );
    const { log, executor } = recorder(failures);
    expect(
      await refusalCode(
        placeWith(executor, placeInput(PARENTS), undefined, ids.next),
      ),
    ).toBe("ORDER_REFERENCE_UNAVAILABLE");
    expect(ids.calls()).toBe(5);
    const sequence = placeSequence(log);
    expect(sequence.filter((name) => name.startsWith("insert "))).toHaveLength(
      5,
    );
    expect(sequence.filter((name) => name === "rollback")).toHaveLength(5);
    expect(sequence.at(-2)).toBe("rollback");
    expect(sequence.at(-1)).toBe("release");
    expect(sequence).not.toContain("line");
    expect(sequence).not.toContain("event");
    expect(log.some((entry) => /INSERT INTO outbox/.test(entry.sql))).toBe(
      false,
    );
    expect(warn.mock.calls).toEqual(
      [1, 2, 3, 4, 5].map((attempt) => [{ attempt }, "orders.reference_clash"]),
    );
  });

  it.each([
    ["another unique index", uniqueViolation("order_public_token_key")],
    ["the primary key", uniqueViolation("order_pkey")],
    ["a unique violation that names no constraint", uniqueViolation(undefined)],
    [
      "another unique index, wrapped",
      wrapped(uniqueViolation("order_public_token_key")),
    ],
    [
      "a foreign-key violation",
      Object.assign(new Error("fk"), {
        code: "23503",
        constraint_name: "order_reference_idx",
      }),
    ],
    ["a JavaScript error", new Error("connection reset")],
  ])(
    "%s is raised once, as it came, and not retried",
    async (_label, failure) => {
      const ids = scriptedIds([]);
      const warn = vi.spyOn(logger, "warn");
      const { log, executor } = recorder([failure, undefined]);
      await expect(
        placeWith(executor, placeInput(PARENTS), undefined, ids.next),
      ).rejects.toBe(failure);
      expect(ids.calls()).toBe(1);
      expect(
        placeSequence(log).filter((name) => name.startsWith("insert ")),
      ).toHaveLength(1);
      expect(warn).not.toHaveBeenCalled();
    },
  );
});

describe("place writes the order's locale (A3.1; AC-47 unit half)", () => {
  it("passes the input's localeCode into the order insert, for each launch locale", async () => {
    for (const localeCode of ["en", "en-gb", "de", "pl"]) {
      const { log, executor } = recorder();
      await placeWith(executor, placeInput(PARENTS, { localeCode }));
      const insert = log.find((entry) => /INSERT INTO "order"/.test(entry.sql));
      expect(insert?.sql).toMatch(/\blocale_code\b/);
      expect(insert?.params).toContain(localeCode);
    }
  });

  it("refuses an input without a locale before any statement (the column default is never relied on)", async () => {
    const withoutLocale: Record<string, unknown> = { ...placeInput(PARENTS) };
    delete withoutLocale["localeCode"];
    for (const input of [
      withoutLocale,
      { ...withoutLocale, localeCode: "" },
      { ...withoutLocale, localeCode: "EN" },
    ]) {
      const { log, executor } = recorder();
      expect(await refusalCode(placeWith(executor, input))).toBe(
        "ORDER_INPUT_INVALID",
      );
      expect(log).toEqual([]);
    }
  });
});

describe("source scan (AC-45): no FO- reference is built outside reference.ts", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("no file under src/ but reference.ts writes `FO-` followed by an interpolation, a concatenation or four reference characters and a hyphen", () => {
    const sources = files(join(process.cwd(), "src")).filter((file) =>
      /\.(ts|tsx)$/.test(file),
    );
    expect(sources.length).toBeGreaterThan(50);
    const builder = /FO-(?:\$\{|["'`]\s*\+|[0-9A-Z]{4}-)/;
    const offenders = sources.filter(
      (file) =>
        !file.endsWith(join("modules", "orders", "service", "reference.ts")) &&
        builder.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
    // The scan sees the one builder there is.
    expect(
      builder.test(
        readFileSync(
          join(process.cwd(), "src/modules/orders/service/reference.ts"),
          "utf8",
        ),
      ),
    ).toBe(true);
  });
});
