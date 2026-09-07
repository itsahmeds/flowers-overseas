/**
 * T-25, T-26, T-27 / AC-24, AC-25, AC-26 (spec 001, TASK-010): the dev-OS checks inside the unit
 * suite.
 *
 * The three assertions of AC-24…AC-26 are shell-level (they feed JSON to a hook and read
 * `git status`), so they live in `tests/dev-os/*.test.sh` and are aggregated by
 * `pnpm dev-os:check`. This file is the wrapper that puts them in front of `pnpm test` and the
 * `test-unit` CI job as well, so the dev-OS gate cannot be green only in a job somebody forgot to
 * add — plus the negative cases that prove the harness *reports* a failure instead of swallowing
 * it (a check that always passes is worse than no check).
 *
 * Nothing here touches the repository's `.claude/state/active-task` or `TASKS.md`:
 * `tests/dev-os/lib.sh` points every hook at a temp project via `CLAUDE_PROJECT_DIR` and aborts
 * with exit 99 if a check ever resolves to this repository (`tests/dev-os/README.md`).
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  DEV_OS_DIR,
  devOsCheckScripts,
  formatDevOsSummary,
  parseSummaryLine,
  runDevOsCheck,
  runDevOsChecks,
} from "../../scripts/dev-os-check.ts";

const repoRoot = resolve(__dirname, "../..");
const tempRoots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "fo-dev-os-unit-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

interface Run {
  readonly status: number;
  readonly stdout: string;
}

/** Runs a command from the repository root, capturing the exit status instead of throwing. */
function run(
  file: string,
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): Run {
  try {
    const stdout = execFileSync(file, [...args], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: failure.status ?? 1,
      stdout: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

describe("pnpm dev-os:check (AC-24, AC-25, AC-26)", () => {
  const summaryFile = join(tempRoot(), "step-summary.md");
  const result = run(process.execPath, ["scripts/dev-os-check.ts"], {
    GITHUB_STEP_SUMMARY: summaryFile,
  });

  it("exits 0", () => {
    expect(result.stdout).toContain("0 failed");
    expect(result.status).toBe(0);
  });

  it.each([
    ["guard.test.sh", "AC-24"],
    ["task-sh.test.sh", "AC-25"],
    ["stop-hook.test.sh", "AC-26"],
  ])("reports %s as passed (%s)", (script) => {
    expect(result.stdout).toMatch(
      new RegExp(`dev-os:check ${script.replace(".", "\\.")}: \\d+ passed`),
    );
  });

  it("prints the aggregate summary with the AC ids", () => {
    expect(result.stdout).toContain(
      "### dev-os-check (AC-24, AC-25, AC-26 / T-25, T-26, T-27)",
    );
    expect(result.stdout).toMatch(
      /\*\*3 check\(s\), \d+ assertion\(s\): \d+ passed, 0 failed\.\*\*/,
    );
  });

  it("writes the same summary to GITHUB_STEP_SUMMARY when it is set", () => {
    const written = readFileSync(summaryFile, "utf8");
    expect(written).toContain("### dev-os-check");
    expect(written).toContain("| `guard.test.sh` |");
    expect(written).toContain("0 failed");
  });

  it("leaves no temp project or registry behind", () => {
    // `dev_os_cleanup` runs on `EXIT` in anything that sources `lib.sh`, so the run above must
    // have taken its temp projects (`fo-dev-os.*`) and its registry file with it. This test's own
    // scratch directories are named `fo-dev-os-unit-*` and are removed in `afterAll`.
    const leftovers = readdirSync(tmpdir()).filter(
      (name) =>
        name.startsWith("fo-dev-os.") || name.startsWith("fo-dev-os-registry"),
    );
    expect(leftovers).toEqual([]);
  });

  it("is wired to the `dev-os:check` package script", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["dev-os:check"]).toBe("node scripts/dev-os-check.ts");
  });

  it("discovers exactly the three committed checks", () => {
    expect(devOsCheckScripts(repoRoot)).toEqual([
      "guard.test.sh",
      "stop-hook.test.sh",
      "task-sh.test.sh",
    ]);
  });
});

describe("the harness reports failures", () => {
  /** A temp repository root holding one hand-written check, so no real hook is involved. */
  function rootWithCheck(name: string, body: string): string {
    const root = tempRoot();
    mkdirSync(join(root, DEV_OS_DIR), { recursive: true });
    writeFileSync(
      join(root, DEV_OS_DIR, name),
      `#!/usr/bin/env bash\n${body}\n`,
    );
    return root;
  }

  it("fails the run when a check reports a failed assertion", () => {
    const root = rootWithCheck(
      "fails.test.sh",
      'echo "not ok 1 - deliberate"\necho "# fails.test.sh: 2 passed, 1 failed"\nexit 1',
    );
    const [result] = runDevOsChecks(root);
    expect(result).toMatchObject({
      ok: false,
      passed: 2,
      failed: 1,
      status: 1,
    });
  });

  it("fails the run when a check exits 0 but asserted nothing", () => {
    const root = rootWithCheck("silent.test.sh", "exit 0");
    const result = runDevOsCheck(root, "silent.test.sh");
    expect(result.status).toBe(0);
    expect(result.ok).toBe(false);
  });

  it("has no parseable summary in a silent check's output", () => {
    expect(parseSummaryLine("")).toBeUndefined();
    expect(
      parseSummaryLine("ok 1 - no summary line follows\n"),
    ).toBeUndefined();
    expect(parseSummaryLine("# x.test.sh: 3 passed, 4 failed\n")).toEqual({
      passed: 3,
      failed: 4,
    });
  });

  it("marks a failed check FAIL in the summary table", () => {
    const summary = formatDevOsSummary([
      {
        script: "guard.test.sh",
        status: 1,
        passed: 18,
        failed: 1,
        output: "",
        ok: false,
      },
    ]);
    expect(summary).toContain("| 1 | FAIL (exit 1) |");
    expect(summary).toContain("18 passed, 1 failed");
  });
});

describe("tests/dev-os/lib.sh assertions (the checks' own gate)", () => {
  /** Sources `lib.sh` from the repository root and runs `body` against it. */
  function sourceLib(body: string): Run {
    return run("bash", ["-c", `. tests/dev-os/lib.sh\n${body}`]);
  }

  it("returns non-zero and prints `not ok` on a mismatch", () => {
    const result = sourceLib(
      'assert_eq expected actual "deliberate mismatch"\n' +
        'echo "rc=$?"\n' +
        'finish "negative.test.sh"',
    );
    expect(result.stdout).toContain("not ok 1 - deliberate mismatch");
    expect(result.stdout).toContain("expected: [expected]");
    expect(result.stdout).toContain("rc=1");
    expect(result.stdout).toContain("# negative.test.sh: 0 passed, 1 failed");
    expect(result.status).toBe(1);
  });

  it("returns zero and prints `ok` on a match", () => {
    const result = sourceLib(
      'assert_eq same same "match"\nfinish "positive.test.sh"',
    );
    expect(result.stdout).toContain("ok 1 - match");
    expect(result.stdout).toContain("# positive.test.sh: 1 passed, 0 failed");
    expect(result.status).toBe(0);
  });

  it("refuses to point a hook at the real repository (exit 99)", () => {
    const result = sourceLib(`run_stop_hook "${repoRoot}"`);
    expect(result.stdout).toContain("Bail out!");
    expect(result.stdout).toContain("refusing to run");
    expect(result.status).toBe(99);
  });

  it("leaves this repository's active-task pointer untouched", () => {
    // `.claude/state/` is git-ignored, so the pointer holds the session's task locally
    // (`TASK-010` while this task is in flight) and does not exist at all on a CI runner. Either
    // way, running the checks must not change it: `snapshot()` covers both states.
    const pointer = join(repoRoot, ".claude/state/active-task");
    const snapshot = (): string | null =>
      existsSync(pointer) ? readFileSync(pointer, "utf8") : null;
    const before = snapshot();
    run(process.execPath, ["scripts/dev-os-check.ts"]);
    expect(snapshot()).toBe(before);
  });
});
