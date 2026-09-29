/**
 * T-45 (spec 001 AC-43, TASK-152): `pnpm gates:cheap` runs every gate, reads every exit code, and
 * runs the tests that read a changed path as text even when `vitest --changed` finds none.
 *
 * Integration in kind: each case builds a throwaway git repository and runs real subprocesses for
 * the gates. Only the two Vitest calls are stubbed — `listChangedTests` answers what `--changed`
 * would, and `runTests` records the files it is handed — so the path map is observed from the
 * outside, exactly as the spec's "stubbed runner that records the test files it is given" asks.
 * The drift half of T-45 (the `CLAUDE.md` sentence) lives in `framework-text.test.ts`, which is
 * the test the path map runs when `CLAUDE.md` changes.
 *
 * T-66 (spec 001 AC-61's local clause, TASK-159): the always-run list. The T-45 cases stub it
 * empty so they stay about the path map; the T-66 cases run with the committed `ALWAYS_TESTS`, so
 * deleting a name from it turns that name's case red.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ALWAYS_TESTS,
  CHEAP_GATES,
  PATH_TESTS,
  TEST_GATE,
  defaultDeps,
  formatCoverageLine,
  mappedTests,
  missingMapTests,
  parseArgs,
  runGatesCheap,
  type Deps,
  type Gate,
  type PathTestEntry,
} from "../../scripts/gates-cheap.ts";

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function sh(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function put(root: string, path: string, text = "x\n"): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A repository with a `main` branch holding every file the map names, and a work branch. */
function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "gates-cheap-"));
  scratch.push(root);
  sh(root, "init", "-q", "-b", "main");
  sh(root, "config", "user.email", "t@example.invalid");
  sh(root, "config", "user.name", "t");
  sh(root, "config", "commit.gpgsign", "false");
  for (const entry of PATH_TESTS)
    for (const test of entry.tests) put(root, test);
  for (const test of ALWAYS_TESTS) put(root, test);
  put(root, "CLAUDE.md");
  put(root, ".claude/hooks/task-guard.sh");
  put(root, ".github/workflows/ci.yml");
  put(root, "src/a.ts");
  put(
    root,
    ".prettierignore",
    "# comment\nnode_modules/\n\n.claude/\nCLAUDE.md\n",
  );
  sh(root, "add", "-A");
  sh(root, "commit", "-q", "-m", "base");
  sh(root, "checkout", "-q", "-b", "task/TASK-999-x");
  return root;
}

function commitChange(root: string, path: string): void {
  put(root, path, "changed\n");
  sh(root, "add", "-A");
  sh(root, "commit", "-q", "-m", "change");
}

const passing = (name: string): Gate => ({
  name,
  command: ["sh", "-c", "exit 0"],
});

interface Recorded {
  deps: Deps;
  gatesRun: string[];
  testFiles: string[][];
}

function stubbed(
  root: string,
  overrides: Partial<
    Pick<Deps, "gates" | "map" | "listChangedTests" | "always">
  > = {},
): Recorded {
  const gatesRun: string[] = [];
  const testFiles: string[][] = [];
  const real = defaultDeps(root, "main");
  const gates =
    overrides.gates ?? CHEAP_GATES.map((gate) => passing(gate.name));
  const deps: Deps = {
    ...real,
    stdio: "ignore",
    listChangedTests: () => [],
    // T-45's cases are about the path map; T-66's pass `always: real.always` back in.
    always: [],
    runTests: (files) => {
      testFiles.push([...files]);
      return 0;
    },
    ...overrides,
    gates,
    runCommand: (command, cwd, stdio) => {
      const gate = gates.find((g) => g.command === command);
      gatesRun.push(gate?.name ?? command.join(" "));
      return real.runCommand(command, cwd, stdio);
    },
  };
  return { deps, gatesRun, testFiles };
}

