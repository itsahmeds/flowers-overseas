/**
 * `pnpm gates:cheap` — every cheap gate of `CLAUDE.md` DoD §2, one pasteable proof block (spec 001 AC-43).
 *
 * Runs the six cheap gates the kernel names (`CHEAP_GATES`), one after another and never in
 * parallel, then the unit and contract tests related to the diff against `--base <ref>` (default
 * `origin/main`): the files Vitest's `--changed` finds **plus** the files `PATH_TESTS` names for
 * the changed paths. `--changed` follows the import graph, so a diff that touches only text some
 * test reads (`CLAUDE.md`, `.claude/**`, `.github/workflows/**`) would otherwise run no test at all.
 * Every gate runs even after one fails; every exit code is read; the process exits non-zero when
 * any gate did. It starts no server and takes no build slot.
 *
 * The block it ends with is what an agent pastes into its report. It names the HEAD SHA and
 * whether the tree was clean, one line per gate with its exit code and duration, what
 * `format:check` actually covers (read from `.prettierignore`, so nobody quotes it for a file it
 * skipped: §13 Q13, W-19), and `RESULT: PASS` or `RESULT: FAIL (<n> of 7 red: <names>)`.
 *
 * The gate list cannot drift from the kernel: `cheapGateNamesFromClaude` reads the one DoD §2
 * sentence that begins "Implementers run the **cheap** gates locally", and
 * `tests/unit/framework-text.test.ts` fails when its backticked names differ from `CHEAP_GATES`.
 *
 * Usage: `pnpm gates:cheap [--base <ref>]`
 */
