/**
 * `fo/no-float-money` (spec 001 §2, §7 "Formatting via Intl", §8 "Price display"; plan/12 §2
 * "Money"; TASK-004). No AC id: spec 001 ships the rule "lint fixture only … enforced on real
 * code from 005", so this file is the whole gate in Phase 0 — it must therefore cover the three
 * shapes the spec names (`number` annotation, decimal literal, `parseFloat`/`toFixed`) and the
 * `*_minor` / `*Minor` allowance.
 *
 * The companion assertion that the rule is *not* yet enabled on `src/**` lives in
 * `tests/unit/lint-fixtures.test.ts`.
 */
import { Linter, RuleTester } from "eslint";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import rule, {
  isDecimalLiteral,
  isMoneyName,
} from "../../eslint/fo/no-float-money.js";
import plugin from "../../eslint/fo/index.js";
import { tsLanguageOptions } from "./support/ts-parser";

const fixtureDir = resolve(__dirname, "../fixtures/lint");
const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const ruleTester = new RuleTester({ languageOptions: tsLanguageOptions });

const lint = (code: string): Linter.LintMessage[] =>
  new Linter().verify(
    code,
    {
      files: ["**/*.ts"],
      plugins: { fo: plugin },
      languageOptions: tsLanguageOptions,
      rules: { "fo/no-float-money": "error" },
    },
    "src/modules/catalog/pricing.ts",
  );

describe("fo/no-float-money fixtures", () => {
  it("reports one error per shape in float-money.ts and none in the minor-unit fixture", () => {
    expect(() => {
      ruleTester.run("no-float-money", rule, {
        valid: [{ code: fixture("float-money-valid.ts") }],
        invalid: [
          {
            code: fixture("float-money.ts"),
            errors: [
              { messageId: "decimal" },
              { messageId: "annotation" },
              { messageId: "parseFloat" },
              { messageId: "toFixed" },
            ],
          },
        ],
      });
    }).not.toThrow();
  });
});

describe("fo/no-float-money shapes", () => {
  it.each([
    ["const price: number = 0;", 1],
    ["let totalAmount: number;", 1],
    ["function f(deliveryFee: number) { return deliveryFee; }", 1],
    ["interface Order { payout: number }", 1],
    ["class Order { total: number = 0; }", 1],
    ["const price = 12.5;", 1],
    ["const fee = -1.5;", 1],
    ["const cart = { totalPrice: 19.99 };", 1],
    ["parseFloat(rawPrice);", 1],
    ["Number.parseFloat(order.amount);", 1],
    ["total.toFixed(2);", 1],
    ["order.payout.toFixed(2);", 1],
  ])("%s reports %i", (code, expected) => {
    expect(lint(code)).toHaveLength(expected);
  });

  it.each([
    ["const price_minor: number = 1250;", 0],
    ["const totalMinor: number = 1250;", 0],
    ["function f(payout_minor: number) { return payout_minor; }", 0],
    ["interface Order { fee_minor: number }", 0],
    ["const price = 1250;", 0],
    ["const quantity = 1.5;", 0],
    ["parseFloat(raw);", 0],
    ["ratio.toFixed(2);", 0],
    ["const priceMinor = listPriceMinor + deliveryFeeMinor;", 0],
  ])("%s reports %i", (code, expected) => {
    expect(lint(code)).toHaveLength(expected);
  });

  it("reports a money declaration once even when annotated and decimal", () => {
    const messages = lint("const price: number = 12.5;");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("minor units");
  });
});

describe("exported predicates", () => {
  it.each(["price", "unitPrice", "amount", "TOTAL", "payout", "fee", "feeDue"])(
    "%s is a money name",
    (name) => {
      expect(isMoneyName(name)).toBe(true);
    },
  );

  it.each(["price_minor", "priceMinor", "totalMinor", "quantity", "locale"])(
    "%s is not a money name",
    (name) => {
      expect(isMoneyName(name)).toBe(false);
    },
  );

  it("recognises decimal literals including signed ones", () => {
    const parse = (code: string): unknown => {
      const linter = new Linter();
      let seen: unknown = null;
      linter.verify(
        code,
        {
          files: ["**/*.ts"],
          languageOptions: tsLanguageOptions,
          plugins: {
            probe: {
              rules: {
                capture: {
                  create: () => ({
                    VariableDeclarator: (node: { init?: unknown }) => {
                      seen = node.init;
                    },
                  }),
                },
              },
            },
          },
          rules: { "probe/capture": "error" },
        },
        "probe.ts",
      );
      return seen;
    };
    expect(isDecimalLiteral(parse("const a = 12.5;"))).toBe(true);
    expect(isDecimalLiteral(parse("const a = -1.5;"))).toBe(true);
    expect(isDecimalLiteral(parse("const a = 1250;"))).toBe(false);
    expect(isDecimalLiteral(parse('const a = "12.5";'))).toBe(false);
  });
});
