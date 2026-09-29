import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

import fo from "./eslint/fo/index.js";
import { moduleBoundaryZones } from "./eslint/modules.js";
import { FIXTURE_MIRROR_ROOT, restrictedRules } from "./eslint/sdk-adapters.js";

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
    // spec 001 §14 A20, AC-50 (§13 Q17: no comment may ever switch a lint rule off). One object
    // with no `files` key, so it applies to every file `eslint .` lints: an `eslint-disable`,
    // `eslint-disable-line`, `eslint-disable-next-line`, `eslint-enable` or `eslint <rule>: off`
    // comment has no effect, and ESLint's "has no effect" warning fails `pnpm lint:js`
    // (`--max-warnings 0`). An exception is a config object named `fo/exception/<path>` whose
    // `files` is exactly that one path, turning off one rule that is not ours, with a comment
    // giving the reason; none may turn off an `fo/*` rule or `no-console`.
    // `tests/unit/lint-coverage.test.ts` (AC-52) fails if this line goes, or if any object turns
    // a lock off or down; `pnpm check:no-literal-disable` (AC-51) still catches bare and `fo/`
    // comments without reading this file.
    name: "fo/no-inline-config",
    linterOptions: { noInlineConfig: true },
  },
  {
    // spec 001 §7: logical CSS and no literal user-facing strings; ADR-0006: no geo redirects.
    // Enforced on application code. `fo/no-direct-order-status-write` has its own block below,
    // because it covers more roots than `src/`.
    // `fo/no-float-money` is switched on for four roots by the `fo/float-money` block below,
    // which is where spec 001 §2's "lint fixture only in 001; enforced on real code from 005"
    // promise is discharged (spec 005 AC-4, TASK-060).
    name: "fo/rules",
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: { fo },
    rules: {
      "fo/no-physical-css": "error",
      "fo/no-literal-strings": "error",
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
    // spec 005 §2 "Pricing", AC-4 (TASK-060): `fo/no-float-money` **enabled**, on the four roots
    // spec 005 names — application code, the authored config (which is where the catalogue
    // dataset and its prices live), the seed scripts spec 002's importer runs and the repository
    // scripts. This is spec 001 TASK-004's "fixture-only in 001, enforced from spec 005" promise
    // discharged; spec 002 AC-6 becomes a regression check when it unparks.
    //
    // The roots are listed separately rather than folded into `fo/rules`' `src/**` glob because
    // AC-4 is a claim about all four, and `tests/unit/lint-fixtures.test.ts` asserts the rule is
    // live for one file in each — a rule that quietly stopped covering `seed/` or `scripts/`
    // would otherwise still look enabled. **No `eslint-disable` for this rule may exist anywhere
    // in the repository** (AC-4, asserted by the same test): money that cannot be expressed in
    // integer minor units is a spec question, not a suppression.
    name: "fo/float-money",
    files: [
      "src/**/*.ts",
      "src/**/*.tsx",
      "src/config/**/*.ts",
      "seed/**/*.ts",
      "scripts/**/*.ts",
    ],
    plugins: { fo },
    rules: { "fo/no-float-money": "error" },
  },
  {
    // spec 001 §5 + ADR-0009, §14 A20 AC-60 (TASK-162): order status changes only via
    // `orderService.transition`. Every root that can reach the database: application code, the
    // repository scripts, the seed scripts, the Drizzle schema, and the root config files. The
    // one allowed path, `src/modules/orders/service/`, is held inside the rule, never here;
    // `tests/` is not policed by lint (spec 002's trigger polices it). The roots are held by
    // `tests/unit/lint-coverage.test.ts` (AC-52's table) and the rule's own test.
    name: "fo/order-status",
    files: [
      "src/**/*.ts",
      "src/**/*.tsx",
      "scripts/**/*.ts",
      "seed/**/*.ts",
      "db/**/*.ts",
      "*.ts",
      "*.mjs",
    ],
    plugins: { fo },
    rules: { "fo/no-direct-order-status-write": "error" },
  },
  // spec 001 §14 A20, AC-56 and AC-57 (TASK-160): the logger's side doors in `src/`, and SDKs
  // only in their adapters, everywhere `eslint .` lints. The four `no-restricted-*` rules are
  // configured here and nowhere else, one object per disjoint file group, from one function:
  // a later object's options replace an earlier one's, so a second object setting one of them
  // would silently drop a list (AC-52, `tests/unit/lint-coverage.test.ts`).
  ...restrictedRules(),
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
    // `fo/no-float-money` over its own fixture pair (spec 005 AC-4, T-02; TASK-060), scoped by
    // name for the reason the `fo/no-adhoc-intl` block below is: several other fixtures name a
    // `price` or a `total` in passing to make a *different* rule's point, and flagging them here
    // would blur which rule each fixture is evidence for. `float-money.ts` carries one violation
    // per shape the rule detects (decimal literal, `number` annotation, `parseFloat`, `toFixed`)
    // and `float-money-valid.ts` — integer minor units through `Intl` — must stay clean.
    // `bare-disable.ts` is the standards audit's plant (spec 001 AC-50, T-54): a bare disable
    // above `price = 1.5`, which must still report the money rule.
    name: "fo/float-money-fixtures",
    files: [
      "tests/fixtures/lint/float-money*.ts",
      "tests/fixtures/lint/bare-disable.ts",
    ],
    plugins: { fo },
    languageOptions: {
      parserOptions: { project: false, projectService: false },
    },
    rules: { "fo/no-float-money": "error" },
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
  // AC-56 and AC-57 over the fixture mirror, from the same function (T-60, T-61).
  ...restrictedRules({ root: FIXTURE_MIRROR_ROOT }),
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