describe("T-45: every gate runs and every exit code is read", () => {
  it("a third gate exiting 3 → all still run, the block says exit 3, RESULT: FAIL (1 of 7), non-zero exit", () => {
    const root = tempRepo();
    put(root, "notes.txt"); // uncommitted: the tree is dirty
    const gates: Gate[] = CHEAP_GATES.map((gate, i) =>
      i === 2
        ? { name: gate.name, command: ["sh", "-c", "exit 3"] }
        : passing(gate.name),
    );
    const { deps, gatesRun } = stubbed(root, { gates });
    const result = runGatesCheap(deps);

    expect(gatesRun).toEqual(gates.map((gate) => gate.name));
    expect(result.outcomes.map((o) => o.name)).toEqual([
      ...gates.map((g) => g.name),
      TEST_GATE,
    ]);
    expect(result.outcomes[2]?.status).toBe(3);
    const third = result.block
      .split("\n")
      .find((line) => line.startsWith(`${gates[2]?.name ?? ""} `));
    expect(third).toMatch(/ exit 3 · \d+\.\d s$/);
    expect(result.block).toContain(
      `RESULT: FAIL (1 of 7 red: ${gates[2]?.name ?? ""})`,
    );
    expect(result.exitCode).not.toBe(0);

    const head = sh(root, "rev-parse", "HEAD").trim();
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    const first = result.block.split("\n")[0] ?? "";
    expect(first).toMatch(
      new RegExp(
        `^gates:cheap · ${head} · tree DIRTY · base main · \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z$`,
      ),
    );
  });

  it("every gate green on a clean tree → RESULT: PASS, exit 0, tree clean", () => {
    const root = tempRepo();
    const { deps } = stubbed(root);
    const result = runGatesCheap(deps);
    expect(result.block).toContain(" · tree clean · ");
    expect(result.block.split("\n").at(-1)).toBe("RESULT: PASS");
    expect(result.exitCode).toBe(0);
  });

  it("a gate killed by a signal counts as red", () => {
    const root = tempRepo();
    const gates = [
      { name: "typecheck", command: ["sh", "-c", "kill -9 $$"] } as const,
    ];
    const { deps } = stubbed(root, { gates });
    const result = runGatesCheap(deps);
    expect(result.outcomes[0]?.status).toBe(1);
    expect(result.block).toContain("RESULT: FAIL (1 of 2 red: typecheck)");
  });

  it("the default gate list is the six cheap gates, run through pnpm", () => {
    expect(CHEAP_GATES.map((gate) => gate.command.join(" "))).toEqual([
      "pnpm typecheck",
      "pnpm lint",
      "pnpm format:check",
      "pnpm i18n:check",
      "pnpm check:no-db",
      "pnpm codebase:map --check",
    ]);
  });
});

describe("T-45: the block says what format:check covers", () => {
  it("reads .prettierignore at run time, comments and blanks dropped", () => {
    const root = tempRepo();
    const { deps } = stubbed(root);
    expect(runGatesCheap(deps).block).toContain(
      "format:check covers: every path except node_modules/ .claude/ CLAUDE.md",
    );
  });

  it("says so when there is no .prettierignore", () => {
    expect(formatCoverageLine(undefined)).toBe(
      "format:check covers: every path (no .prettierignore)",
    );
  });
});

