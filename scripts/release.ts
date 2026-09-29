/**
 * `pnpm release:status`, `pnpm release:promote` and `pnpm release:rollback` — the only things that
 * move the `release` branch production deploys from (spec 040 §14 A3, AC-35, AC-36, AC-39;
 * TASK-156). Every rule is in `src/lib/release.ts`; this file reads git, `/api/health` and
 * Railway, prints, and makes the one push.
 *
 *     release:status   [--remote origin] [--health-url <url>]
 *     release:promote  --sha <sha> --expect <old-sha>      (fast-forward, with a lease)
 *     release:promote  --create --sha <sha>                (only while `release` does not exist)
 *     release:rollback --to <previous-release-sha> --expect <bad-sha>
 *
 * **Every refusal pushes nothing and names its reason** on stderr, then exits 1. A push happens
 * only after every check has passed, with `--force-with-lease=release:<expected>`, so a
 * `release` moved by anyone since the check makes git refuse the push too. After a push the
 * command reads the remote back and prints the new tip.
 *
 * Railway (`RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`) is optional. `release:status` needs it only
 * when production and `release` differ, to tell a deploy in progress from drift. `release:rollback`
 * needs it only for route (a); route (b), the release note on `origin/main`, needs no token, which
 * is why the founder can run step 2 from their own terminal at 2 a.m. When Railway cannot be
 * reached, the output says so and what was checked instead.
 *
 * Test flags: `--fixture-deployments <path>` replaces the Railway calls with a recorded
 * `deployments` response, `--railway-url <url>` points them elsewhere, and `--health-url` points
 * at a stand-in `/api/health`. `promote` and `rollback` are exported with a `beforePush` seam so a
 * test can move `release` between the checks and the push and watch the lease refuse.
 *
 * The shell guard (`.claude/hooks/bash_guard.py`, AC-40) denies `promote` and `rollback` inside a
 * subagent, and every `git push` to `release` from anyone: the push below runs in a child process
 * this command owns, not through an agent's Bash tool.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  DEPLOYMENTS_PAGE,
  type DeploymentFact,
  RAILWAY_API_URL,
  RAILWAY_DEPLOYMENTS_QUERY,
  RAILWAY_SERVICES_QUERY,
  WEB_SERVICE_NAME,
  deploymentFacts,
  findProductionService,
  railwayDeploymentsResponseSchema,
  railwayServicesResponseSchema,
} from "../src/lib/railway.ts";
import {
  MAIN_BRANCH,
  PRODUCTION_HEALTH_URL,
  RELEASE_BRANCH,
  RELEASE_NOTES_DIR,
  SHA_ARGUMENT,
  brokenInvariantLine,
  deploymentInProgress,
  describeFinding,
  findPromotingNote,
  healthCommitSchema,
  judgeDeployments,
  parseReleaseNote,
  productionMismatchLine,
} from "../src/lib/release.ts";

/** How long one HTTP call (health or Railway) may take before it counts as unreachable. */
const HTTP_TIMEOUT_MS = 10_000;

export interface ReleaseContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** Test seam: runs after every check has passed and immediately before the push. */
  readonly beforePush?: (() => Promise<void>) | undefined;
  readonly healthUrl?: string | undefined;
  readonly railwayUrl?: string | undefined;
  readonly fixtureDeployments?: string | undefined;
}

export interface CommandResult {
  readonly code: number;
  /** Report lines (stdout). */
  readonly lines: string[];
  /** Refusals and failures (stderr). */
  readonly errors: string[];
}

class Refusal extends Error {}

const refuse = (reason: string): never => {
  throw new Refusal(reason);
};

// --- git -------------------------------------------------------------------------------------------

interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function git(ctx: ReleaseContext, args: readonly string[]): Promise<GitResult> {
  return new Promise((done) => {
    execFile(
      "git",
      [...args],
      { cwd: ctx.cwd, env: ctx.env, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code =
          error === null
            ? 0
            : typeof error.code === "number"
              ? error.code
              : 128;
        done({ code, stdout, stderr });
      },
    );
  });
}

async function gitOk(
  ctx: ReleaseContext,
  args: readonly string[],
): Promise<string> {
  const result = await git(ctx, args);
  if (result.code !== 0) {
    throw new Error(`git ${args[0] ?? ""} failed: ${firstLine(result.stderr)}`);
  }
  return result.stdout.trim();
}

const firstLine = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "") ?? "(no message)";

