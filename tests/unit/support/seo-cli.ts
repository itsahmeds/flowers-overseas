/**
 * Test support for the three SEO validator CLIs (T-23 / AC-22, TASK-009).
 *
 * AC-22 is worded as "test copies it in, runs the CLI, asserts non-zero, removes it". The copy
 * target here is a **temp directory** handed to the CLI with `--dir`, not
 * `tests/fixtures/seo/<kind>/` itself: a run that crashes between "copies it in" and "removes it"
 * would otherwise leave a deliberately-broken fixture in the working tree, turn `pnpm
 * seo:validate` red for reasons nobody can see, and (worse) could be committed. The observable
 * behaviour AC-22 asks for is identical, and the committed directories stay in their `no
 * fixtures` state — which the same tests assert.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const repoRoot = resolve(__dirname, "../../..");
export const casesDir = resolve(repoRoot, "tests/fixtures/seo/_cases");

export interface CliResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs `node scripts/seo/<script> --dir <dir>` from the repo root. */
export function runSeoCli(script: string, dir: string): CliResult {
  try {
    const stdout = execFileSync(
      process.execPath,
      [join("scripts/seo", script), "--dir", dir],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

/**
 * Copies `files` out of `tests/fixtures/seo/_cases/` into a fresh temp directory, runs `fn` with
 * it, and removes the directory afterwards. `files` maps case file -> name inside the directory,
 * so a case can be presented under the name AC-22 uses.
 */
export function withFixtureDir<T>(
  files: Readonly<Record<string, string>>,
  fn: (dir: string) => T,
): T {
  const dir = mkdtempSync(join(tmpdir(), "fo-seo-fixtures-"));
  try {
    for (const [source, target] of Object.entries(files)) {
      copyFileSync(join(casesDir, source), join(dir, target));
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** An empty temp directory: the committed `no fixtures` state, without touching the repo. */
export function withEmptyDir<T>(fn: (dir: string) => T): T {
  return withFixtureDir({}, fn);
}
