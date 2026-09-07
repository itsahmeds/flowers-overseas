/**
 * T-08 (spec 001 AC-7, TASK-004; ADR-0009): `fo/no-direct-order-status-write` over the
 * order-status fixtures. The rule is path-dependent — the same call is a violation in
 * `src/modules/catalog/x.ts` and legitimate in `src/modules/orders/service/transition.ts` — so
 * every case is run through RuleTester's `filename` option.
 */
import { Linter, RuleTester } from "eslint";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import rule, {
  isOrderServiceFile,
  isOrderStatusSql,
} from "../../eslint/fo/no-direct-order-status-write.js";
import plugin from "../../eslint/fo/index.js";
import { tsLanguageOptions } from "./support/ts-parser";

const fixtureDir = resolve(__dirname, "../fixtures/lint");
const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const ruleTester = new RuleTester({ languageOptions: tsLanguageOptions });

/** A module outside the order service: nothing here may write the status column. */
const OUTSIDE = "src/modules/catalog/x.ts";
/** The state machine itself (ADR-0009): the one place the write is allowed. */
const INSIDE = "src/modules/orders/service/transition.ts";

describe("fo/no-direct-order-status-write fixtures (T-08)", () => {
  it("reports exactly one error per invalid fixture outside src/modules/orders/service/", () => {
    expect(() => {
      ruleTester.run("no-direct-order-status-write", rule, {
        valid: [],
        invalid: [
          {
            code: fixture("order-status-drizzle.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            code: fixture("order-status-sql.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "sql" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("allows the identical Drizzle call and SQL inside the order service, and clean writes anywhere", () => {
    expect(() => {
      ruleTester.run("no-direct-order-status-write", rule, {
        valid: [
          {
            code: fixture("src/modules/orders/service/transition.ts"),
            filename: INSIDE,
          },
          { code: fixture("order-status-drizzle.ts"), filename: INSIDE },
          { code: fixture("order-status-sql.ts"), filename: INSIDE },
          { code: fixture("order-status-valid.ts"), filename: OUTSIDE },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("cites ADR-0009 and orderService.transition in the message", () => {
    const linter = new Linter();
    const messages = linter.verify(
      fixture("order-status-drizzle.ts"),
      {
        files: ["**/*.ts"],
        plugins: { fo: plugin },
        languageOptions: tsLanguageOptions,
        rules: { "fo/no-direct-order-status-write": "error" },
      },
      "src/modules/catalog/x.ts",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("ADR-0009");
    expect(messages[0]?.message).toContain("orderService.transition");
  });
});

describe("fo/no-direct-order-status-write shapes", () => {
  const lint = (code: string, filename = OUTSIDE): Linter.LintMessage[] => {
    const linter = new Linter();
    return linter.verify(
      code,
      {
        files: ["**/*.ts"],
        plugins: { fo: plugin },
        languageOptions: tsLanguageOptions,
        rules: { "fo/no-direct-order-status-write": "error" },
      },
      filename,
    );
  };

  it.each([
    ['db.update(orders).set({ status: "paid" });', 1],
    ["tx.update(orders).set({ status }).where(eq(orders.id, id));", 1],
    ["db.update(orders).set({ ...statusPatch });", 1],
    ['db.update(schema.orders).set({ "status": next });', 1],
    ['await db.update(orders).where(cond).set({ status: "paid" });', 1],
    ['db.update(orders).set({ recipient_name: "x" });', 0],
    ['db.update(order_events).set({ status: "x" });', 0],
    ["db.update(orders).set({ statusless: 1 });", 0],
  ])("Drizzle chain %s reports %i", (code, expected) => {
    expect(lint(code)).toHaveLength(expected);
  });

  it.each([
    ["sql`UPDATE orders SET status = 'paid'`;", 1],
    ["sql`update  orders\n  set status = $1, updated_at = now()`;", 1],
    ["const q = \"UPDATE orders SET status = 'paid'\";", 1],
    ["sql`UPDATE orders SET recipient_name = $1`;", 0],
    ["sql`SELECT status FROM orders`;", 0],
    ["sql`UPDATE partners SET status = 'live'`;", 0],
  ])("SQL %s reports %i", (code, expected) => {
    expect(lint(code)).toHaveLength(expected);
  });

  it("stays silent everywhere inside the order service", () => {
    expect(
      lint('db.update(orders).set({ status: "paid" });', INSIDE),
    ).toHaveLength(0);
    expect(
      lint(
        "sql`UPDATE orders SET status = 'paid'`;",
        "src/modules/orders/service/nested/guards.ts",
      ),
    ).toHaveLength(0);
  });
});

describe("exported predicates", () => {
  it("recognises the order-service path on posix and windows separators", () => {
    expect(isOrderServiceFile("/repo/src/modules/orders/service/x.ts")).toBe(
      true,
    );
    expect(
      isOrderServiceFile("C:\\repo\\src\\modules\\orders\\service\\x.ts"),
    ).toBe(true);
    expect(isOrderServiceFile("/repo/src/modules/orders/queries.ts")).toBe(
      false,
    );
  });

  it("matches the spec's SQL pattern", () => {
    expect(isOrderStatusSql("UPDATE orders SET status = 'paid'")).toBe(true);
    expect(isOrderStatusSql("update orders set x = 1, status = 'paid'")).toBe(
      true,
    );
    expect(
      isOrderStatusSql("UPDATE orders SET x = 1; UPDATE p SET status = 2"),
    ).toBe(false);
  });
});
