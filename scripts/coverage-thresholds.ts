/**
 * Coverage-threshold loader for `vitest.coverage.json` (spec 001 §2 "Testing harness", AC-16,
 * TASK-008).
 *
 * The thresholds live in data, not in `vitest.config.ts`, because plan/12 §4 raises them per
 * module as specs land (005 and 007 add the 100 %-branch modules). In 001 both maps are empty:
 * coverage is collected and reported, nothing is gated yet.
 *
 * File shape:
 *   {
 *     "global": { "lines": 80, ... },            // Vitest global threshold keys
 *     "perGlob": { "src/modules/orders/**": { "branches": 100 } }
 *   }
 *
 * `perGlob` entries are passed through to Vitest's glob-keyed thresholds, which turn each glob
 * into its own threshold group (`thresholds` in the coverage config).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";

const Thresholds = z
  .object({
    lines: z.number().min(0).max(100).optional(),
    functions: z.number().min(0).max(100).optional(),
    branches: z.number().min(0).max(100).optional(),
    statements: z.number().min(0).max(100).optional(),
    perFile: z.boolean().optional(),
  })
  .strict();

export const CoverageThresholdsFile = z
  .object({
    global: Thresholds.default({}),
    perGlob: z.record(z.string().min(1), Thresholds).default({}),
  })
  .strict();
export type CoverageThresholdsFile = z.infer<typeof CoverageThresholdsFile>;

export const COVERAGE_THRESHOLDS_FILE = "vitest.coverage.json";

/** Vitest's `coverage.thresholds` object: global keys at the top level, globs beside them. */
export type VitestThresholds = Record<
  string,
  number | boolean | undefined | Record<string, number | boolean | undefined>
>;

export function toVitestThresholds(
  file: CoverageThresholdsFile,
): VitestThresholds {
  return { ...file.global, ...file.perGlob };
}

export function parseCoverageThresholds(
  contents: string,
): CoverageThresholdsFile {
  return CoverageThresholdsFile.parse(JSON.parse(contents));
}

/** Read and validate the file; throws (failing the Vitest run) when it is malformed. */
export function loadCoverageThresholds(root: string): VitestThresholds {
  const path = resolve(root, COVERAGE_THRESHOLDS_FILE);
  return toVitestThresholds(
    parseCoverageThresholds(readFileSync(path, "utf8")),
  );
}
