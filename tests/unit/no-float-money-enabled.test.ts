/**
 * T-07 — `fo/no-float-money` is enabled for `src/`, `seed/` and `scripts/` (spec 002 AC-6;
 * TASK-027). Spec 005 (TASK-060) switched the rule on first; this is spec 002's regression check,
 * through the real `eslint.config.mjs` and the exact specimens AC-6 and T-07 name.
 */
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function floatMoneyErrors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter(
    (message) => message.ruleId === "fo/no-float-money",
  ).length;
}

const ROOTS = [
  "src/lib/ac6-specimen.ts",
  "seed/ac6-specimen.ts",
  "scripts/ac6-specimen.ts",
] as const;

describe("T-07 — fo/no-float-money on the three roots (AC-6)", () => {
  it.each(ROOTS)("%s: `const total = 45.9` fails lint", async (path) => {
    expect(
      await floatMoneyErrors("export const total = 45.9;\n", path),
    ).toBeGreaterThan(0);
  });

  it.each(ROOTS)(
    "%s: parseFloat(price) and amount.toFixed(2) fail",
    async (path) => {
      expect(
        await floatMoneyErrors(
          "declare const price: string;\nexport const parsed = parseFloat(price);\n",
          path,
        ),
      ).toBeGreaterThan(0);
      expect(
        await floatMoneyErrors(
          "declare const amount: number;\nexport const shown = amount.toFixed(2);\n",
          path,
        ),
      ).toBeGreaterThan(0);
    },
  );

  it.each(ROOTS)("%s: integer minor units pass", async (path) => {
    expect(
      await floatMoneyErrors(
        "export const total_minor = 4590;\nexport const retailMinor = 4590;\n",
        path,
      ),
    ).toBe(0);
  });
});
