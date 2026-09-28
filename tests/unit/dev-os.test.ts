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
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
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
    ["task-sh.test.sh", "AC-25, AC-42"],
    ["stop-hook.test.sh", "AC-26, AC-40, AC-42"],
    ["bash-guard.test.sh", "AC-37, AC-38, AC-39"],
    ["build-slot.test.sh", "AC-41"],
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
      /\*\*5 check\(s\), \d+ assertion\(s\): \d+ passed, 0 failed\.\*\*/,
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

  // T-52 (spec 001 §14 A19): the count covers the shell guard's and the build slot's checks, so a
  // deleted check file turns this red. TASK-154 adds its clock check here.
  it("discovers exactly the committed checks", () => {
    expect(devOsCheckScripts(repoRoot)).toEqual([
      "bash-guard.test.sh",
      "build-slot.test.sh",
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

  it("does not leak errexit out of a run_* helper (PR #10 review)", () => {
    // The regression: `run_guard_raw`, `run_task_sh` and `run_stop_hook` used to end with a bare
    // `set -e`. The checks run *without* errexit, so the first helper call turned it on for the
    // rest of the file, and `not_ok` returns 1 — a failing assertion then aborted the check
    // before `finish`, and the aggregate footer said "0 failed" next to a visible FAIL row.
    //
    // This is the shape of that bug: a `run_guard` call, then a failing assertion, then two more
    // assertions and the summary line. All of it must be reached.
    const result = sourceLib(
      'project="$(make_project)"\n' +
        'run_guard "$project" Write src/x.ts\n' +
        'assert_eq deliberate mismatch "fails after run_guard"\n' +
        'assert_eq same same "still running after the failure"\n' +
        'finish "errexit.test.sh"',
    );

    expect(result.stdout).toContain("not ok 1 - fails after run_guard");
    // The assertion *after* the failure, and the summary, are the two things the leak destroyed.
    expect(result.stdout).toContain("ok 2 - still running after the failure");
    expect(result.stdout).toContain("# errexit.test.sh: 1 passed, 1 failed");
    expect(result.status).toBe(1);
  });

  it("reports errexit off after each run_* helper", () => {
    // The helpers restore what they found; the checks are sourced without errexit, so "off".
    const result = sourceLib(
      'project="$(make_git_project)"\n' +
        'run_guard "$project" Write src/x.ts\n' +
        'case "$-" in *e*) echo "after run_guard: on" ;; *) echo "after run_guard: off" ;; esac\n' +
        'run_task_sh "$project" show\n' +
        'case "$-" in *e*) echo "after run_task_sh: on" ;; *) echo "after run_task_sh: off" ;; esac\n' +
        'run_stop_hook "$project"\n' +
        'case "$-" in *e*) echo "after run_stop_hook: on" ;; *) echo "after run_stop_hook: off" ;; esac',
    );

    expect(result.stdout).toContain("after run_guard: off");
    expect(result.stdout).toContain("after run_task_sh: off");
    expect(result.stdout).toContain("after run_stop_hook: off");
  });

  it("puts errexit back when the caller did have it on", () => {
    const result = sourceLib(
      "set -e\n" +
        'project="$(make_project)"\n' +
        'run_guard "$project" Write src/x.ts\n' +
        'case "$-" in *e*) echo "restored: on" ;; *) echo "restored: off" ;; esac',
    );

    expect(result.stdout).toContain("restored: on");
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
    // A full second run of every check (the shell guard's alone feeds its hook over a hundred
    // payloads), so it gets the time a full run takes rather than the 5 s default.
  }, 120_000);
});

/**
 * T-41 / AC-38, AC-40 (spec 001 §14 A19, TASK-150): one table of paths, fed to both hooks'
 * classifier — `task-guard.sh` as a `Write`, `bash-guard.sh` as `echo x > <path>` — gives identical
 * verdicts, because both import `.claude/hooks/guarded_paths.py`. The deletion case runs the same
 * table against a scratch copy of `.claude/hooks/` whose `guarded_paths.py` has lost `db/`: the
 * `db/` rows flip to "allowed" in both hooks at once, and nothing else changes.
 */
describe("the shared guarded-path classifier (T-41)", () => {
  function git(cwd: string, ...args: string[]): void {
    execFileSync("git", args, { cwd, stdio: "ignore" });
  }

  const main = realpathSync(tempRoot());
  mkdirSync(join(main, ".claude/state"), { recursive: true });
  writeFileSync(
    join(main, "TASKS.md"),
    "| ID | Title | Spec | Phase | Status |\n|---|---|---|---|---|\n| TASK-001 | x | y | 0 | in_progress |\n",
  );
  git(main, "-c", "init.defaultBranch=main", "init", "-q");
  git(
    main,
    "-c",
    "user.name=dev-os check",
    "-c",
    "user.email=dev-os@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "-q",
    "--no-verify",
    "--allow-empty",
    "-m",
    "fixture",
  );
  const branchWorktree = join(realpathSync(tempRoot()), "wt");
  const detachedWorktree = join(realpathSync(tempRoot()), "wt");
  git(main, "worktree", "add", "-q", "-b", "spec/x", branchWorktree);
  git(main, "worktree", "add", "-q", "--detach", detachedWorktree);
  // Folder names whose casefold changes length: `ß` → `ss`, `İ` → `i̇` (PR 107 breaker, hole 7).
  const eszettWorktree = join(realpathSync(tempRoot()), "straße");
  const dottedIWorktree = join(realpathSync(tempRoot()), "İstanbul");
  git(main, "worktree", "add", "-q", "-b", "spec/y", eszettWorktree);
  git(main, "worktree", "add", "-q", "-b", "spec/z", dottedIWorktree);
  // One name, two Unicode spellings: composed `é` (NFC) and `e` + combining acute (NFD). This Mac's
  // disk treats them as the same folder (PR 107 breaker, hole 8).
  const composed = "caf\u00e9";
  const decomposed = "cafe\u0301";
  const nfcParent = realpathSync(tempRoot());
  const nfdParent = realpathSync(tempRoot());
  git(
    main,
    "worktree",
    "add",
    "-q",
    "-b",
    "spec/nfc",
    join(nfcParent, composed),
  );
  git(
    main,
    "worktree",
    "add",
    "-q",
    "-b",
    "spec/nfd",
    join(nfdParent, decomposed),
  );
  const outside = join(realpathSync(tempRoot()), "outside.ts");

  // [path, guarded?] — no task is active anywhere: the main pointer is absent, `spec/x` has none.
  const table: readonly (readonly [string, boolean])[] = [
    [join(main, "src/lib/a.ts"), true],
    [join(main, "app/page.tsx"), true],
    [join(main, "supabase/migrations/1.sql"), true],
    [join(main, "db/migrations/0001_init.sql"), true],
    [join(main, "emails/welcome.tsx"), true],
    [join(main, "seed/catalog.ts"), true],
    [join(main, "tests/unit/a.test.ts"), true],
    // this Mac's disk ignores case, so the classifier casefolds (PR 107 breaker, hole 6)
    [join(main, "SRC/a.ts"), true],
    [join(main, "Db/migrations/0003.sql"), true],
    [join(main.toUpperCase(), "src/a.ts"), true],
    [join(main, "docs/notes.md"), false],
    [join(main, "specs/001.md"), false],
    [join(main, ".claude/state/note"), false],
    [join(main, "messages/en.json"), false],
    [join(main, "srcx/a.ts"), false],
    [join(main, "TASKS.md"), false],
    [outside, false],
    [join(branchWorktree, "src/a.ts"), true],
    [join(branchWorktree, "db/migrations/0002.sql"), true],
    [join(eszettWorktree, "src/a.ts"), true],
    [join(dottedIWorktree, "src/a.ts"), true],
    [join(nfcParent, decomposed, "src/a.ts"), true],
    [join(nfdParent, composed, "src/a.ts"), true],
    [join(detachedWorktree, "src/a.ts"), false],
    [join(detachedWorktree, "db/migrations/0002.sql"), false],
  ];

  /** Runs one hook on one payload; "deny" or "allow". */
  function verdict(hook: string, payload: object): "deny" | "allow" {
    const out = execFileSync("bash", [hook], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: main },
    });
    if (out.trim() === "") return "allow";
    const decision = (
      JSON.parse(out) as {
        hookSpecificOutput?: { permissionDecision?: string };
      }
    ).hookSpecificOutput?.permissionDecision;
    return decision === "deny" ? "deny" : "allow";
  }

  function verdicts(hooksDir: string, path: string) {
    return {
      edit: verdict(join(hooksDir, "task-guard.sh"), {
        tool_name: "Write",
        cwd: main,
        tool_input: { file_path: path, content: "x" },
      }),
      shell: verdict(join(hooksDir, "bash-guard.sh"), {
        tool_name: "Bash",
        cwd: main,
        tool_input: { command: `echo x > ${path}` },
      }),
    };
  }

  const realHooks = join(repoRoot, ".claude/hooks");

  it.each(table)("%s → guarded %s, in both hooks", (path, guarded) => {
    const expected = guarded ? "deny" : "allow";
    expect(verdicts(realHooks, path)).toEqual({
      edit: expected,
      shell: expected,
    });
  });

  it("deleting db/ from guarded_paths.py turns the db/ rows red in both hooks, and only them", () => {
    const copy = join(tempRoot(), "hooks");
    cpSync(realHooks, copy, { recursive: true });
    const shared = join(copy, "guarded_paths.py");
    const source = readFileSync(shared, "utf8");
    expect(source).toContain('"db/", ');
    writeFileSync(shared, source.replace('"db/", ', ""));

    for (const [path, guarded] of table) {
      const isDbRow = path.toLowerCase().includes("/db/");
      const expected = guarded && !isDbRow ? "deny" : "allow";
      expect({ path, ...verdicts(copy, path) }).toEqual({
        path,
        edit: expected,
        shell: expected,
      });
    }
    // The real file still guards db/: the table above is what the rows turn red against.
    expect(verdicts(realHooks, join(main, "db/x.sql"))).toEqual({
      edit: "deny",
      shell: "deny",
    });
  });
});