interface RemoteRefs {
  readonly main: string | undefined;
  readonly release: string | undefined;
}

/** The remote's own values of `main` and `release`, read now, and their objects fetched. */
async function readRemote(
  ctx: ReleaseContext,
  remote: string,
): Promise<RemoteRefs> {
  const listing = await gitOk(ctx, [
    "ls-remote",
    remote,
    `refs/heads/${MAIN_BRANCH}`,
    `refs/heads/${RELEASE_BRANCH}`,
  ]);
  const refs = new Map(
    listing
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => {
        const [value = "", name = ""] = line.split("\t");
        return [name, value] as const;
      }),
  );
  const main = refs.get(`refs/heads/${MAIN_BRANCH}`);
  const release = refs.get(`refs/heads/${RELEASE_BRANCH}`);
  const refspecs = [
    `+refs/heads/${MAIN_BRANCH}:refs/remotes/${remote}/${MAIN_BRANCH}`,
  ];
  if (release !== undefined) {
    refspecs.push(
      `+refs/heads/${RELEASE_BRANCH}:refs/remotes/${remote}/${RELEASE_BRANCH}`,
    );
  }
  if (main !== undefined) {
    await gitOk(ctx, ["fetch", "--quiet", "--no-tags", remote, ...refspecs]);
  }
  return { main, release };
}

/** The full SHA of the commit `value` names, or a refusal. */
async function resolveCommit(
  ctx: ReleaseContext,
  flag: string,
  value: string | undefined,
): Promise<string> {
  if (value === undefined || value === "") {
    return refuse(`${flag} <sha> is required`);
  }
  const lowered = value.toLowerCase();
  if (!SHA_ARGUMENT.test(lowered)) {
    return refuse(`${flag} ${value} is not a commit SHA (7 to 40 hex digits)`);
  }
  const result = await git(ctx, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${lowered}^{commit}`,
  ]);
  if (result.code !== 0) {
    return refuse(
      `${flag} ${value} is not a commit this repository knows (after a fetch)`,
    );
  }
  return result.stdout.trim();
}

async function isAncestor(
  ctx: ReleaseContext,
  ancestor: string,
  of: string,
): Promise<boolean> {
  const result = await git(ctx, ["merge-base", "--is-ancestor", ancestor, of]);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  throw new Error(`git merge-base failed: ${firstLine(result.stderr)}`);
}

/**
 * The one push. `--force-with-lease=release:<expected>` (empty `expected`: the branch must not
 * exist) makes git refuse if the remote `release` is not what every check above saw.
 */
async function pushRelease(
  ctx: ReleaseContext,
  remote: string,
  target: string,
  expected: string | undefined,
): Promise<string> {
  await ctx.beforePush?.();
  const lease = `--force-with-lease=${RELEASE_BRANCH}:${expected ?? ""}`;
  const result = await git(ctx, [
    "push",
    "--quiet",
    lease,
    remote,
    `${target}:refs/heads/${RELEASE_BRANCH}`,
  ]);
  if (result.code !== 0) {
    refuse(
      `the push was rejected (${firstLine(result.stderr)}): the remote release is no longer ${expected ?? "absent"}; run release:status and start again`,
    );
  }
  const after = await readRemote(ctx, remote);
  if (after.release !== target) {
    throw new Error(
      `pushed, but the remote release now reads ${after.release ?? "absent"}, not ${target}`,
    );
  }
  return target;
}

// --- HTTP ------------------------------------------------------------------------------------------

type ProductionCommit =
  | { readonly kind: "known"; readonly commit: string }
  | { readonly kind: "unknown"; readonly reason: string };

async function readProductionCommit(url: string): Promise<ProductionCommit> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        kind: "unknown",
        reason: `${url} answered ${String(response.status)}`,
      };
    }
    const parsed = healthCommitSchema.safeParse(await response.json());
    return parsed.success
      ? { kind: "known", commit: parsed.data.commit.toLowerCase() }
      : { kind: "unknown", reason: `${url} returned no commit` };
  } catch (error) {
    return {
      kind: "unknown",
      reason: `${url} not reachable (${errorText(error)})`,
    };
  }
}

const errorText = (error: unknown): string => {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return cause instanceof Error
      ? `${error.message}: ${cause.message}`
      : error.message;
  }
  return String(error);
};

type Deployments =
  | { readonly kind: "facts"; readonly facts: readonly DeploymentFact[] }
  | { readonly kind: "unreachable"; readonly reason: string };

async function railwayPost(
  url: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Railway API answered ${String(response.status)}`);
  }
  return response.json();
}

