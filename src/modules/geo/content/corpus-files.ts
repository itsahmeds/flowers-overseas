/**
 * The committed corridor corpus, read from disk (spec 007 §2 "The content model", AC-1;
 * TASK-087, split by TASK-091).
 *
 * **Node-only, and off the render path.** This module is the one place that touches the
 * filesystem, and since TASK-091 it is imported by exactly two callers — `pnpm corridor:check`
 * and `pnpm corridor:index` — neither of which is a page. The application reads the corpus
 * through the generated typed index (`corpus.generated.ts`, re-exported by `corpus.ts`), which is
 * what spec 007 §2 asks for: "no `fs` in the bundle: the files are imported through a generated
 * typed index". Importing this file from anything under `src/app/**` would put `node:fs` back in
 * the server bundle and foreclose the edge runtime; `tests/unit/corridor-corpus-index.test.ts`
 * pins both halves (the index is current, and nothing on the render path reads `node:fs`).
 *
 * No database, no network, no clock and no environment (`pnpm check:no-db` covers this directory).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CorridorSourceFile } from "./corpus.ts";
import { CORRIDOR_CONTENT_DIR } from "./parse.ts";

/** The repository root, resolved from this module rather than from the process's cwd. */
export function repoRootFromModule(): string {
  return resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
}

/**
 * Every corridor markdown file under `root/content/corridors/`, sorted by path so a corpus-wide
 * rule (uniqueness, reciprocity) reports in a stable order.
 *
 * A locale directory with no files, and a missing `content/corridors/` altogether, are both an
 * empty corpus rather than an error: "this locale has no corridor page" is the honest Phase 0
 * answer for `de` and `pl` (`plan/02` §12, spec 007 §13 Q1), not a fault.
 */
export function readCorridorCorpus(
  root: string = repoRootFromModule(),
): readonly CorridorSourceFile[] {
  const base = join(root, CORRIDOR_CONTENT_DIR);
  if (statSync(base, { throwIfNoEntry: false })?.isDirectory() !== true) {
    return [];
  }
  const files: CorridorSourceFile[] = [];
  for (const locale of readdirSync(base, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue;
    for (const entry of readdirSync(join(base, locale.name), {
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const path = `${locale.name}/${entry.name}`;
      files.push({
        path,
        source: readFileSync(join(base, path), "utf8"),
      });
    }
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}
