/**
 * T-17 / AC-16 (TASK-008): the unit suite covers each area spec 001 names, and the integration
 * suite is present. Spec 002 AC-28 / T-28 (TASK-027) replaced the skipped spec-002 placeholder:
 * no `.skip` remains in `tests/integration/`, and in CI a suite fails rather than skips.
 *
 * AC-16 reads: "`pnpm test` runs Vitest and exits 0 with >= 1 unit test per custom lint rule, per
 * validator, for the logger, for `env.ts`, and for `beforeSend`". The list below is the
 * checklist; a spec that adds a rule or a validator adds its row here.
 *
 * The remaining halves of AC-16 are asserted elsewhere: `pnpm test:integration` exit code is the
 * CI job `test-integration`, and the Postgres service container health is that job's first step.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const UNIT_DIR = join(process.cwd(), "tests/unit");

/** Area of AC-16 -> the file name pattern that must cover it. */
const AREAS: ReadonlyArray<readonly [area: string, pattern: RegExp]> = [
  ["fo/no-physical-css", /^no-physical-css\.test\.tsx?$/],
  ["fo/no-literal-strings", /^no-literal-strings\.test\.tsx?$/],
  [
    "fo/no-direct-order-status-write",
    /^no-direct-order-status-write\.test\.ts$/,
  ],
  ["fo/no-geo-redirect", /^no-geo-redirect\.test\.ts$/],
  ["fo/no-float-money", /^no-float-money\.test\.ts$/],
  ["logger", /^logger\.test\.ts$/],
  ["env.ts", /^env\.test\.ts$/],
  ["beforeSend", /^sentry-before-send\.test\.ts$/],
  // The three SEO validators (TASK-009, spec 001 AC-22 / T-23).
  ["validate-sitemap", /^seo-validate-sitemap\.test\.ts$/],
  ["validate-hreflang", /^seo-validate-hreflang\.test\.ts$/],
  ["validate-schema", /^seo-validate-schema\.test\.ts$/],
  // Not an AC-16 area: the dev-OS checks (AC-24…AC-26 / T-25…T-27, TASK-010) are shell scripts
  // in `tests/dev-os/`, and `dev-os.test.ts` is the wrapper that runs them inside `pnpm test`.
  // Listed here so removing the wrapper — which would drop the guard, `task.sh` and the Stop
  // hook out of the unit suite and out of the `test-unit` CI job — fails this test.
  ["dev-os checks (tests/dev-os)", /^dev-os\.test\.ts$/],
];

const TEST_CASE = /\b(?:it|test)(?:\.\w+)*\s*\(/;

function unitTestFiles(): readonly string[] {
  return readdirSync(UNIT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.test\.tsx?$/.test(entry.name))
    .map((entry) => entry.name);
}

describe("unit suite coverage of AC-16 areas", () => {
  const files = unitTestFiles();

  it("finds the unit directory non-empty", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(AREAS)("has at least one test file for %s", (_area, pattern) => {
    const matches = files.filter((name) => pattern.test(name));
    expect(matches).not.toHaveLength(0);
    for (const name of matches) {
      expect(readFileSync(join(UNIT_DIR, name), "utf8")).toMatch(TEST_CASE);
    }
  });
});

describe("integration suite (spec 001 AC-16, spec 002 AC-28 / T-28)", () => {
  const INTEGRATION_DIR = join(process.cwd(), "tests/integration");
  const suites = readdirSync(INTEGRATION_DIR).filter((name) =>
    name.endsWith(".test.ts"),
  );

  it("is present: the integration project has suites with test cases", () => {
    expect(suites.length).toBeGreaterThan(0);
    for (const name of suites) {
      expect(readFileSync(join(INTEGRATION_DIR, name), "utf8")).toMatch(
        TEST_CASE,
      );
    }
  });

  it("has no describe.skip, it.skip or test.skip left anywhere (the spec 001 TODO is paid)", () => {
    const offenders = suites.filter((name) =>
      /\b(?:describe|it|test)\.skip\s*\(/.test(
        readFileSync(join(INTEGRATION_DIR, name), "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
    expect(suites).not.toContain("db.test.ts");
  });

  it("fails rather than skips in CI when no Postgres answers", async () => {
    const { probeLocalServer } =
      await import("../integration/support/scratch-db.ts");
    await expect(probeLocalServer({ CI: "true" })).rejects.toThrow(
      /needs the Postgres service in CI: no DATABASE_URL/,
    );
    await expect(probeLocalServer({})).resolves.toEqual({
      reason: "no DATABASE_URL",
    });
  });
});
