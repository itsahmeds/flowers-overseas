/**
 * The TypeScript parser for `RuleTester` (TASK-004).
 *
 * The TASK-003 fixtures are espree-parseable JSX; the TASK-004 fixtures are `.ts` files with
 * type annotations (AC-7/AC-8/AC-9 name them `*.ts`, and `fo/no-float-money` exists precisely to
 * flag `: number` annotations), so their tests need `@typescript-eslint/parser`.
 *
 * It is taken from the `eslint-config-next/typescript` flat config rather than imported as a
 * direct dependency: that is the exact parser instance `eslint.config.mjs` uses on `**\/*.ts`, so
 * the unit tests and `pnpm lint` can never disagree about syntax, and the repository does not
 * pin a second copy of a transitive package. If Next ever stops shipping the parser, every
 * TASK-004 rule test fails loudly here instead of silently skipping the TS-only cases.
 */
import type { Linter } from "eslint";
import nextTs from "eslint-config-next/typescript";

const withParser = (nextTs as Linter.Config[]).find(
  (block) => block.languageOptions?.parser !== undefined,
);

const parser = withParser?.languageOptions?.parser ?? undefined;

if (parser === undefined || parser === null) {
  throw new Error(
    "eslint-config-next/typescript no longer exposes a parser; add @typescript-eslint/parser as a direct devDependency and update tests/unit/support/ts-parser.ts",
  );
}

export const tsParser = parser as Linter.Parser;

export const tsLanguageOptions = {
  parser: tsParser,
  ecmaVersion: 2022 as const,
  sourceType: "module" as const,
};