import { spawnSync, type StdioOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** One cheap gate: the name the kernel uses and the command that runs it. */
export interface Gate {
  readonly name: string;
  readonly command: readonly [string, ...string[]];
}

/** `CLAUDE.md` DoD §2's cheap gates, in the kernel's order. The drift test pins the names. */
export const CHEAP_GATES: readonly Gate[] = [
  { name: "typecheck", command: ["pnpm", "typecheck"] },
  { name: "lint", command: ["pnpm", "lint"] },
  { name: "format:check", command: ["pnpm", "format:check"] },
  { name: "i18n:check", command: ["pnpm", "i18n:check"] },
  { name: "check:no-db", command: ["pnpm", "check:no-db"] },
  {
    name: "codebase:map --check",
    command: ["pnpm", "codebase:map", "--check"],
  },
];

/** The name of the seventh gate, the related unit and contract tests. */
export const TEST_GATE = "tests";

export const DEFAULT_BASE = "origin/main";

/**
 * Paths no test imports but some test reads as text → the tests that read them. An entry ending
 * in `/` is a directory prefix; any other entry is one exact path. A test A19 adds that reads one
 * of these paths joins the map in the PR that adds it (spec 001 AC-43). A named test file that
 * does not exist turns the test gate red.
 */
export interface PathTestEntry {
  readonly paths: readonly string[];
  readonly tests: readonly string[];
}

export const PATH_TESTS: readonly PathTestEntry[] = [
  {
    paths: [
      "CLAUDE.md",
      ".claude/",
      "docs/framework/",
      "docs/tasks/_template.md",
    ],
    tests: [
      "tests/unit/framework-text.test.ts",
      "tests/unit/agent-orientation.test.ts",
    ],
  },
  {
    paths: [".claude/hooks/", ".claude/bin/", ".claude/settings.json"],
    tests: ["tests/unit/dev-os.test.ts"],
  },
  {
    paths: [".github/workflows/"],
    tests: ["tests/unit/ci-workflow.test.ts"],
  },
  {
    paths: [".github/workflows/pr-policy.yml"],
    tests: ["tests/unit/pr-policy.test.ts"],
  },
  // T-50 (AC-48, TASK-153): the roles the work order lets commit ↔ the agents' `tools:` lines.
  {
    paths: [".claude/templates/work-order.md", ".claude/agents/"],
    tests: ["tests/unit/work-order-roles.test.ts"],
  },
];

function pathMatches(pattern: string, path: string): boolean {
  return pattern.endsWith("/") ? path.startsWith(pattern) : path === pattern;
}

/** The map's test files for these changed paths, in map order, each once. */
export function mappedTests(
  changedPaths: readonly string[],
  map: readonly PathTestEntry[] = PATH_TESTS,
): string[] {
  const tests: string[] = [];
  for (const entry of map) {
    const hit = changedPaths.some((path) =>
      entry.paths.some((pattern) => pathMatches(pattern, path)),
    );
    if (!hit) continue;
    for (const test of entry.tests) if (!tests.includes(test)) tests.push(test);
  }
  return tests;
}

/** Every test file the map names that is missing under `root`. */
export function missingMapTests(
  root: string,
  map: readonly PathTestEntry[] = PATH_TESTS,
): string[] {
  const missing: string[] = [];
  for (const entry of map) {
    for (const test of entry.tests) {
      if (!existsSync(join(root, test)) && !missing.includes(test))
        missing.push(test);
    }
  }
  return missing;
}

/** How the kernel's cheap-gate sentence begins; the drift test reads that sentence and no other. */
export const CHEAP_SENTENCE_START =
  "Implementers run the **cheap** gates locally";

/**
 * The backticked names in `CLAUDE.md` DoD item 2's cheap-gate sentence: from
 * `CHEAP_SENTENCE_START` to the first full stop outside backticks. `undefined` when the Definition
 * of done has no item 2 or item 2 has no such sentence. The next sentence (the expensive gates)
 * is never read.
 */
export function cheapGateNamesFromClaude(claude: string): string[] | undefined {
  const dodStart = claude.indexOf("## Definition of done");
  if (dodStart === -1) return undefined;
  const afterHeading = claude.indexOf("\n", dodStart);
  const nextHeading = claude.indexOf("\n## ", afterHeading);
  const dod = claude.slice(
    afterHeading,
    nextHeading === -1 ? claude.length : nextHeading,
  );
  const item2 = /^2\. [\s\S]*?(?=^\d+\. |(?![\s\S]))/m.exec(dod)?.[0];
  if (item2 === undefined) return undefined;
  const start = item2.indexOf(CHEAP_SENTENCE_START);
  if (start === -1) return undefined;

  let inTicks = false;
  let end = item2.length;
  for (let i = start; i < item2.length; i += 1) {
    const char = item2[i];
    if (char === "`") inTicks = !inTicks;
    else if (char === "." && !inTicks) {
      end = i;
      break;
    }
  }
  const sentence = item2.slice(start, end);
  return [...sentence.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
}

/** Problems with the gate list against `CLAUDE.md`'s text; empty when they agree. */
export function gateDrift(
  claude: string,
  gates: readonly Gate[] = CHEAP_GATES,
): string[] {
  const names = cheapGateNamesFromClaude(claude);
  if (names === undefined) {
    return [
      `sentence not found: CLAUDE.md "Definition of done" item 2 has no sentence beginning "${CHEAP_SENTENCE_START}"`,
    ];
  }
  const ours = gates.map((gate) => gate.name);
  const problems: string[] = [];
  for (const name of names) {
    if (!ours.includes(name))
      problems.push(`CLAUDE.md names \`${name}\`; gates:cheap does not run it`);
  }
  for (const name of ours) {
    if (!names.includes(name))
      problems.push(
        `gates:cheap runs \`${name}\`; CLAUDE.md's cheap-gate sentence does not name it`,
      );
  }
  return problems;
}

/** `.prettierignore`'s entries (comments and blank lines dropped), in file order. */
export function prettierIgnoreEntries(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export function formatCoverageLine(prettierIgnore: string | undefined): string {
  if (prettierIgnore === undefined)
    return "format:check covers: every path (no .prettierignore)";
  const entries = prettierIgnoreEntries(prettierIgnore);
  return entries.length === 0
    ? "format:check covers: every path (.prettierignore is empty)"
    : `format:check covers: every path except ${entries.join(" ")}`;
}

export interface GateOutcome {
  readonly name: string;
  readonly status: number;
  readonly ms: number;
  /** Extra words for the gate's line, e.g. the test counts. */
  readonly detail?: string;
}

export interface Deps {
  readonly root: string;
  readonly base: string;
  readonly gates: readonly Gate[];
  readonly map: readonly PathTestEntry[];
  readonly stdio: StdioOptions;
  /** Runs one gate's command; returns its exit status (`null` = killed by a signal). */
  readonly runCommand: (
    command: readonly string[],
    cwd: string,
    stdio: StdioOptions,
  ) => number | null;
  /** The unit/contract test files Vitest's `--changed <sha>` finds, repository-relative. */
  readonly listChangedTests: (sinceSha: string, cwd: string) => string[];
  /** Runs these unit/contract test files; returns the exit status. */
  readonly runTests: (
    files: readonly string[],
    cwd: string,
    stdio: StdioOptions,
  ) => number | null;
  readonly now: () => Date;
}

function git(
  root: string,
  args: readonly string[],
): { ok: boolean; out: string } {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return { ok: run.status === 0, out: (run.stdout ?? "").trim() };
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/**
 * Paths changed since the merge base with `base`: committed, staged, unstaged and untracked.
 * `--no-renames` lists a rename as its old and its new path, so a file moved out of a mapped
 * directory still triggers the map.
 */
export function changedPaths(root: string, mergeBase: string): string[] {
  const diff = git(root, ["diff", "--name-only", "--no-renames", mergeBase]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...lines(diff.out), ...lines(untracked.out)])];
}

function realRunCommand(
  command: readonly string[],
  cwd: string,
  stdio: StdioOptions,
): number | null {
  const [bin, ...args] = command;
  if (bin === undefined) return 1;
  return spawnSync(bin, args, { cwd, stdio }).status;
}

function realListChangedTests(sinceSha: string, cwd: string): string[] {
  const run = spawnSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "list",
      "--changed",
      sinceSha,
      "--filesOnly",
      "--json",
      "--project",
      "unit",
      "--project",
      "contract",
    ],
    { cwd, encoding: "utf8" },
  );
  if (run.status !== 0) {
    throw new Error(
      `vitest list --changed exited ${String(run.status)}: ${run.stderr}`,
    );
  }
  const start = run.stdout.indexOf("[");
  const parsed: unknown = JSON.parse(
    start === -1 ? "[]" : run.stdout.slice(start),
  );
  if (!Array.isArray(parsed))
    throw new Error("vitest list --json did not print an array");
  const files: string[] = [];
  for (const item of parsed as unknown[]) {
    const file = (item as { file?: unknown }).file;
    if (typeof file !== "string") continue;
    const rel = isAbsolute(file) ? relative(cwd, file) : file;
    if (!files.includes(rel)) files.push(rel);
  }
  return files;
}

