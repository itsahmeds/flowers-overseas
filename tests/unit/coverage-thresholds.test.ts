/**
 * AC-16 (TASK-008): `vitest.coverage.json` is the data behind the coverage gate, and
 * `scripts/coverage-thresholds.ts` is the loader `vitest.config.ts` reads it with. A malformed
 * file must break the test run loudly rather than silently disable the gate that plan/12 §4
 * raises in specs 005 and 007.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COVERAGE_THRESHOLDS_FILE,
  loadCoverageThresholds,
  parseCoverageThresholds,
  toVitestThresholds,
} from "../../scripts/coverage-thresholds.ts";

const root = process.cwd();

describe("vitest.coverage.json", () => {
  it("parses", () => {
    const file = parseCoverageThresholds(
      readFileSync(resolve(root, COVERAGE_THRESHOLDS_FILE), "utf8"),
    );

    expect(Object.keys(file)).toEqual(
      expect.arrayContaining(["global", "perGlob"]),
    );
  });

  it("declares no threshold in spec 001, so nothing is gated yet", () => {
    expect(loadCoverageThresholds(root)).toEqual({});
  });
});

describe("loadCoverageThresholds", () => {
  it("flattens global keys and glob groups into Vitest's thresholds shape", () => {
    const thresholds = toVitestThresholds(
      parseCoverageThresholds(
        JSON.stringify({
          global: { lines: 80, perFile: true },
          perGlob: { "src/modules/orders/**": { branches: 100 } },
        }),
      ),
    );

    expect(thresholds).toEqual({
      lines: 80,
      perFile: true,
      "src/modules/orders/**": { branches: 100 },
    });
  });

  it("rejects an unknown threshold key", () => {
    expect(() =>
      parseCoverageThresholds(JSON.stringify({ global: { linez: 80 } })),
    ).toThrow();
  });

  it("rejects a threshold outside 0-100", () => {
    expect(() =>
      parseCoverageThresholds(JSON.stringify({ global: { lines: 101 } })),
    ).toThrow();
  });

  it("rejects a non-object file", () => {
    expect(() => parseCoverageThresholds("[]")).toThrow();
  });
});
