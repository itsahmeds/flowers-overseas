/**
 * Run one `ci.yml` step the way the runner does (`/break 263` holes 3 to 5, TASK-099): its `env:`
 * and its `run:` have their `${{ … }}` expressions resolved against a context the test supplies
 * (`github.*`, `secrets.*`, `steps.*`), then the script runs under `bash --noprofile --norc -eo
 * pipefail` in a scratch workspace with `GITHUB_ENV`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY` and
 * `RUNNER_TEMP` as files and directories of its own.
 *
 * Because the step's own `env:` mapping is what gets resolved, a mutation of that mapping (an
 * event read from the wrong field, a secret dropped, a base SHA for a head SHA) changes what the
 * script sees, and the test that pins the behaviour goes red. Text matching cannot do that.
 *
 * `stubs` are shell scripts put first on `PATH` (for `node`, `pnpm`, `npx`, …); each one may log
 * its arguments to `$STUB_LOG`. The repository's `scripts/` and `lighthouserc.json` are linked
 * into the workspace, so a step that runs a real script (no stub) runs this checkout's.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface WorkflowStep {
  readonly run?: string;
  readonly env?: Record<string, string>;
}

export type Context = Record<string, unknown>;

const repoRoot = resolve(__dirname, "../..");

/** `a.b.c` looked up in the context; anything missing is the empty string, as on the runner. */
function lookup(context: Context, path: string): string {
  let value: unknown = context;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object") return "";
    value = (value as Record<string, unknown>)[key];
  }
  return value === undefined || value === null ? "" : String(value);
}

/** Resolve every `${{ path }}` (plain property paths only; anything else is refused). */
export function resolveExpressions(text: string, context: Context): string {
  return text.replace(/\$\{\{\s*([^}]+?)\s*\}\}/gu, (_, expression: string) => {
    if (!/^[A-Za-z_][\w.-]*$/u.test(expression)) {
      throw new Error(`run-workflow-step cannot evaluate \`${expression}\``);
    }
    return lookup(context, expression);
  });
}

export interface StepResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** `GITHUB_ENV` lines, parsed. */
  readonly githubEnv: Record<string, string>;
  readonly githubOutput: string;
  readonly summary: string;
  /** What the stubs logged, one line per call. */
  readonly stubLog: string[];
  readonly workspace: string;
  readonly runnerTemp: string;
  /** Remove the scratch workspace. */
  readonly cleanup: () => void;
}

export function runWorkflowStep(
  step: WorkflowStep | undefined,
  context: Context,
  options: {
    readonly stubs?: Record<string, string>;
    readonly files?: Record<string, string>;
    readonly env?: Record<string, string>;
  } = {},
): StepResult {
  if (step?.run === undefined) throw new Error("the step has no `run:`");
  const root = mkdtempSync(join(tmpdir(), "fo-step-"));
  const workspace = join(root, "workspace");
  const runnerTemp = join(root, "runner-temp");
  const bin = join(root, "bin");
  for (const dir of [workspace, runnerTemp, bin]) mkdirSync(dir);
  symlinkSync(join(repoRoot, "scripts"), join(workspace, "scripts"));
  symlinkSync(join(repoRoot, "node_modules"), join(workspace, "node_modules"));
  writeFileSync(
    join(workspace, "lighthouserc.json"),
    readFileSync(join(repoRoot, "lighthouserc.json")),
  );
  for (const [name, body] of Object.entries(options.files ?? {})) {
    const path = join(workspace, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  for (const [name, body] of Object.entries(options.stubs ?? {})) {
    const path = join(bin, name);
    writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(path, 0o755);
  }
  const files = {
    GITHUB_ENV: join(root, "github-env"),
    GITHUB_OUTPUT: join(root, "github-output"),
    GITHUB_STEP_SUMMARY: join(root, "summary"),
    STUB_LOG: join(root, "stub-log"),
  };
  for (const path of Object.values(files)) writeFileSync(path, "");
  const stepEnv = Object.fromEntries(
    Object.entries(step.env ?? {}).map(([key, value]) => [
      key,
      resolveExpressions(String(value), context),
    ]),
  );
  const run = spawnSync(
    "bash",
    [
      "--noprofile",
      "--norc",
      "-eo",
      "pipefail",
      "-c",
      resolveExpressions(step.run, context),
    ],
    {
      cwd: workspace,
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env["PATH"] ?? ""}`,
        HOME: root,
        RUNNER_TEMP: runnerTemp,
        GITHUB_WORKSPACE: workspace,
        NODE_ENV: "test",
        ...files,
        ...(options.env ?? {}),
        ...stepEnv,
      },
    },
  );
  const read = (path: string): string =>
    existsSync(path) ? readFileSync(path, "utf8") : "";
  const githubEnv = Object.fromEntries(
    read(files.GITHUB_ENV)
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => [
        line.slice(0, line.indexOf("=")),
        line.slice(line.indexOf("=") + 1),
      ]),
  );
  return {
    status: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    githubEnv,
    githubOutput: read(files.GITHUB_OUTPUT),
    summary: read(files.GITHUB_STEP_SUMMARY),
    stubLog: read(files.STUB_LOG)
      .split("\n")
      .filter((line) => line !== ""),
    workspace,
    runnerTemp,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