function realRunTests(
  files: readonly string[],
  cwd: string,
  stdio: StdioOptions,
): number | null {
  return spawnSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--project",
      "unit",
      "--project",
      "contract",
      ...files,
    ],
    { cwd, stdio },
  ).status;
}

export function defaultDeps(root: string, base: string): Deps {
  return {
    root,
    base,
    gates: CHEAP_GATES,
    map: PATH_TESTS,
    stdio: "inherit",
    runCommand: realRunCommand,
    listChangedTests: realListChangedTests,
    runTests: realRunTests,
    now: () => new Date(),
  };
}

function statusOf(code: number | null): number {
  // A gate killed by a signal did not pass; report it as 1 rather than as "null".
  return code ?? 1;
}

function runTestGate(deps: Deps): Omit<GateOutcome, "ms"> {
  const { root, base, map, stdio } = deps;
  const mergeBase = git(root, ["merge-base", base, "HEAD"]);
  if (!mergeBase.ok || mergeBase.out === "") {
    return {
      name: TEST_GATE,
      status: 1,
      detail: `base ${base} not found (git fetch?)`,
    };
  }
  const missing = missingMapTests(root, map);
  let changed: string[];
  try {
    changed = deps.listChangedTests(mergeBase.out, root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: TEST_GATE,
      status: 1,
      detail: `could not list changed tests: ${message}`,
    };
  }
  const fromMap = mappedTests(changedPaths(root, mergeBase.out), map).filter(
    (test) => !changed.includes(test) && !missing.includes(test),
  );
  const files = [...changed, ...fromMap];
  const counts = `changed ${String(changed.length)} + map ${String(fromMap.length)}`;
  const status =
    files.length === 0 ? 0 : statusOf(deps.runTests(files, root, stdio));
  if (missing.length > 0) {
    return {
      name: TEST_GATE,
      status: status === 0 ? 1 : status,
      detail: `${counts} · PATH_TESTS names missing file(s): ${missing.join(", ")}`,
    };
  }
  return { name: TEST_GATE, status, detail: counts };
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export interface GatesCheapResult {
  readonly outcomes: readonly GateOutcome[];
  readonly block: string;
  readonly exitCode: number;
}

/** Runs every gate, then the tests, and renders the proof block. Never stops at a red gate. */
export function runGatesCheap(deps: Deps): GatesCheapResult {
  const head = git(deps.root, ["rev-parse", "HEAD"]).out || "unknown";
  const dirty = git(deps.root, ["status", "--porcelain"]).out !== "";
  const startedAt = deps.now();

  const outcomes: GateOutcome[] = [];
  for (const gate of deps.gates) {
    const t0 = Date.now();
    const status = statusOf(
      deps.runCommand(gate.command, deps.root, deps.stdio),
    );
    outcomes.push({ name: gate.name, status, ms: Date.now() - t0 });
  }
  const t0 = Date.now();
  const tests = runTestGate(deps);
  outcomes.push({ ...tests, ms: Date.now() - t0 });

  const prettierIgnorePath = join(deps.root, ".prettierignore");
  const prettierIgnore = existsSync(prettierIgnorePath)
    ? readFileSync(prettierIgnorePath, "utf8")
    : undefined;

  const red = outcomes.filter((outcome) => outcome.status !== 0);
  const width = Math.max(...outcomes.map((outcome) => outcome.name.length));
  const block = [
    `gates:cheap · ${head} · tree ${dirty ? "DIRTY" : "clean"} · base ${deps.base} · ${startedAt.toISOString()}`,
    ...outcomes.map(
      (outcome) =>
        `${outcome.name.padEnd(width)}  exit ${String(outcome.status)} · ${seconds(outcome.ms)}${outcome.detail === undefined ? "" : ` · ${outcome.detail}`}`,
    ),
    formatCoverageLine(prettierIgnore),
    red.length === 0
      ? "RESULT: PASS"
      : `RESULT: FAIL (${String(red.length)} of ${String(outcomes.length)} red: ${red.map((outcome) => outcome.name).join(", ")})`,
  ].join("\n");

  return { outcomes, block, exitCode: red.length === 0 ? 0 : 1 };
}

export function parseArgs(argv: readonly string[]): { base: string } {
  const at = argv.indexOf("--base");
  if (at === -1) return { base: DEFAULT_BASE };
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error("usage: pnpm gates:cheap [--base <ref>]");
  }
  return { base: value };
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { base } = parseArgs(process.argv.slice(2));
  const result = runGatesCheap(defaultDeps(root, base));
  process.stdout.write(`\n${result.block}\n`);
  process.exit(result.exitCode);
}
