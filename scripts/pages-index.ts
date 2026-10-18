/**
 * `pnpm pages:index` — regenerate the typed info-page content index (spec 041 §2, §5.2; TASK-182).
 *
 * ```
 * pnpm pages:index            # write src/modules/content/corpus.generated.ts
 * pnpm pages:index --check    # exit 1 when the committed index is stale
 * ```
 *
 * The `corridor:index` precedent: read the authored markdown with `node:fs`, serialise each file
 * with `JSON.stringify`, write one module whose only export is the array. Nothing is parsed or
 * judged here; every rule about the content is `pnpm pages:check`'s.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  readInfoContent,
  repoRootFromContentModule,
} from "../src/modules/content/corpus-files.ts";

const CLI_NAME = "pages:index";

export const PAGES_INDEX_PATH = "src/modules/content/corpus.generated.ts";

const HEADER = `/**
 * The info-page content as a typed module — **generated**, do not edit (spec 041 §2; TASK-182).
 *
 * Written by \`pnpm pages:index\` from \`content/pages/**\` and \`content/legal/**\`, the authored
 * source, so the render path reads the content with no \`node:fs\` in the bundle. Pinned by
 * \`tests/unit/info-pages.test.ts\`, so this file cannot drift from the markdown behind it.
 */
import type { InfoSourceFile } from "./parse.ts";

export const INFO_CONTENT_FILES: readonly InfoSourceFile[] = [
`;

/** The exact bytes the generated module should contain for the content under `root`. */
export function pagesIndexSource(
  root: string = repoRootFromContentModule(),
): string {
  const entries = readInfoContent(root)
    .map(
      (file) =>
        `  {\n    path: ${JSON.stringify(file.path)},\n    source: ${JSON.stringify(file.source)},\n  },\n`,
    )
    .join("");
  return `${HEADER}${entries}];\n`;
}

function main(): number {
  const root = repoRootFromContentModule();
  const expected = pagesIndexSource(root);
  const target = `${root}/${PAGES_INDEX_PATH}`;
  let current: string | undefined;
  try {
    current = readFileSync(target, "utf8");
  } catch {
    current = undefined;
  }
  if (current === expected) {
    process.stdout.write(`${CLI_NAME}: ${PAGES_INDEX_PATH} is current.\n`);
    return 0;
  }
  if (process.argv.includes("--check")) {
    process.stderr.write(
      `${CLI_NAME}: ${PAGES_INDEX_PATH} is stale — run \`pnpm pages:index\` and commit the result.\n`,
    );
    return 1;
  }
  writeFileSync(target, expected, "utf8");
  process.stdout.write(`${CLI_NAME}: wrote ${PAGES_INDEX_PATH}.\n`);
  return 0;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = main();
}