/** Production `web`'s deployments, from a fixture or the API; never a guess when neither answers. */
async function loadDeployments(ctx: ReleaseContext): Promise<Deployments> {
  try {
    if (ctx.fixtureDeployments !== undefined) {
      const recorded = railwayDeploymentsResponseSchema.parse(
        JSON.parse(
          readFileSync(resolve(ctx.cwd, ctx.fixtureDeployments), "utf8"),
        ),
      );
      return { kind: "facts", facts: deploymentFacts(recorded) };
    }
    const token = ctx.env["RAILWAY_API_TOKEN"];
    const projectId = ctx.env["RAILWAY_PROJECT_ID"];
    if (
      token === undefined ||
      token === "" ||
      projectId === undefined ||
      projectId === ""
    ) {
      return {
        kind: "unreachable",
        reason: "RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID are not set",
      };
    }
    const url = ctx.railwayUrl ?? RAILWAY_API_URL;
    const services = railwayServicesResponseSchema.safeParse(
      await railwayPost(url, token, RAILWAY_SERVICES_QUERY, { projectId }),
    );
    if (!services.success) {
      return {
        kind: "unreachable",
        reason: "the Railway API's answer was not understood",
      };
    }
    const ids = findProductionService(services.data, WEB_SERVICE_NAME);
    if (ids === undefined) return { kind: "facts", facts: [] };
    const deployments = railwayDeploymentsResponseSchema.safeParse(
      await railwayPost(url, token, RAILWAY_DEPLOYMENTS_QUERY, {
        input: {
          projectId,
          environmentId: ids.environmentId,
          serviceId: ids.serviceId,
        },
        first: DEPLOYMENTS_PAGE,
      }),
    );
    if (!deployments.success) {
      return {
        kind: "unreachable",
        reason: "the Railway API's answer was not understood",
      };
    }
    return { kind: "facts", facts: deploymentFacts(deployments.data) };
  } catch (error) {
    return { kind: "unreachable", reason: errorText(error) };
  }
}

// --- commands --------------------------------------------------------------------------------------

async function guarded(
  body: (lines: string[]) => Promise<number>,
): Promise<CommandResult> {
  const lines: string[] = [];
  try {
    const code = await body(lines);
    return { code, lines, errors: [] };
  } catch (error) {
    if (error instanceof Refusal) {
      return {
        code: 1,
        lines,
        errors: [`refused: ${error.message}`, "nothing was pushed"],
      };
    }
    return { code: 1, lines, errors: [`failed: ${errorText(error)}`] };
  }
}

const NO_RELEASE = `the remote has no ${RELEASE_BRANCH} branch yet`;

/** AC-35. */
export function status(
  remote: string,
  ctx: ReleaseContext,
): Promise<CommandResult> {
  return guarded(async (lines) => {
    const refs = await readRemote(ctx, remote);
    if (refs.main === undefined)
      return refuse(`the remote has no ${MAIN_BRANCH} branch`);
    if (refs.release === undefined) {
      lines.push(
        `release      none: ${NO_RELEASE} (spec 040 F1, or release:promote --create)`,
      );
      return 1;
    }
    let code = 0;
    lines.push(`release      ${refs.release}`);
    lines.push(`${remote}/${MAIN_BRANCH}  ${refs.main}`);
    let invariant: string;
    if (await isAncestor(ctx, refs.release, refs.main)) {
      const range = `${refs.release}..${refs.main}`;
      const count = Number(await gitOk(ctx, ["rev-list", "--count", range]));
      lines.push(
        `unreleased   ${String(count)} commits on ${MAIN_BRANCH} not yet released`,
      );
      const subjects = await gitOk(ctx, ["log", "--format=  %h %s", range]);
      if (subjects !== "")
        lines.push(...subjects.split("\n").map((line) => `  ${line.trim()}`));
      invariant = "invariant: ok";
    } else {
      const count = Number(
        await gitOk(ctx, [
          "rev-list",
          "--count",
          `${refs.main}..${refs.release}`,
        ]),
      );
      invariant = brokenInvariantLine(count);
      code = 1;
    }

    const production = await readProductionCommit(
      ctx.healthUrl ?? PRODUCTION_HEALTH_URL,
    );
    if (production.kind === "unknown") {
      lines.push(`production   unknown (${production.reason})`);
      lines.push(invariant);
      return 1;
    }
    lines.push(`production   ${production.commit}`);
    lines.push(invariant);
    if (production.commit !== refs.release) {
      const deployments = await loadDeployments(ctx);
      const building =
        deployments.kind === "facts"
          ? deploymentInProgress(deployments.facts, refs.release)
          : undefined;
      if (building !== undefined) {
        lines.push(
          `deploying ${refs.release} (deployment ${building.id}, ${building.status})`,
        );
      } else {
        lines.push(productionMismatchLine(production.commit, refs.release));
        if (deployments.kind === "unreachable") {
          lines.push(`(Railway not checked: ${deployments.reason})`);
        }
        code = 1;
      }
    }
    return code;
  });
}

