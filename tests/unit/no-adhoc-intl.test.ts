/**
 * T-21 (spec 003 AC-21, TASK-037): `fo/no-adhoc-intl` over the five ad-hoc-`Intl` fixtures.
 *
 * The rule is path-dependent, so every case runs through RuleTester's `filename` option: the
 * identical code is a violation in an ordinary module and clean in `src/modules/i18n/format.ts`
 * and `src/modules/i18n/collate.ts`, which are the two files that own every locale-sensitive
 * string in the codebase (spec 003 §2 "Formatters").
 *
 * The rule is **syntactic**, deliberately: it has no type information, so it cannot tell a money
 * `toFixed` from a physics `toFixed` and flags both. That is the intended trade — `toFixed` is
 * never the right way to render a number a buyer reads, and the escape hatch is a real formatter,
 * not a disable comment (`CLAUDE.md`: no disabling lint rules).
 */
import { Linter, RuleTester } from "eslint";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import rule, {
  ALLOWED_INTL_MEMBERS,
  CURRENCY_SYMBOLS,
  FORMATTER_MODULE_FILES,
  isFormatterModule,
} from "../../eslint/fo/no-adhoc-intl.js";
import plugin from "../../eslint/fo/index.js";
import { tsLanguageOptions } from "./support/ts-parser";

const repoRoot = resolve(__dirname, "../..");
const fixtureDir = resolve(__dirname, "../fixtures/lint");
const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const ruleTester = new RuleTester({ languageOptions: tsLanguageOptions });

/** An ordinary module file: no ad-hoc formatting may live here. */
const OUTSIDE = "src/modules/catalog/pricing.ts";
/** The two allowed files, at their real repository paths. */
const FORMAT = "src/modules/i18n/format.ts";
const COLLATE = "src/modules/i18n/collate.ts";
/** The mirrored fixture paths, which the rule matches by path suffix. */
const FORMAT_FIXTURE = "tests/fixtures/lint/src/modules/i18n/format.ts";
const COLLATE_FIXTURE = "tests/fixtures/lint/src/modules/i18n/collate.ts";

const lint = (code: string, filename: string): Linter.LintMessage[] =>
  new Linter().verify(
    code,
    {
      files: ["**/*.ts"],
      plugins: { fo: plugin },
      languageOptions: tsLanguageOptions,
      rules: { "fo/no-adhoc-intl": "error" },
    },
    filename,
  );

