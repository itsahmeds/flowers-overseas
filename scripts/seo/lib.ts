/**
 * Shared plumbing for the three SEO validator CLIs (spec 001 §2 "CI", §6, AC-22 / T-23,
 * TASK-009).
 *
 * Every validator has the same contract:
 *
 * - it reads a fixture directory (`tests/fixtures/seo/<kind>/` by default, `--dir <path>` to
 *   point it somewhere else — the unit tests use a temp directory so a failure path never
 *   mutates the committed tree);
 * - an absent directory, or one with no fixture of its extension, prints `no fixtures` and
 *   exits 0 (that is the committed state in spec 001: the directories hold only a `.gitkeep`);
 * - any problem is printed to stderr naming the offending file and the reason, and the process
 *   exits 1.
 *
 * Spec 007 drops real fixtures into the same directories; nothing here changes when it does.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ZodError } from "zod";

/** Printed (and asserted by the tests) when a fixture directory holds nothing to check. */
export const NO_FIXTURES = "no fixtures";

export interface FixtureProblem {
  /** Repo-relative path of the fixture that failed, so the CI log names the file. */
  readonly file: string;
  readonly reason: string;
}

export interface ValidatorSpec {
  /** CLI name, used as the prefix of every line of output (e.g. `validate-sitemap`). */
  readonly name: string;
  /** Fixture directory used when `--dir` is absent, relative to the repo root. */
  readonly defaultDir: string;
  /** Lower-case file extension, with the dot. */
  readonly extension: string;
  /** Problems found in one fixture file; empty when the fixture is valid. */
  readonly validateFile: (
    path: string,
    displayPath: string,
  ) => readonly FixtureProblem[];
}

/** The `--dir <path>` argument, or `fallback`. Relative paths resolve against the cwd. */
export function dirArg(
  argv: readonly string[],
  fallback: string,
): { readonly dir: string; readonly explicit: boolean } {
  const index = argv.indexOf("--dir");
  const value = index === -1 ? undefined : argv[index + 1];
  return value === undefined || value === ""
    ? { dir: resolve(process.cwd(), fallback), explicit: false }
    : { dir: resolve(process.cwd(), value), explicit: true };
}

/**
 * Fixture files of `extension` directly inside `dir`, sorted by name. A missing directory yields
 * `[]` rather than throwing: "no fixture directory" and "no fixtures in it" are the same
 * non-event in spec 001, and spec 007 creating the directory must not need a code change.
 */
export function listFixtures(dir: string, extension: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension),
    )
    .map((entry) => entry.name)
    .sort()
    .map((name) => resolve(dir, name));
}

/** Path as written in the output: repo-relative when inside the repo, absolute otherwise. */
export function displayPath(
  path: string,
  root: string = process.cwd(),
): string {
  const rel = relative(root, path);
  return rel === "" || rel.startsWith("..") ? path : rel;
}

export function formatProblems(
  name: string,
  problems: readonly FixtureProblem[],
): string {
  const lines = [
    `${name} failed with ${String(problems.length)} problem(s):`,
    ...problems.map((problem) => `  - ${problem.file}: ${problem.reason}`),
  ];
  return lines.join("\n");
}

/**
 * A zod issue list as one reason string. Zod is the fixture-shape gate for every validator
 * (`CLAUDE.md`: "Zod at every boundary" — a fixture read off disk is a boundary), and its
 * messages already name the failing path.
 */
export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map((part) => String(part)).join(".");
      return path === "" ? issue.message : `${path}: ${issue.message}`;
    })
    .join("; ");
}

/**
 * Runs `spec` over its fixture directory and returns the process exit code, writing the report to
 * stdout (success) or stderr (failure). Kept separate from the `process.exit` call so the unit
 * tests can drive it in-process as well as through `execFileSync`.
 */
export function runValidator(
  spec: ValidatorSpec,
  argv: readonly string[],
  out: { write: (chunk: string) => unknown } = process.stdout,
  err: { write: (chunk: string) => unknown } = process.stderr,
): number {
  const { dir } = dirArg(argv, spec.defaultDir);
  const files = listFixtures(dir, spec.extension);
  if (files.length === 0) {
    out.write(`${spec.name}: ${NO_FIXTURES} in ${displayPath(dir)}\n`);
    return 0;
  }
  const problems: FixtureProblem[] = [];
  for (const file of files) {
    problems.push(...spec.validateFile(file, displayPath(file)));
  }
  if (problems.length > 0) {
    err.write(`${formatProblems(spec.name, problems)}\n`);
    return 1;
  }
  out.write(
    `${spec.name}: ${String(files.length)} fixture(s) ok in ${displayPath(dir)}\n`,
  );
  return 0;
}

/**
 * `true` when this module's importer was started directly by Node (`node scripts/seo/x.ts`),
 * so importing a validator from a test never runs its CLI body.
 */
export function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (typeof entry !== "string") return false;
  return resolve(entry) === fileURLToPath(moduleUrl);
}

/**
 * A price as an exact decimal string with two fraction digits, or `null` when the input is not a
 * plain non-negative decimal.
 *
 * Deliberately string arithmetic: money never becomes a `number` in this repo (`plan/12` §2,
 * `fo/no-float-money`), and `Number("0.1") + Number("0.2")` is the reason. Grouped thousands
 * separators are rejected rather than guessed — `1,234` is one thousand in `en` and one point two
 * three four in `de`, and a fixture that needs to be compared to the cent must be unambiguous.
 */
export function normaliseMoney(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(trimmed);
  if (match === null) return null;
  const whole = match[1] ?? "";
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return `${whole}.${fraction}`;
}

/** Exits with the code `runValidator` returned. Called only from a validator's CLI body. */
export function exitWith(code: number): void {
  if (code !== 0) process.exit(code);
}