export interface PromoteOptions {
  readonly sha: string | undefined;
  readonly expect: string | undefined;
  readonly create: boolean;
  readonly remote: string;
}

/** AC-36. */
export function promote(
  options: PromoteOptions,
  ctx: ReleaseContext,
): Promise<CommandResult> {
  return guarded(async (lines) => {
    if (options.create && options.expect !== undefined) {
      refuse(
        "--create takes no --expect: it is only for a release branch that does not exist",
      );
    }
    if (!options.create && options.expect === undefined) {
      refuse(
        "--expect <old-sha> is required: the release RELEASE: READY names",
      );
    }
    const refs = await readRemote(ctx, options.remote);
    if (refs.main === undefined)
      return refuse(`the remote has no ${MAIN_BRANCH} branch`);
    const target = await resolveCommit(ctx, "--sha", options.sha);
    if (!(await isAncestor(ctx, target, refs.main))) {
      refuse(`${target} is not on ${options.remote}/${MAIN_BRANCH}`);
    }

    if (options.create) {
      if (refs.release !== undefined) {
        refuse(
          `--create, but the remote ${RELEASE_BRANCH} already exists at ${refs.release}`,
        );
      }
      await pushRelease(ctx, options.remote, target, undefined);
      lines.push(`release created at ${target}`);
      lines.push(`release is now ${target}`);
      return 0;
    }

    if (refs.release === undefined) {
      refuse(`${NO_RELEASE}: use --create --sha <sha> for the first release`);
    }
    const expected = await resolveCommit(ctx, "--expect", options.expect);
    if (refs.release !== expected) {
      refuse(
        `the remote ${RELEASE_BRANCH} is ${refs.release ?? "absent"}, not --expect ${expected}: it moved since READY`,
      );
    }
    if (!(await isAncestor(ctx, expected, target))) {
      refuse(
        `not a fast-forward: --expect ${expected} is not an ancestor of ${target}`,
      );
    }
    if (expected === target) {
      lines.push(`release is already ${target}: nothing to push`);
      return 0;
    }
    await pushRelease(ctx, options.remote, target, expected);
    lines.push(
      `release moved ${expected} → ${target} (fast-forward, lease on ${expected})`,
    );
    lines.push(`release is now ${target}`);
    return 0;
  });
}

export interface RollbackOptions {
  readonly to: string | undefined;
  readonly expect: string | undefined;
  readonly remote: string;
}

/** The production release notes on the remote's `main`, read from the fetched commit. */
async function notesOnMain(ctx: ReleaseContext, mainTip: string) {
  const listing = await gitOk(ctx, [
    "ls-tree",
    "--name-only",
    `${mainTip}`,
    `${RELEASE_NOTES_DIR}/`,
  ]);
  const files = listing.split("\n").filter((file) => file.endsWith(".md"));
  return Promise.all(
    files.map(async (file) =>
      parseReleaseNote(file, await gitOk(ctx, ["show", `${mainTip}:${file}`])),
    ),
  );
}

