/**
 * `node scripts/seo/generate-hreflang-fixtures.ts [--write]` (spec 003 §6 "hreflang set", AC-14 /
 * T-14; TASK-039).
 *
 * Writes `tests/fixtures/seo/hreflang/*.json` from `alternatesFor()`, so the fixtures spec 001's
 * `validate-hreflang` CLI checks in CI are the **real output of the generator** rather than
 * hand-written JSON that could agree with nothing. Two consequences on purpose:
 *
 *  - `pnpm seo:validate` now validates live data. Break reciprocity, drop `x-default` or emit an
 *    hreflang value Google ignores and the `seo-validate` job goes red.
 *  - `tests/unit/i18n-alternates.test.ts` regenerates in memory and asserts the committed bytes
 *    match, so a change in the locale set or in the review gate cannot land without the fixtures
 *    moving with it.
 *
 * The base URL is the production origin as a **fixture constant**, not `NEXT_PUBLIC_SITE_URL`:
 * committed fixtures must not depend on whose shell ran the script.
 *
 * Add a case by adding a row to `CASES`. Two are enough today: the locale home (the whole Phase 0
 * page graph) and a destination page, whose path segment is localised per locale
 * (`send-flowers-to` / `blumen-verschicken` / `wyslij-kwiaty`), which is the property a single
 * hand-written fixture is most likely to get wrong.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AlternatesTarget,
  alternatesFor,
} from "../../src/modules/i18n/alternates.ts";

/** The production origin; a constant so the committed fixtures are environment-independent. */
export const FIXTURE_BASE_URL = "https://flowersoverseas.com";

export const FIXTURE_DIR = "tests/fixtures/seo/hreflang";

interface Case {
  readonly file: string;
  readonly target: AlternatesTarget;
}

const CASES: readonly Case[] = [
  { file: "locale-homes.json", target: { pageType: "home" } },
  {
    file: "destinations-country.json",
    target: { pageType: "destinations", segments: ["poland"] },
  },
];

export interface GeneratedFixture {
  readonly file: string;
  readonly contents: string;
}

/** Two-space indent and one trailing newline: what Prettier prints for a JSON file. */
export function generateHreflangFixtures(): readonly GeneratedFixture[] {
  return CASES.map(({ file, target }) => ({
    file,
    contents: `${JSON.stringify(
      { pages: alternatesFor(target, { baseUrl: FIXTURE_BASE_URL }) },
      null,
      2,
    )}\n`,
  }));
}

export function main(argv: readonly string[]): number {
  const root = resolve(fileURLToPath(import.meta.url), "../../..");
  const fixtures = generateHreflangFixtures();
  const write = argv.includes("--write");
  for (const { file, contents } of fixtures) {
    const path = join(root, FIXTURE_DIR, file);
    if (write) writeFileSync(path, contents, "utf8");
    process.stdout.write(
      `${write ? "wrote" : "would write"} ${FIXTURE_DIR}/${file}\n`,
    );
  }
  return 0;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) process.exit(main(process.argv.slice(2)));
