import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

import fo from "./eslint/fo/index.js";
import { moduleBoundaryZones } from "./eslint/modules.js";

// Base config (TASK-001), the local `fo/` plugin (TASK-003, TASK-004) and the module-boundary
// zones of plan/01 §5 (TASK-004).
//
// `import/no-restricted-paths` comes from `eslint-plugin-import`, which `eslint-config-next`
// already registers under the `import` namespace together with its TypeScript resolver
// (`eslint-import-resolver-typescript`, so `@/*` -> `src/*` from tsconfig.json resolves). Flat
// config merges the plugins of every matching config object, so the rule can be switched on here
// without registering a second copy of the plugin — which ESLint 9 would reject as a redefinition.
// `tests/unit/module-boundaries.test.ts` fails loudly if that registration ever disappears.
const repoRoot = import.meta.dirname;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // spec 001 §7: logical CSS and no literal user-facing strings; §5 + ADR-0009 + ADR-0006:
    // no direct order-status writes and no geo redirects. Enforced on application code.
    // `fo/no-float-money` is deliberately absent: spec 001 §2 ships it "lint fixture only in
    // 001; enforced on real code from 005", because the money vocabulary (`*_minor` field and
    // column names) is fixed by spec 005. Enable it there:
    //   "fo/no-float-money": "error", // enabled by spec 005
    name: "fo/rules",
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: { fo },
    rules: {
      "fo/no-physical-css": "error",
      "fo/no-literal-strings": "error",
      "fo/no-direct-order-status-write": "error",
      "fo/no-geo-redirect": "error",
      // spec 003 §2, AC-21 (TASK-037): exactly one way to render a price, a date, a list or an
      // address block. The rule allowlists `src/modules/i18n/format.ts` and `collate.ts` by path
      // suffix itself, so no `files` override is needed here.
      "fo/no-adhoc-intl": "error",
      // spec 004 §2, AC-1 (TASK-045): colours come from the `@theme` tokens of
      // `src/app/globals.css` and from nowhere else, so a palette swap is one diff. The rule
      // needs no path exception: it looks at `className`/class-helper/`style` values only, and
      // the token file is CSS (Stylelint's `color-no-hex` and the colour-property ban hold that
      // side).
      "fo/no-raw-color": "error",
      // spec 001 §2: `no-console` (error) outside `src/lib/logger.ts` and `scripts/`. The logger
      // is the only writer of log lines, so PII redaction cannot be bypassed (§8, AC-12).
      "no-console": "error",
    },
  },
  {
    // `src/lib/logger.ts` is the single allowed console writer: on the edge runtime there is no
    // `process.stdout`, so the logger falls back to `console.log` (spec 001 §5, TASK-005).
    name: "fo/logger-console",
    files: ["src/lib/logger.ts"],
    rules: { "no-console": "off" },
  },
  {
    // plan/01 §5: `app/` imports from `modules/`, never the reverse; `modules/*` import each
    // other's public `index.ts` barrel only. Zones generated from the module manifest in
    // `scripts/check-layout.ts`, so adding a module updates one list.
    name: "fo/module-boundaries",
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        { basePath: repoRoot, zones: moduleBoundaryZones({ srcRoot: "src" }) },
      ],
    },
  },
  {
    // The same rules over the fixture directory. `pnpm lint` never reaches these files (they are
    // in `globalIgnores` below); `pnpm lint:fixtures` runs ESLint with `--no-ignore` semantics so
    // AC-4, AC-5, AC-7, AC-8 and AC-9 have an executable form against the real config.
    name: "fo/rules-fixtures",
    files: ["tests/fixtures/lint/**/*.ts", "tests/fixtures/lint/**/*.tsx"],
    plugins: { fo },
    languageOptions: {
      parserOptions: { project: false, projectService: false },
    },
    rules: {
      "fo/no-physical-css": "error",
      "fo/no-literal-strings": "error",
      "fo/no-direct-order-status-write": "error",
      "fo/no-geo-redirect": "error",
      "fo/no-raw-color": "error",
      "no-console": "error",
    },
  },
  {
    // `fo/no-adhoc-intl` over its own fixtures only (spec 003 AC-21, TASK-037), rather than over
    // the whole fixture directory: `float-money-valid.ts` is a TASK-004 fixture whose *point* is
    // that money went through `new Intl.NumberFormat`, and it is pinned clean by
    // `tests/unit/lint-fixtures.test.ts`. Widening the glob would retro-flag it and blur which
    // rule each fixture is evidence for. The mirrored `src/modules/i18n/format.ts` and
    // `collate.ts` are included so the "passes inside the formatter module" half of AC-21 runs
    // through the real config, matched by the rule's own path-suffix allowlist.
    name: "fo/adhoc-intl-fixtures",
    files: [
      "tests/fixtures/lint/adhoc-intl-*.ts",
      "tests/fixtures/lint/src/modules/i18n/format.ts",
      "tests/fixtures/lint/src/modules/i18n/collate.ts",
    ],
    plugins: { fo },
    languageOptions: {
      parserOptions: { project: false, projectService: false },
    },
    rules: { "fo/no-adhoc-intl": "error" },
  },
  {
    // AC-9 over the fixtures. The offending imports must resolve or the rule skips them, so the
    // fixtures live in a mirrored `tests/fixtures/lint/src` tree with its own resolver project
    // (`tsconfig.lint-fixtures.json`, `@/*` -> `tests/fixtures/lint/src/*`) and the zones are
    // generated by the same function with that tree as `srcRoot`.
    name: "fo/module-boundaries-fixtures",
    files: ["tests/fixtures/lint/src/**/*.ts"],
    languageOptions: {
      parserOptions: { project: false, projectService: false },
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "tsconfig.lint-fixtures.json",
        },
      },
    },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          basePath: repoRoot,
          zones: moduleBoundaryZones({ srcRoot: "tests/fixtures/lint/src" }),
        },
      ],
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