describe("fo/no-adhoc-intl fixtures (T-21, AC-21)", () => {
  it("reports exactly one error per invalid fixture, with the expected message id", () => {
    expect(() => {
      ruleTester.run("no-adhoc-intl", rule, {
        valid: [],
        invalid: [
          {
            code: fixture("adhoc-intl-numberformat.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "intlFormatter" }],
          },
          {
            code: fixture("adhoc-intl-tolocalestring.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "toLocaleMethod" }],
          },
          {
            code: fixture("adhoc-intl-tolocaledatestring.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "toLocaleMethod" }],
          },
          {
            code: fixture("adhoc-intl-tofixed.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "toFixed" }],
          },
          {
            code: fixture("adhoc-intl-template-currency.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "currencyTemplate" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("accepts the identical code inside the two formatter files (AC-21 second half)", () => {
    const invalidFixtures = [
      "adhoc-intl-numberformat.ts",
      "adhoc-intl-tolocalestring.ts",
      "adhoc-intl-tolocaledatestring.ts",
      "adhoc-intl-tofixed.ts",
      "adhoc-intl-template-currency.ts",
    ];
    expect(() => {
      ruleTester.run("no-adhoc-intl", rule, {
        valid: [
          ...invalidFixtures.flatMap((name) =>
            [FORMAT, COLLATE, FORMAT_FIXTURE, COLLATE_FIXTURE].map(
              (filename) => ({ code: fixture(name), filename }),
            ),
          ),
          { code: fixture("src/modules/i18n/format.ts"), filename: FORMAT },
          {
            code: fixture("src/modules/i18n/format.ts"),
            filename: FORMAT_FIXTURE,
          },
          { code: fixture("src/modules/i18n/collate.ts"), filename: COLLATE },
          {
            code: fixture("src/modules/i18n/collate.ts"),
            filename: COLLATE_FIXTURE,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("points every message at the formatter that replaces the construct", () => {
    const expectations: readonly [string, string][] = [
      [fixture("adhoc-intl-numberformat.ts"), "formatMoney"],
      [fixture("adhoc-intl-tolocalestring.ts"), "formatNumber"],
      [fixture("adhoc-intl-tolocaledatestring.ts"), "formatDate"],
      [fixture("adhoc-intl-tofixed.ts"), "formatMoney"],
      [fixture("adhoc-intl-template-currency.ts"), "formatMoney"],
    ];
    for (const [code, replacement] of expectations) {
      const messages = lint(code, OUTSIDE);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.message).toContain(replacement);
      expect(messages[0]?.message).toContain("src/modules/i18n");
    }
    expect(lint("new Intl.Collator(tag);", OUTSIDE)[0]?.message).toContain(
      "collator",
    );
    expect(lint('const t = rate + "%";', OUTSIDE)[0]?.message).toContain(
      "formatPercentFromBasisPoints",
    );
  });
});

describe("fo/no-adhoc-intl: Intl formatter construction", () => {
  it.each([
    "NumberFormat",
    "DateTimeFormat",
    "RelativeTimeFormat",
    "ListFormat",
    "PluralRules",
    "Collator",
    "Segmenter",
    "DisplayNames",
    "DurationFormat",
  ])("flags Intl.%s in every value position", (member) => {
    expect(lint(`new Intl.${member}("de");`, OUTSIDE)).toHaveLength(1);
    expect(lint(`Intl.${member}("de");`, OUTSIDE)).toHaveLength(1);
    // aliasing: the member access itself is the report site, so the alias is caught too
    expect(lint(`const F = Intl.${member};`, OUTSIDE)).toHaveLength(1);
    expect(lint(`new Intl.${member}("de");`, FORMAT)).toHaveLength(0);
  });

  it("reports a construction once, not once per node", () => {
    expect(
      lint(
        'new Intl.NumberFormat("de", { style: "percent" }).format(0.2);',
        OUTSIDE,
      ),
    ).toHaveLength(1);
  });

  it.each([...ALLOWED_INTL_MEMBERS])(
    "allows the non-formatting Intl member %s everywhere",
    (member) => {
      for (const filename of [OUTSIDE, FORMAT, "src/config/locales.ts"]) {
        expect(lint(`Intl.${member}("de-DE");`, filename)).toHaveLength(0);
        expect(lint(`new Intl.${member}("de-DE");`, filename)).toHaveLength(0);
      }
    },
  );

  it("leaves Intl type annotations and unrelated identifiers alone", () => {
    expect(
      lint("let f: Intl.NumberFormat | undefined;\nexport { f };\n", OUTSIDE),
    ).toHaveLength(0);
    expect(
      lint(
        "const m = new Map<string, Intl.DateTimeFormat>();\nexport { m };\n",
        OUTSIDE,
      ),
    ).toHaveLength(0);
    expect(
      lint("const s = x as Intl.StringNumericLiteral;", OUTSIDE),
    ).toHaveLength(0);
    expect(lint("myIntl.NumberFormat(tag);", OUTSIDE)).toHaveLength(0);
    expect(lint("new NumberFormat(tag);", OUTSIDE)).toHaveLength(0);
  });
});

describe("fo/no-adhoc-intl: toLocale* and toFixed", () => {
  it.each(["toLocaleString", "toLocaleDateString", "toLocaleTimeString"])(
    "flags .%s() outside the formatter module",
    (method) => {
      expect(lint(`value.${method}();`, OUTSIDE)).toHaveLength(1);
      expect(lint(`value.${method}("de-DE", {});`, OUTSIDE)).toHaveLength(1);
      expect(lint(`value.${method}();`, FORMAT)).toHaveLength(0);
      expect(lint(`value.${method}();`, COLLATE)).toHaveLength(0);
    },
  );

  it("flags toFixed on any receiver — the rule is syntactic, not type-aware", () => {
    expect(lint("const label = ratio.toFixed(2);", OUTSIDE)).toHaveLength(1);
    expect(lint("const label = stemLength.toFixed(1);", OUTSIDE)).toHaveLength(
      1,
    );
    expect(lint("const label = (1 / 3).toFixed(4);", OUTSIDE)).toHaveLength(1);
    expect(lint("const label = ratio.toFixed(2);", FORMAT)).toHaveLength(0);
  });

  it("leaves lookalike method names alone", () => {
    expect(lint("value.toLocaleUpperCase();", OUTSIDE)).toHaveLength(0);
    expect(lint("value.toFixedWidth();", OUTSIDE)).toHaveLength(0);
    expect(lint("value.toString();", OUTSIDE)).toHaveLength(0);
    expect(lint("toFixed(2);", OUTSIDE)).toHaveLength(0);
  });
});

describe("fo/no-adhoc-intl: hand-built currency and percent strings", () => {
  it.each([...CURRENCY_SYMBOLS])("flags a template ending in %s", (symbol) => {
    expect(lint(`const t = \`\${amount} ${symbol}\`;`, OUTSIDE)).toHaveLength(
      1,
    );
    expect(lint(`const t = \`${symbol}\${amount}\`;`, OUTSIDE)).toHaveLength(1);
    expect(lint(`const t = \`\${amount} ${symbol}\`;`, FORMAT)).toHaveLength(0);
  });

  it("flags a percent template and a percent concatenation", () => {
    expect(lint("const t = `${rate}%`;", OUTSIDE)).toHaveLength(1);
    expect(lint('const t = rate + "%";', OUTSIDE)).toHaveLength(1);
    expect(lint('const t = "€" + amount;', OUTSIDE)).toHaveLength(1);
    expect(lint('const t = amount + " zł";', OUTSIDE)).toHaveLength(1);
    expect(lint("const t = `${rate}%`;", FORMAT)).toHaveLength(0);
    expect(lint('const t = rate + "%";', COLLATE)).toHaveLength(0);
  });

  it("leaves ordinary templates and non-adjacent symbols alone", () => {
    expect(lint("const t = `${count} items`;", OUTSIDE)).toHaveLength(0);
    expect(lint("const t = `/${locale}/send-flowers`;", OUTSIDE)).toHaveLength(
      0,
    );
    expect(lint("const t = `${a}-${b}`;", OUTSIDE)).toHaveLength(0);
    // a literal with no interpolation is a message-catalogue problem, not this rule's
    expect(lint('const t = "45,00 zł";', OUTSIDE)).toHaveLength(0);
    expect(lint("const t = `100%`;", OUTSIDE)).toHaveLength(0);
    // the symbol is not adjacent to the expression
    expect(
      lint("const t = `€10 minimum for ${count} stems`;", OUTSIDE),
    ).toHaveLength(0);
    expect(lint('const t = "a" + "%";', OUTSIDE)).toHaveLength(0);
  });
});

describe("fo/no-adhoc-intl allowlist and repository state", () => {
  it("allows exactly the two formatter files, by path suffix", () => {
    expect(FORMATTER_MODULE_FILES).toEqual([
      "src/modules/i18n/format.ts",
      "src/modules/i18n/collate.ts",
    ]);
    expect(isFormatterModule("/repo/src/modules/i18n/format.ts")).toBe(true);
    expect(isFormatterModule("C:\\repo\\src\\modules\\i18n\\collate.ts")).toBe(
      true,
    );
    expect(isFormatterModule(`/repo/${FORMAT_FIXTURE}`)).toBe(true);
    expect(isFormatterModule("/repo/src/modules/i18n/address.ts")).toBe(false);
    expect(isFormatterModule("/repo/src/modules/i18n/format.test.ts")).toBe(
      false,
    );
    expect(isFormatterModule("/repo/src/lib/format.ts")).toBe(false);
  });

  it("passes over the real src/ tree", async () => {
    const { ESLint } = await import("eslint");
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    const results = await eslint.lintFiles(["src/**/*.ts", "src/**/*.tsx"]);
    const offenders = results.flatMap((result) =>
      result.messages
        .filter((message) => message.ruleId === "fo/no-adhoc-intl")
        .map((message) => `${result.filePath}:${String(message.line)}`),
    );
    expect(offenders).toEqual([]);
  });

  it("is enabled as an error on src/** by the real config", async () => {
    const { ESLint } = await import("eslint");
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    for (const file of [
      "src/modules/catalog/pricing.ts",
      "src/app/page.tsx",
      "src/modules/i18n/address.ts",
    ]) {
      const config = await eslint.calculateConfigForFile(
        resolve(repoRoot, file),
      );
      expect(config.rules?.["fo/no-adhoc-intl"]?.[0], file).toBe(2);
    }
  });

  it("has an every-fixture counterpart on disk", () => {
    const names = readdirSync(fixtureDir).filter((name) =>
      name.startsWith("adhoc-intl-"),
    );
    expect(names.sort()).toEqual([
      "adhoc-intl-numberformat.ts",
      "adhoc-intl-template-currency.ts",
      "adhoc-intl-tofixed.ts",
      "adhoc-intl-tolocaledatestring.ts",
      "adhoc-intl-tolocalestring.ts",
    ]);
  });
});