/**
 * PR 107 breaker, hole 1: the shell guard only works if Claude Code runs it. `.claude/settings.json`
 * must register `bash-guard.sh` as a `PreToolUse` hook on the `Bash` tool (AC-37), beside
 * `task-guard.sh` on the edit tools, and both scripts must be executable, since the command runs
 * them directly.
 */
describe("hook registration in .claude/settings.json (AC-37)", () => {
  interface HookEntry {
    readonly matcher?: string;
    readonly hooks?: readonly {
      readonly type?: string;
      readonly command?: string;
    }[];
  }
  const settings = JSON.parse(
    readFileSync(join(repoRoot, ".claude/settings.json"), "utf8"),
  ) as { hooks?: { PreToolUse?: readonly HookEntry[] } };
  const preToolUse = settings.hooks?.PreToolUse ?? [];

  function commandsFor(matcher: string): string[] {
    return preToolUse
      .filter((entry) => entry.matcher === matcher)
      .flatMap((entry) => entry.hooks ?? [])
      .filter((hook) => hook.type === "command")
      .map((hook) => hook.command ?? "");
  }

  it("runs bash-guard.sh on the Bash tool", () => {
    expect(commandsFor("Bash")).toEqual([
      '"$CLAUDE_PROJECT_DIR"/.claude/hooks/bash-guard.sh',
    ]);
  });

  it("still runs task-guard.sh on Edit|Write|NotebookEdit", () => {
    expect(commandsFor("Edit|Write|NotebookEdit")).toEqual([
      '"$CLAUDE_PROJECT_DIR"/.claude/hooks/task-guard.sh',
    ]);
  });

  it.each([".claude/hooks/bash-guard.sh", ".claude/hooks/task-guard.sh"])(
    "%s is executable",
    (path) => {
      expect(statSync(join(repoRoot, path)).mode & 0o111).not.toBe(0);
    },
  );
});
