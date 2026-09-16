/**
 * `pnpm corridor:index` — regenerate the typed corridor-corpus index (spec 007 §2 "The content
 * model"; `/review 63` carry-forward (b); TASK-091).
 *
 * ```
 * pnpm corridor:index            # write src/modules/geo/content/corpus.generated.ts
 * pnpm corridor:index --check    # exit 1 when the committed index is stale, printing the diff size
 * ```
 *
 * The generator is deliberately the dullest thing in the repository: it reads the authored
 * markdown with `node:fs` (which is allowed here — this is a script, not a page), serialises each
 * file with `JSON.stringify` so no escaping decision is made by hand, and writes one module whose
 * only export is the array. Nothing is parsed, nothing is validated and nothing is reordered:
 * every rule about the *content* belongs to `pnpm corridor:check`, and a generator that also
 * judged would be a second place a guide could be rejected.
 *
 * `--check` is what a reviewer and `tests/unit/corridor-corpus-index.test.ts` run; the committed
 * file must equal the bytes this script would write, so a guide edited without regenerating the
 * index fails the unit suite rather than silently serving the previous text.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  readCorridorCorpus,
  repoRootFromModule,
} from "../src/modules/geo/content/corpus-files.ts";

const CLI_NAME = "corridor:index";

/** The generated module's path, relative to the repository root. */
export const CORRIDOR_INDEX_PATH =
  "src/modules/geo/content/corpus.generated.ts";

const HEADER = `/**
 * The corridor corpus as a typed module — **generated**, do not edit (spec 007 §2; TASK-091).
 *
 * Written by \`pnpm corridor:index\` from \`content/corridors/**\`, which is the authored source.
 * It exists so the render path can read the corpus with no \`node:fs\` in the bundle; the
 * regeneration is pinned by \`tests/unit/corridor-corpus-index.test.ts\`, so this file cannot
 * drift from the markdown behind it.
 */
import type { CorridorSourceFile } from "./corpus.ts";

export const CORRIDOR_CORPUS_FILES: readonly CorridorSourceFile[] = [
`;

/** The exact bytes the generated module should contain for the corpus under `root`. */
export function corridorIndexSource(
  root: string = repoRootFromModule(),
): string {
  const files = readCorridorCorpus(root);
  const entries = files
    .map(
      (file) =>
        `  {\n    path: ${JSON.stringify(file.path)},\n    source: ${JSON.stringify(file.source)},\n  },\n`,
    )
    .join("");
  return `${HEADER}${entries}];\n`;
}

function main(): number {
  const root = repoRootFromModule();
  const expected = corridorIndexSource(root);
  const target = `${root}/${CORRIDOR_INDEX_PATH}`;
  const check = process.argv.includes("--check");

  let current: string | undefined;
  try {
    current = readFileSync(target, "utf8");
  } catch {
    current = undefined;
  }

  if (current === expected) {
    process.stdout.write(
      `${CLI_NAME}: ${CORRIDOR_INDEX_PATH} is current (${String(expected.length)} bytes).\n`,
    );
    return 0;
  }

  if (check) {
    process.stderr.write(
      `${CLI_NAME}: ${CORRIDOR_INDEX_PATH} is stale — run \`pnpm corridor:index\` and commit the result.\n`,
    );
    return 1;
  }

  writeFileSync(target, expected, "utf8");
  process.stdout.write(
    `${CLI_NAME}: wrote ${CORRIDOR_INDEX_PATH} (${String(expected.length)} bytes).\n`,
  );
  return 0;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = main();
}
