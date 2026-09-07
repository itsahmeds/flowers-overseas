import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

import fo from "./eslint/fo/index.js";

// Base config (TASK-001) + the local `fo/` plugin (TASK-003).
// `import/no-restricted-paths` and the remaining `fo/*` rules land in TASK-004.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // spec 001 §7: logical CSS and no literal user-facing strings, enforced on application code.
    name: "fo/rules",
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: { fo },
    rules: {
      "fo/no-physical-css": "error",
      "fo/no-literal-strings": "error",
    },
  },
  {
    // The same two rules over the fixture directory. `pnpm lint` never reaches these files
    // (they are in `globalIgnores` below); `pnpm lint:fixtures` runs ESLint with `--no-ignore`
    // so AC-4 / AC-5 have an executable form against the real config.
    name: "fo/rules-fixtures",
    files: ["tests/fixtures/lint/**/*.tsx"],
    plugins: { fo },
    languageOptions: {
      parserOptions: { project: false, projectService: false },
    },
    rules: {
      "fo/no-physical-css": "error",
      "fo/no-literal-strings": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // Rule fixtures violate the rules on purpose: `pnpm lint:fixtures` and the unit tests
    // run the rules against them (spec 001 §2 "Testing harness").
    "tests/fixtures/**",
  ]),
]);

export default eslintConfig;
