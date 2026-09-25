/**
 * Every single-branch deletion of a regular expression, for proving that a forbidden-claim
 * pattern's samples exercise **each** alternative rather than one of them (TASK-143).
 *
 * The claim scans (`tests/support/listing-honesty.ts`, `tests/unit/home-honesty.test.ts`) are
 * absence assertions: every page-level call reads "no match". A scan whose German branch had been
 * deleted still matches its English sample, so a positive control of one sample per *pattern*
 * cannot see the deletion — PR 93's "a term deletable with the whole suite green", fail-open. A
 * control that can see it has to kill every mutant this module generates: for each `|`-separated
 * branch, at the top level or inside any group, the same pattern with that one branch removed.
 */

/** One mutant: the pattern with one branch deleted, and the branch, for the failure message. */
export interface BranchDeletion {
  readonly branch: string;
  readonly mutant: RegExp;
}

interface Group {
  /** Index in the source where the group's first branch starts (after `(`, `(?:`, `(?<n>`…). */
  readonly start: number;
  /** Index of every `|` that separates this group's branches. */
  readonly bars: number[];
}

/** Length of the group-opening prefix at `index`, which holds a `(`: `(`, `(?:`, `(?<name>`… */
function openerLength(source: string, index: number): number {
  if (source.charAt(index + 1) !== "?") return 1;
  const rest = source.slice(index + 2);
  if (rest.startsWith("<=") || rest.startsWith("<!")) return 4;
  if (rest.startsWith("<")) return 2 + rest.indexOf(">") + 1;
  return 3; // `(?:`, `(?=`, `(?!`
}

/** The branch spans `[from, to)` of every alternation in `source` with at least two branches. */
function alternations(source: string): (readonly [number, number])[][] {
  const found: (readonly [number, number])[][] = [];
  const close = (group: Group, end: number): void => {
    if (group.bars.length === 0) return;
    const edges = [group.start, ...group.bars.map((bar) => bar + 1)];
    found.push(
      edges.map((from, index) => [from, group.bars[index] ?? end] as const),
    );
  };
  const stack: Group[] = [{ start: 0, bars: [] }];
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
    } else if (char === "(") {
      const length = openerLength(source, index);
      stack.push({ start: index + length, bars: [] });
      index += length - 1;
    } else if (char === ")") {
      const group = stack.pop();
      if (group !== undefined) close(group, index);
    } else if (char === "|") {
      stack.at(-1)?.bars.push(index);
    }
  }
  const top = stack.pop();
  if (top !== undefined) close(top, source.length);
  return found;
}

/**
 * The pattern once per branch, with that branch and one adjacent `|` removed. A pattern with no
 * alternation yields none: its one sample already proves it fires.
 */
export function branchDeletions(pattern: RegExp): readonly BranchDeletion[] {
  const { source, flags } = pattern;
  return alternations(source).flatMap((branches) =>
    branches.map(([from, to], index) => {
      // Take the `|` after the first branch, and the `|` before every other one.
      const [cutFrom, cutTo] = index === 0 ? [from, to + 1] : [from - 1, to];
      return {
        branch: source.slice(from, to),
        mutant: new RegExp(
          source.slice(0, cutFrom) + source.slice(cutTo),
          flags,
        ),
      };
    }),
  );
}
