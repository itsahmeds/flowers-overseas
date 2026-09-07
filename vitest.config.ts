import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { loadCoverageThresholds } from "./scripts/coverage-thresholds.ts";

const root = fileURLToPath(new URL(".", import.meta.url));

// Mirror the `@/*` -> `src/*` paths of tsconfig.json so tests can import application
// modules that use it (TASK-005: `src/middleware.ts` imports `@/lib/logger`).
const alias = { "@/": `${fileURLToPath(new URL("./src", import.meta.url))}/` };

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
