/**
 * `pnpm dev-os:check` (spec 001 §2 "Scripts", §11 "Dev OS", AC-24/AC-25/AC-26 · T-25/T-26/T-27,
 * TASK-010).
 *
 * Runs the shell checks in `tests/dev-os/` — the PreToolUse guard, `task.sh` and the Stop hook —
 * aggregates their TAP-ish output and exits non-zero when any assertion failed. spec 001 §11
 * makes this job "the audit trail that the guard and `task.sh` behave as documented", so the
 * summary lists every check with its assertion counts rather than only the verdict.
 *
 * The checks execute the *real* scripts under `.claude/`, against throwaway project roots handed
 * to them through `CLAUDE_PROJECT_DIR`; nothing here reads or writes this repository's
 * `.claude/state/active-task` or `TASKS.md` (see `tests/dev-os/README.md`).
 *
 * Usage: `pnpm dev-os:check` · `node scripts/dev-os-check.ts`
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Where the shell checks live, relative to the repository root. */
export const DEV_OS_DIR = "tests/dev-os";

/** `# <name>: <passed> passed, <failed> failed`, printed by `finish` in `tests/dev-os/lib.sh`. */
const SUMMARY_LINE = /^# (\S+): (\d+) passed, (\d+) failed$/m;

export interface DevOsCheckResult {
  /** File name, e.g. `guard.test.sh`. */
  readonly script: string;
  /** Process exit status (`null` when the process was killed by a signal). */
  readonly status: number | null;
  readonly passed: number;
  readonly failed: number;
  /** Combined stdout + stderr, kept for the failure report. */
  readonly output: string;
  /** True when the script exited 0 and printed a parseable summary with no failures. */
  readonly ok: boolean;
}

export function devOsCheckScripts(root: string): string[] {
  return readdirSync(join(root, DEV_OS_DIR), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.sh"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

/** Assertion counts from a check's output, or `undefined` when it printed no summary line. */
export function parseSummaryLine(
  output: string,
): { passed: number; failed: number } | undefined {
  const match = SUMMARY_LINE.exec(output);
  const passed = match?.[2];
  const failed = match?.[3];
  if (passed === undefined || failed === undefined) return undefined;
  return { passed: Number(passed), failed: Number(failed) };
}

export function runDevOsCheck(root: string, script: string): DevOsCheckResult {
  const run = spawnSync("bash", [join(DEV_OS_DIR, script)], {
    cwd: root,
    encoding: "utf8",
    // The checks are self-contained (temp dirs + CLAUDE_PROJECT_DIR); the ambient environment is
    // passed through so `TMPDIR`, `PATH` and `HOME` behave as they do in a session.
    env: process.env,
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const counts = parseSummaryLine(output);
  const status = run.status;
  return {
    script,
    status,
    passed: counts?.passed ?? 0,
    failed: counts?.failed ?? 0,
    output,
    // A missing summary line is a failure even on exit 0: a check that printed nothing asserted
    // nothing, and a silent gate is not a gate.
    ok: status === 0 && counts !== undefined && counts.failed === 0,
  };
}

export function runDevOsChecks(root: string): DevOsCheckResult[] {
  return devOsCheckScripts(root).map((script) => runDevOsCheck(root, script));
}

/** What each check exercises — the audit trail spec 001 §11 asks for. */
const SUBJECTS: Readonly<Record<string, string>> = {
  "guard.test.sh": "`.claude/hooks/task-guard.sh` (PreToolUse, AC-24)",
  "stop-hook.test.sh": "`.claude/hooks/tasks-reminder.sh` (Stop, AC-26)",
  "task-sh.test.sh": "`.claude/bin/task.sh` (AC-25)",
};

export function formatDevOsSummary(
  results: readonly DevOsCheckResult[],
): string {
  const passed = results.reduce((sum, r) => sum + r.passed, 0);
  const failed = results.reduce((sum, r) => sum + r.failed, 0);
  const lines = [
    "### dev-os-check (AC-24, AC-25, AC-26 / T-25, T-26, T-27)",
    "",
    "| check | subject | assertions | failed | verdict |",
    "|---|---|---|---|---|",
  ];
  for (const result of results) {
    const subject = SUBJECTS[result.script] ?? "—";
    const verdict = result.ok
      ? "pass"
      : `FAIL (exit ${String(result.status ?? "signal")})`;
    lines.push(
      `| \`${result.script}\` | ${subject} | ${String(result.passed)} | ${String(result.failed)} | ${verdict} |`,
    );
  }
  lines.push(
    "",
    `**${String(results.length)} check(s), ${String(passed + failed)} assertion(s): ${String(passed)} passed, ${String(failed)} failed.**`,
    "",
    "The checks run the real `.claude/hooks/*` and `.claude/bin/task.sh` against throwaway project",
    "roots (`CLAUDE_PROJECT_DIR`), so this repository's `.claude/state/active-task` and `TASKS.md`",
    "are never read or written.",
  );
  return lines.join("\n");
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const scripts = devOsCheckScripts(root);
  if (scripts.length === 0) {
    process.stderr.write(
      `dev-os:check found no *.test.sh in ${DEV_OS_DIR}; the dev-OS gate would pass vacuously\n`,
    );
    process.exit(1);
  }

  const results: DevOsCheckResult[] = [];
  for (const script of scripts) {
    const result = runDevOsCheck(root, script);
    results.push(result);
    // Full output for a failure, one line for a pass: a green CI log stays readable and a red one
    // shows which assertion broke without downloading an artifact.
    if (result.ok) {
      process.stdout.write(
        `dev-os:check ${script}: ${String(result.passed)} passed\n`,
      );
    } else {
      process.stdout.write(`dev-os:check ${script}: FAILED\n${result.output}`);
    }
  }

  const summary = formatDevOsSummary(results);
  process.stdout.write(`${summary}\n`);
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary !== undefined && stepSummary !== "") {
    appendFileSync(stepSummary, `${summary}\n`);
  }

  if (results.some((result) => !result.ok)) process.exit(1);
}