describe("T-45: the path map runs the tests that read changed text", () => {
  const testLine = (block: string): string =>
    block.split("\n").find((line) => line.startsWith(`${TEST_GATE} `)) ?? "";

  it("only CLAUDE.md → framework-text and agent-orientation run, `changed 0 + map 2`", () => {
    const root = tempRepo();
    commitChange(root, "CLAUDE.md");
    const { deps, testFiles } = stubbed(root);
    const result = runGatesCheap(deps);
    expect(testFiles).toEqual([
      [
        "tests/unit/framework-text.test.ts",
        "tests/unit/agent-orientation.test.ts",
      ],
    ]);
    expect(testLine(result.block)).toContain("changed 0 + map 2");
  });

  it("only .claude/hooks/task-guard.sh → dev-os.test.ts runs too", () => {
    const root = tempRepo();
    commitChange(root, ".claude/hooks/task-guard.sh");
    const { deps, testFiles } = stubbed(root);
    runGatesCheap(deps);
    expect(testFiles).toEqual([
      [
        "tests/unit/framework-text.test.ts",
        "tests/unit/agent-orientation.test.ts",
        "tests/unit/dev-os.test.ts",
      ],
    ]);
  });

  it("only .github/workflows/ci.yml → ci-workflow.test.ts runs", () => {
    const root = tempRepo();
    commitChange(root, ".github/workflows/ci.yml");
    const { deps, testFiles } = stubbed(root);
    runGatesCheap(deps);
    expect(testFiles).toEqual([["tests/unit/ci-workflow.test.ts"]]);
  });

  it("an uncommitted change counts, and a rename lists its old path too", () => {
    const root = tempRepo();
    sh(root, "mv", ".github/workflows/ci.yml", "ci.yml.bak");
    const { deps, testFiles } = stubbed(root);
    runGatesCheap(deps);
    expect(testFiles).toEqual([["tests/unit/ci-workflow.test.ts"]]);
  });

  it("files --changed finds run once, and the map adds only what they miss", () => {
    const root = tempRepo();
    commitChange(root, "CLAUDE.md");
    const { deps, testFiles } = stubbed(root, {
      listChangedTests: () => [
        "tests/unit/framework-text.test.ts",
        "tests/unit/x.test.ts",
      ],
    });
    const result = runGatesCheap(deps);
    expect(testFiles).toEqual([
      [
        "tests/unit/framework-text.test.ts",
        "tests/unit/x.test.ts",
        "tests/unit/agent-orientation.test.ts",
      ],
    ]);
    expect(testLine(result.block)).toContain("changed 2 + map 1");
  });

  it("nothing related → no test runs, the gate is green with `changed 0 + map 0`", () => {
    const root = tempRepo();
    commitChange(root, "src/a.ts");
    const { deps, testFiles } = stubbed(root);
    const result = runGatesCheap(deps);
    expect(testFiles).toEqual([]);
    expect(testLine(result.block)).toMatch(/exit 0 .* changed 0 \+ map 0$/);
  });

  it("a map entry naming a missing test file → the test gate red, naming it", () => {
    const root = tempRepo();
    commitChange(root, "CLAUDE.md");
    const map: PathTestEntry[] = [
      {
        paths: ["CLAUDE.md"],
        tests: ["tests/unit/framework-text.test.ts", "tests/unit/gone.test.ts"],
      },
    ];
    const { deps, testFiles } = stubbed(root, { map });
    const result = runGatesCheap(deps);
    expect(testFiles).toEqual([["tests/unit/framework-text.test.ts"]]);
    expect(testLine(result.block)).toMatch(
      /exit 1 .*missing file\(s\): tests\/unit\/gone\.test\.ts$/,
    );
    expect(result.block).toContain(`RESULT: FAIL (1 of 7 red: ${TEST_GATE})`);
    expect(result.exitCode).toBe(1);
  });

  it("an untracked file counts: a new .claude/hooks/new.sh selects dev-os.test.ts", () => {
    const root = tempRepo();
    put(root, ".claude/hooks/new.sh"); // never added: untracked
    expect(sh(root, "status", "--porcelain")).toContain(
      "?? .claude/hooks/new.sh",
    );
    const { deps, testFiles } = stubbed(root);
    const result = runGatesCheap(deps);
    expect(testFiles).toEqual([
      [
        "tests/unit/framework-text.test.ts",
        "tests/unit/agent-orientation.test.ts",
        "tests/unit/dev-os.test.ts",
      ],
    ]);
    expect(testLine(result.block)).toContain("changed 0 + map 3");
  });

  it("a lister that throws → the test gate exits 1 and says it could not list", () => {
    const root = tempRepo();
    commitChange(root, "CLAUDE.md");
    const { deps, testFiles } = stubbed(root, {
      listChangedTests: () => {
        throw new Error("vitest list --changed exited 1: boom");
      },
    });
    const result = runGatesCheap(deps);
    expect(result.outcomes.at(-1)).toMatchObject({
      name: TEST_GATE,
      status: 1,
    });
    expect(testLine(result.block)).toMatch(
      /exit 1 · [\d.]+ s · could not list changed tests: vitest list --changed exited 1: boom$/,
    );
    expect(testFiles).toEqual([]);
    expect(result.block).toContain(`RESULT: FAIL (1 of 7 red: ${TEST_GATE})`);
    expect(result.exitCode).toBe(1);
  });

  it("a red test run turns the gate red", () => {
    const root = tempRepo();
    commitChange(root, "CLAUDE.md");
    const { deps } = stubbed(root);
    const result = runGatesCheap({ ...deps, runTests: () => 2 });
    expect(result.outcomes.at(-1)).toMatchObject({
      name: TEST_GATE,
      status: 2,
    });
    expect(result.exitCode).toBe(1);
  });

  it("an unknown base → the test gate red, saying so", () => {
    const root = tempRepo();
    const { deps } = stubbed(root);
    const result = runGatesCheap({ ...deps, base: "origin/nope" });
    expect(testLine(result.block)).toContain("base origin/nope not found");
    expect(result.exitCode).toBe(1);
  });

  it("every test file the committed map names exists in this repository", () => {
    expect(PATH_TESTS.flatMap((entry) => entry.tests).length).toBeGreaterThan(
      0,
    );
    expect(missingMapTests(join(__dirname, "../.."))).toEqual([]);
  });

  it("the committed map carries the spec's entries", () => {
    expect(mappedTests(["docs/tasks/_template.md"])).toEqual([
      "tests/unit/framework-text.test.ts",
      "tests/unit/agent-orientation.test.ts",
    ]);
    expect(mappedTests(["docs/framework/why.md"])).toContain(
      "tests/unit/framework-text.test.ts",
    );
    expect(mappedTests([".claude/settings.json"])).toContain(
      "tests/unit/dev-os.test.ts",
    );
    expect(mappedTests([".claude/bin/task.sh"])).toContain(
      "tests/unit/dev-os.test.ts",
    );
    expect(mappedTests([".github/workflows/pr-policy.yml"])).toEqual([
      "tests/unit/ci-workflow.test.ts",
      "tests/unit/pr-policy.test.ts",
    ]);
    expect(
      mappedTests(["docs/tasks/TASK-152.md", "specs/001-x.md", "CLAUDE.mdx"]),
    ).toEqual([]);
  });
});