/** AC-39. */
export function rollback(
  options: RollbackOptions,
  ctx: ReleaseContext,
): Promise<CommandResult> {
  return guarded(async (lines) => {
    const refs = await readRemote(ctx, options.remote);
    if (refs.main === undefined)
      return refuse(`the remote has no ${MAIN_BRANCH} branch`);
    if (refs.release === undefined) return refuse(NO_RELEASE);
    const to = await resolveCommit(ctx, "--to", options.to);
    const bad = await resolveCommit(ctx, "--expect", options.expect);
    if (refs.release !== bad) {
      refuse(
        `the remote ${RELEASE_BRANCH} is ${refs.release}, not --expect ${bad}`,
      );
    }
    if (to === bad) refuse(`--to ${to} is the current release`);
    if (!(await isAncestor(ctx, to, bad))) {
      refuse(`--to ${to} is not an ancestor of ${RELEASE_BRANCH} ${bad}`);
    }

    // Route (b): the note that promoted <bad>, read from the remote's main, not the checkout.
    const note = findPromotingNote(await notesOnMain(ctx, refs.main), bad);
    let routeB: string;
    let acceptedB = false;
    if (note === undefined) {
      routeB = `route (b): no production release note on ${options.remote}/${MAIN_BRANCH} promoted ${bad}`;
    } else {
      const previous = await git(ctx, [
        "rev-parse",
        "--verify",
        "--quiet",
        `${note.previous}^{commit}`,
      ]);
      const previousSha =
        previous.code === 0 ? previous.stdout.trim() : note.previous;
      acceptedB = previousSha === to;
      routeB = acceptedB
        ? `route (b): ${note.file} on ${options.remote}/${MAIN_BRANCH} promoted ${bad} and names ${to} as the previous release`
        : `route (b): ${note.file}, the note that promoted ${bad}, names ${previousSha} as the previous release, not ${to}`;
    }

    // Route (a): Railway's production web deployments.
    const deployments = await loadDeployments(ctx);
    let routeA: string;
    let acceptedA = false;
    if (deployments.kind === "unreachable") {
      routeA = `route (a): Railway API not reachable (${deployments.reason}): only route (b), the release note, was checked`;
    } else {
      const finding = judgeDeployments(deployments.facts, to);
      acceptedA = finding.kind === "released";
      routeA = `route (a): ${describeFinding(finding, to)}`;
    }

    if (!acceptedA && !acceptedB) {
      refuse(
        `--to ${to} is an ancestor of ${RELEASE_BRANCH}, but neither route accepts it. ` +
          `Rollback goes only to a commit production ran from ${RELEASE_BRANCH} (a), or to the previous release of the note that promoted ${bad} (b).\n  ${routeA}\n  ${routeB}`,
      );
    }
    lines.push(`accepted by ${acceptedB ? "route (b)" : "route (a)"}`);
    lines.push(`  ${routeA}`);
    lines.push(`  ${routeB}`);
    await pushRelease(ctx, options.remote, to, bad);
    lines.push(`release moved back ${bad} → ${to} (lease on ${bad})`);
    lines.push(`release is now ${to}`);
    return 0;
  });
}

// --- CLI -------------------------------------------------------------------------------------------

const USAGE = `usage:
  pnpm release:status   [--remote origin] [--health-url <url>]
  pnpm release:promote  --sha <sha> --expect <old-sha> [--remote origin]
  pnpm release:promote  --create --sha <sha> [--remote origin]
  pnpm release:rollback --to <previous-release-sha> --expect <bad-sha> [--remote origin]
`;

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      strict: true,
      allowPositionals: false,
      options: {
        sha: { type: "string" },
        expect: { type: "string" },
        create: { type: "boolean", default: false },
        to: { type: "string" },
        remote: { type: "string", default: "origin" },
        "health-url": { type: "string" },
        "railway-url": { type: "string" },
        "fixture-deployments": { type: "string" },
      },
    }));
  } catch (error) {
    process.stderr.write(`${errorText(error)}\n${USAGE}`);
    return 2;
  }
  const ctx: ReleaseContext = {
    cwd: process.cwd(),
    env: process.env,
    healthUrl: values["health-url"],
    railwayUrl: values["railway-url"],
    fixtureDeployments: values["fixture-deployments"],
  };
  const remote = values.remote;
  let result: CommandResult;
  if (command === "status") result = await status(remote, ctx);
  else if (command === "promote") {
    result = await promote(
      { sha: values.sha, expect: values.expect, create: values.create, remote },
      ctx,
    );
  } else if (command === "rollback") {
    result = await rollback(
      { to: values.to, expect: values.expect, remote },
      ctx,
    );
  } else {
    process.stderr.write(USAGE);
    return 2;
  }
  if (result.lines.length > 0)
    process.stdout.write(`${result.lines.join("\n")}\n`);
  if (result.errors.length > 0)
    process.stderr.write(`${result.errors.join("\n")}\n`);
  return result.code;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exitCode = await main(process.argv.slice(2));
}
