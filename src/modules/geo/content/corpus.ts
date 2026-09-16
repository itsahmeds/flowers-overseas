/**
 * The corridor corpus as the application reads it: a **generated typed index**, never the
 * filesystem (spec 007 §2 "The content model"; `/review 63` carry-forward (b); TASK-091).
 *
 * Spec 007 §2 specifies the static provider as reading "the committed files at build time (no
 * runtime fetch, no `fs` in the bundle: the files are imported through a generated typed index)".
 * TASK-087 shipped the reader first, because nothing rendered a corridor yet; this route is the
 * moment the difference becomes real — a page that imported `node:fs` transitively would ship it
 * in the server bundle, foreclose the edge runtime, and make the corpus a *runtime* dependency on
 * a working directory that a container image need not contain.
 *
 * So the corpus is committed twice, on purpose, and the duplication is gated rather than trusted:
 *
 *  - `content/corridors/**` stays the authored source — markdown a human edits and diffs, the
 *    only thing `pnpm corridor:check` reads;
 *  - `corpus.generated.ts` is its mechanical projection, written by `pnpm corridor:index` and
 *    asserted byte-identical to a fresh projection by `tests/unit/corridor-corpus-index.test.ts`,
 *    so an edit to a guide that skips the generator fails `pnpm test` rather than shipping a page
 *    nobody wrote.
 *
 * Everything downstream — the parser, the provider, the view model, the page — is a pure function
 * of the value returned here, exactly as it was of the reader it replaces.
 */
import { CORRIDOR_CORPUS_FILES } from "./corpus.generated.ts";

/** One file as committed: its path relative to `content/corridors/`, and its bytes as text. */
export interface CorridorSourceFile {
  /** `en/pl-guide.md` — relative to `content/corridors/`, POSIX-separated. */
  readonly path: string;
  readonly source: string;
}

/**
 * Every corridor markdown file, in path order — the same value `readCorridorCorpus()` returns
 * from disk, and the only one the render path may read.
 *
 * A locale with no files is simply absent: "this locale has no corridor page" is the honest
 * Phase 0 answer for `de` and `pl` (`plan/02` §12, spec 007 §13 Q1), not a fault.
 */
export function corridorCorpus(): readonly CorridorSourceFile[] {
  return CORRIDOR_CORPUS_FILES;
}
