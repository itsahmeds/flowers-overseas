/**
 * The info-content provider seam (spec 041 §2, §5.1; TASK-182).
 *
 * `staticInfoContentProvider` reads the committed files through the generated typed index, so the
 * render path has no `node:fs`. Spec 012's admin replaces it with a database provider behind the
 * same interface, with no call-site change. Tests hand in a fixture provider.
 */
import { INFO_CONTENT_FILES } from "./corpus.generated.ts";
import type { InfoSourceFile } from "./parse.ts";

export interface InfoContentProvider {
  /** Every content file, in path order. */
  files(): readonly InfoSourceFile[];
}

export const staticInfoContentProvider: InfoContentProvider = {
  files: () => INFO_CONTENT_FILES,
};

/** A provider over a literal set of files: what the tests and the gate's fixtures use. */
export function fixtureInfoContentProvider(
  files: readonly InfoSourceFile[],
): InfoContentProvider {
  return { files: () => files };
}