describe("T-66: the always-run list runs whatever the diff", () => {
  /** The names AC-61's local clause lists today; TASK-160 added `url-pii`. */
  const EXPECTED_ALWAYS = ["zod-boundaries", "lint-coverage", "url-pii"];
  const testLine = (block: string): string =>
    block.split("\n").find((line) => line.startsWith(`${TEST_GATE} `)) ?? "";
  const withAlways = (
    root: string,
    overrides: Parameters<typeof stubbed>[1] = {},
  ): Recorded =>
    stubbed(root, { always: defaultDeps(root, "main").always, ...overrides });

  it("a diff that only adds src/app/api/x/route.ts → exactly the always-run tests run, and the line names them", () => {
    const root = tempRepo();
    put(root, "src/app/api/x/route.ts", "export {};\n"); // untracked, as a new route is
    const { deps, testFiles } = withAlways(root);
    const result = runGatesCheap(deps);
    expect(testFiles).toEqual([
      EXPECTED_ALWAYS.map((name) => `tests/unit/${name}.test.ts`),
    ]);
    expect(testLine(result.block)).toMatch(
      new RegExp(
        `exit 0 · [\\d.]+ s · changed 0 \\+ map 0 \\+ always 3 · always run: ${EXPECTED_ALWAYS.join(", ")}$`,
      ),
    );
    expect(result.exitCode).toBe(0);
  });

  it.each(EXPECTED_ALWAYS)(
    "%s is on the committed list, so it runs on a diff that touches nothing it imports",
    (name) => {
      const root = tempRepo();
      commitChange(root, "src/a.ts");
      const { deps, testFiles } = withAlways(root);
      const result = runGatesCheap(deps);
      expect(testFiles.flat()).toContain(`tests/unit/${name}.test.ts`);
      expect(
        testLine(result.block).split(" · always run: ")[1]?.split(", "),
      ).toContain(name);
    },
  );

  it("a test `--changed` already found runs once, counted there", () => {
    const root = tempRepo();
    commitChange(root, "src/a.ts");
    const { deps, testFiles } = withAlways(root, {
      listChangedTests: () => ["tests/unit/zod-boundaries.test.ts"],
    });
    const result = runGatesCheap(deps);
    expect(testFiles).toEqual([
      [
        "tests/unit/zod-boundaries.test.ts",
        "tests/unit/lint-coverage.test.ts",
        "tests/unit/url-pii.test.ts",
      ],
    ]);
    expect(testLine(result.block)).toContain("changed 1 + map 0 + always 2");
  });

  it("an always-run entry naming a missing file → the test gate red, naming it", () => {
    const root = tempRepo();
    const { deps, testFiles } = withAlways(root, {
      always: ["tests/unit/zod-boundaries.test.ts", "tests/unit/gone.test.ts"],
    });
    const result = runGatesCheap(deps);
    expect(testFiles).toEqual([["tests/unit/zod-boundaries.test.ts"]]);
    expect(testLine(result.block)).toMatch(
      /exit 1 .*ALWAYS_TESTS names missing file\(s\): tests\/unit\/gone\.test\.ts$/,
    );
    expect(result.exitCode).toBe(1);
  });

  it("the committed list is AC-61's, and every file on it exists in this repository", () => {
    expect(ALWAYS_TESTS).toEqual(
      EXPECTED_ALWAYS.map((name) => `tests/unit/${name}.test.ts`),
    );
    expect(defaultDeps(join(__dirname, "../.."), "main").always).toBe(
      ALWAYS_TESTS,
    );
    const repo = join(__dirname, "../..");
    expect(
      ALWAYS_TESTS.filter((test) => !existsSync(join(repo, test))),
    ).toEqual([]);
  });
});

describe("arguments", () => {
  it("defaults the base to origin/main and takes --base <ref>", () => {
    expect(parseArgs([])).toEqual({ base: "origin/main" });
    expect(parseArgs(["--base", "main"])).toEqual({ base: "main" });
    expect(() => parseArgs(["--base"])).toThrow(/usage/);
  });
});
