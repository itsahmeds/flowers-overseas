/**
 * The committed corridor corpus as raw files (spec 007 §2 "The content model", AC-1; TASK-087).
 *
 * The one place that touches the filesystem. Everything else in `src/modules/geo/content/` is a
 * pure function of the value this module returns, which is what makes the gate, the provider and
 * every test drivable from a literal — `pnpm corridor:check` never reads a file twice and a unit
 * test needs no temp directory.
 *
 * No database, no network, no clock and no environment (`pnpm check:no-db` covers this directory):
 * the corpus is committed markdown, read once at module load, and it stays readable for as long as
 * spec 002's provisioning is parked — and afterwards, because `dbCountryContentProvider` is a
 * second implementation of the interface in `provider.ts`, not a replacement for this file.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CORRIDOR_CONTENT_DIR } from "./parse.ts";

/** One file as committed: its path relative to `content/corridors/`, and its bytes as text. */
export interface CorridorSourceFile {
  /** `en/pl-guide.md` — relative to `content/corridors/`, POSIX-separated. */
  readonly path: string;
  readonly source: string;
}

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
