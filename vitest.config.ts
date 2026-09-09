import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { loadCoverageThresholds } from "./scripts/coverage-thresholds.ts";

const root = fileURLToPath(new URL(".", import.meta.url));

// Mirror the `@/*` -> `src/*` paths of tsconfig.json so tests can import application
// modules that use it (TASK-005: `src/proxy.ts` imports `@/lib/logger`).
// `next/font/local` is a compile-time call, not a runtime function: Next's plugin rewrites it
// during the build and importing it in plain Node throws. Every unit test that renders a document
// layout imports `src/modules/ui` (for `fontVariables`) and would fail on that, so the loader is
// aliased to a shape-compatible stub (spec 004 AC-4, TASK-045). What the stub cannot assert —
// subsetting, `swap`, the preload links — is asserted in `tests/unit/fonts.test.ts` and
// `tests/e2e/fonts.spec.ts`, where it is observable.
const alias = {
  "@/": `${fileURLToPath(new URL("./src", import.meta.url))}/`,
  "next/font/local": fileURLToPath(
    new URL("./tests/unit/support/next-font-local.ts", import.meta.url),
  ),
};

export default defineConfig({
  resolve: { alias },
  test: {
    // Two suites, two commands (spec 001 §2 "Testing harness", AC-16): `pnpm test` runs `unit`,
    // `pnpm test:integration` runs `integration`. The integration project needs `DATABASE_URL`
    // (a Postgres service container in CI) and holds no live tests until spec 002.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // `.tsx` too: TASK-006 renders the placeholder shell with `react-dom/server` (AC-15).
          include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
          // MSW with `onUnhandledRequest: "error"`: no unit test may reach the network (AC-18).
          setupFiles: ["tests/msw/setup.ts"],
        },
      },
      {
        // `contract` (spec 001 §2 "Testing harness", the `test:contract` script and CI job):
        // adapter-against-recorded-fixture tests for boundaries we do not own. Empty in 001 —
        // there is no adapter yet and a fabricated fixture would pin a shape nobody observed —
        // so the script passes with no test files (`tests/contract/README.md` names the owners).
        extends: true,
        test: {
          name: "contract",
          environment: "node",
          include: ["tests/contract/**/*.test.ts"],
          // MSW as in `unit`: a contract test asserts against a fixture, never the network.
          setupFiles: ["tests/msw/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // No MSW here: integration tests talk to a real Postgres from spec 002 onwards.
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        // Empty public barrels (spec 001 §2) and the two files that run *inside* the tool
        // chain rather than under it: the coverage-threshold loader is evaluated by this
        // config before instrumentation exists, so it can never report as covered.
        "src/modules/*/index.ts",
        "scripts/coverage-thresholds.ts",
      ],
      // plan/12 §4 raises these per module in specs 005/007; empty in 001.
      thresholds: loadCoverageThresholds(root),
    },
  },
});
