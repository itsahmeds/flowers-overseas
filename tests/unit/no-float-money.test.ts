/**
 * `fo/no-float-money` (spec 001 §2, §14 A20 AC-58 / T-62; spec 005 AC-4; plan/12 §2 "Money";
 * TASK-004, TASK-161). The TASK-004 shapes (`number` annotation, decimal literal,
 * `parseFloat`/`toFixed`), then T-62's rows exactly as the spec lists them, then one block per
 * AC-58 clause with the edges each branch of the rule decides.
 *
 * That the rule is live on the four roots, and never switched off, is asserted in
 * `tests/unit/lint-fixtures.test.ts`.
 */
import { Linter, RuleTester } from "eslint";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import rule, {
  hasWholeNumberEnding,
  isDecimalLiteral,
  isMoneyName,
  nameWords,
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
  // AC-58 clause 1: a money name is matched by word, after splitting on `_`, `-` and camel case.
  it.each([
    "price",
    "unitPrice",
    "amount",
    "TOTAL",
    "payout",
    "fee",
    "feeDue",
    "cost",
    "vatRateBp",
    "sub_total_x",
    "subtotal",
    "surchargeMinor",
    "discount",
    "refund-id",
    "grossMinor",
    "netAmount",
    "retail",
    "priceMinor",
    "totalBytes",
    "priceText",
  ])("%s is a money name", (name) => {
    expect(isMoneyName(name)).toBe(true);
  });

  it.each([
    "feedback",
    "coffee",
    "quantity",
    "locale",
    "network",
    "subtotals2go",
    "mediaBytes",
    "priced",
  ])("%s is not a money name", (name) => {
    expect(isMoneyName(name)).toBe(false);
  });

  it("splits a name into lower-case words on `_`, `-` and camel case", () => {
    expect(nameWords("deliveryFee_minor-XRate")).toEqual([
      "delivery",
      "fee",
      "minor",
      "x",
      "rate",
    ]);
    expect(nameWords("VATRateBp")).toEqual(["vat", "rate", "bp"]);
  });

  // AC-58 clause 2: the whole-number endings.
  it.each([
    ["priceMinor", true],
    ["price_minor", true],
    ["vatRateBp", true],
    ["vat_rate_bp", true],
    ["fxSpreadPpm", true],
    ["fx_spread_ppm", true],
    ["price", false],
    ["minorPrice", false],
    ["priceMinorText", false],
  ])("%s has a whole-number ending: %s", (name, expected) => {
    expect(hasWholeNumberEnding(name)).toBe(expected);
  });

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

/**
 * T-62 (spec 001 §14 A20, AC-58; TASK-161): the five clauses, every Invalid and Valid row exactly
 * as the spec lists them. A row the spec writes as a bare member (`vatRateBp: number`) is placed
 * in an interface, a parameter and a class field, so each declaration visitor carries it.
 */
describe("T-62: the money shapes lint can see (AC-58)", () => {
  it("reports every T-62 Invalid row and passes every Valid row", () => {
    expect(() => {
      ruleTester.run("no-float-money", rule, {
        valid: [
          // clause 3: a byte count is not money; the rename is the fix (seed/check.ts L2437)
          { code: "mediaBytes / COMMITTED_MEDIA_BYTE_CAP;" },
          // clause 3: the whole division is the argument of Math.trunc (schemas.ts L997)
          { code: "Math.trunc(amountMinor / scale);" },
          // clause 4: a whole basis-point rate (vat.ts L58)
          { code: "grossMinor * rateBp;" },
          // clause 2: `Bp` exempts a name from the `number`-type clause
          { code: "interface Rate { vatRateBp: number }" },
          { code: "function f(vatRateBp: number) { return vatRateBp; }" },
          { code: "class Rate { vatRateBp: number = 2300; }" },
          // clause 1: matched by word, not substring
          { code: "interface Survey { feedback: number }" },
          { code: "function f(feedback: number) { return feedback; }" },
          { code: "interface Order { coffee: number }" },
          { code: "function f(coffee: number) { return coffee; }" },
          // clause 2: a whole literal in a `Minor` name
          { code: "const totalMinor = 4590;" },
        ],
        invalid: [
          { code: "priceMinor / 100;", errors: [{ messageId: "division" }] },
          {
            code: "priceMinor * 0.23;",
            errors: [{ messageId: "decimalFactor" }],
          },
          {
            code: "Math.round(priceMinor * 0.23);",
            errors: [{ messageId: "decimalFactor" }],
          },
          {
            code: "const amountMinor = 12.5;",
            errors: [{ messageId: "decimal" }],
          },
          { code: "const cost = 12.99;", errors: [{ messageId: "decimal" }] },
          {
            code: "const vatRateBp = 23.5;",
            errors: [{ messageId: "decimal" }],
          },
          {
            code: "const priceMinor = Number(s);",
            errors: [{ messageId: "coerce" }],
          },
          {
            code: "Number(order.amountMinor);",
            errors: [{ messageId: "coerce" }],
          },
          { code: "+priceText;", errors: [{ messageId: "coerce" }] },
          { code: "parseInt(totalText);", errors: [{ messageId: "coerce" }] },
          {
            code: "total / COMMITTED_MEDIA_BYTE_CAP;",
            errors: [{ messageId: "division" }],
          },
          { code: "totalBytes / cap;", errors: [{ messageId: "division" }] },
        ],
      });
    }).not.toThrow();
  });

  describe("clause 1: money words", () => {
    it.each([
      "const cost = 12.99;",
      "const subtotal = 1.5;",
      "const surcharge = 0.5;",
      "const discount = 2.5;",
      "const refund = 3.5;",
      "const gross = 4.5;",
      "const net = 5.5;",
      "const retail = 6.5;",
      "const vat = 0.23;",
      "let shippingCost: number;",
    ])("%s reports 1", (code) => {
      expect(lint(code)).toHaveLength(1);
    });

    it.each([
      "const feedback = 4.5;",
      "const coffee = 2.5;",
      "let network: number;",
    ])("%s reports 0", (code) => {
      expect(lint(code)).toHaveLength(0);
    });
  });

  describe("clause 2: whole-number endings exempt the `number` type only", () => {
    it.each([
      "const priceMinor = 12.5;",
      "const price_minor = -0.5;",
      "const feeSharePpm = 1.5;",
      "const cart = { totalMinor: 19.99 };",
      "class Line { amountMinor = 0.5; }",
      "function f(feeMinor = 0.5) { return feeMinor; }",
      "let amountMinor = 0; amountMinor = 12.5;",
      "parseFloat(priceMinor);",
      "priceMinor.toFixed(2);",
    ])("%s reports 1", (code) => {
      expect(lint(code)).toHaveLength(1);
    });

    it.each([
      "let priceMinor: number;",
      "let feeSharePpm: number;",
      "let vat_rate_bp: number;",
      "let amountMinor = 0; amountMinor = 1250;",
    ])("%s reports 0", (code) => {
      expect(lint(code)).toHaveLength(0);
    });
  });

  describe("clause 3: a division whose left side mentions a money name", () => {
    it.each([
      "(priceMinor + deliveryFeeMinor) / 100;",
      "order.totalMinor / 100;",
      "Math.round(priceMinor / 100) + priceMinor / 3;",
      "Math.round(priceMinor / 100 + 1);",
      "Math.abs(priceMinor / 100);",
      "round(priceMinor / 100);",
      "let priceMinor = 5; priceMinor /= 2;",
    ])("%s reports 1", (code) => {
      expect(lint(code)).toHaveLength(1);
    });

    it.each([
      "Math.round(priceMinor / 100);",
      "Math.floor(priceMinor / 100);",
      "Math.ceil(priceMinor / 100);",
      "Math.trunc(amountMinor / scale);",
      "Math.round((grossMinor * rateBp) / 10000);",
      "100 / priceMinor;",
      "count / 2;",
    ])("%s reports 0", (code) => {
      expect(lint(code)).toHaveLength(0);
    });
  });

  describe("clause 4: a money name multiplied or divided by a decimal literal", () => {
    it.each([
      "0.23 * priceMinor;",
      "Math.round(0.23 * priceMinor);",
      "Math.trunc(priceMinor / 1.2);",
      "order.amountMinor * -0.5;",
      "let priceMinor = 5; priceMinor *= 1.2;",
    ])("%s reports 1", (code) => {
      expect(lint(code)).toHaveLength(1);
    });

    it.each([
      "priceMinor * 2;",
      "ratio * 0.5;",
      "Math.round(priceMinor * rateBp / 10000);",
    ])("%s reports 0", (code) => {
      expect(lint(code)).toHaveLength(0);
    });
  });

  describe("clause 5: text to number on money", () => {
    it.each([
      "Number.parseInt(priceText, 10);",
      "const totalMinor = parseInt(s, 10);",
      "const cart = { priceMinor: Number(s) };",
      "let feeMinor = 0; feeMinor = Number(s);",
      "const amountMinor = +s;",
    ])("%s reports 1", (code) => {
      expect(lint(code)).toHaveLength(1);
    });

    it("reports both calls in the listing.ts L1117 comparator", () => {
      expect(
        lint(
          "const d = Number(left.price.amountMinor) - Number(right.price.amountMinor);",
        ),
      ).toHaveLength(2);
    });

    it.each([
      "const quantity = Number(s);",
      "parseInt(pageText, 10);",
      "+countText;",
      "-priceMinor;",
      "left.price.amountMinor - right.price.amountMinor;",
    ])("%s reports 0", (code) => {
      expect(lint(code)).toHaveLength(0);
    });
  });
});
