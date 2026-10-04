/**
 * @purpose Weekday FX rebuild: rebuild each Railway `web` whose fxAsOf is behind the ECB, at its own commit (spec 005 §14 A7)
 *
 * The decision logic of `.github/workflows/fx-refresh.yml` (spec 005 §14 A7 Corrected 3, AC-34;
 * T-34; TASK-181). The workflow only runs this file, so every decision is testable against
 * recorded responses (`tests/unit/fx-refresh.test.ts`).
 *
 * For each of `staging` and `production`, in that order:
 *
 *  1. read the ECB daily file's date (once, shared) — the same file and validation the build step
 *     uses, so a file the build would refuse is a red run here, not a silent rebuild into the
 *     fallback;
 *  2. read the environment's `/api/health` `commit` and `fxAsOf` (base URLs are the repository
 *     variables `FX_REFRESH_STAGING_URL` / `FX_REFRESH_PRODUCTION_URL`);
 *  3. rebuild only when `fxAsOf` is older than the ECB date. A rebuild is a new **build** of the
 *     service `web` at exactly the reported `commit`, through Railway's public GraphQL API:
 *     `variableUpsert` sets `FX_REFRESH_AT` (the `Dockerfile`'s cache-breaker `ARG`) to this
 *     run's UTC timestamp with `skipDeploys: true`, then `serviceInstanceDeployV2(serviceId,
 *     environmentId, commitSha)` builds that commit. Not spec 040 AC-13's image redeploy and not
 *     the dashboard's "redeploy latest": both would fetch nothing new or build a different commit.
 *
 * Guards and failures:
 *
 *  - **Production** is rebuilt only when its `commit` equals the remote `release` tip
 *    (`git ls-remote origin refs/heads/release`); otherwise a rollback or a promotion is in flight
 *    (spec 040 §14 A3 change 4) and production is skipped with one step-summary line.
 *  - An environment whose health does not answer (production before TASK-104), or whose body is
 *    not a health body, or that reports no `fxAsOf` (a deployment from before this bridge) or no
 *    commit SHA, is skipped with a notice.
 *  - A missing secret (`RAILWAY_TOKEN_STAGING` / `RAILWAY_TOKEN_PRODUCTION`) or a missing URL
 *    variable fails the run **naming it**; it never passes as skipped. Tokens are sent only to
 *    Railway's API and never printed.
 *  - **The 19:30 UTC run verifies** (`FX_REFRESH_VERIFY=true`): an environment whose health
 *    answered and whose `fxAsOf` is still behind the ECB date still gets its rebuild requested,
 *    and then the run exits non-zero naming it (a skipped production included, with the skip
 *    reason). The 15:30 run requests rebuilds and exits 0.
 *
 * It pushes no ref, reads no other secret, calls no Vercel hook, dispatches no workflow and runs no
 * test. `worker` is never rebuilt: it renders no page. **Exit:** TASK-071 deletes this file and
 * the workflow when `dbFxRateProvider` goes live (A7 Corrected 6).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import { FX_REFRESH_AT_KEY, WEB_SERVICE_NAME } from "../src/lib/railway.ts";
import { fetchEcbDaily, parseEcbDaily } from "./fx-snapshot.ts";

/** Railway's public GraphQL endpoint (docs.railway.com, "Public API"). */
export const RAILWAY_API_URL = "https://backboard.railway.com/graphql/v2";

/** The `Dockerfile`'s cache-breaker `ARG`, set before every rebuild (AC-31). */
export const FX_REFRESH_AT_VARIABLE = FX_REFRESH_AT_KEY;

/** At most 10 s for a health read or a Railway call. */
const REQUEST_TIMEOUT_MS = 10_000;

export const FX_ENVIRONMENTS = [
  {
    name: "staging",
    tokenSecret: "RAILWAY_TOKEN_STAGING",
    urlVariable: "FX_REFRESH_STAGING_URL",
    releaseGuard: false,
  },
  {
    name: "production",
    tokenSecret: "RAILWAY_TOKEN_PRODUCTION",
    urlVariable: "FX_REFRESH_PRODUCTION_URL",
    releaseGuard: true,
  },
] as const;
export type FxEnvironment = (typeof FX_ENVIRONMENTS)[number];
export type FxEnvironmentName = FxEnvironment["name"];

/** What happened to one environment in one run. */
export type EnvironmentResult =
  | {
      readonly env: FxEnvironmentName;
      readonly state: "current";
      readonly fxAsOf: string;
    }
  | {
      readonly env: FxEnvironmentName;
      readonly state: "rebuilt";
      readonly commit: string;
      readonly fxAsOf: string;
    }
  | {
      readonly env: FxEnvironmentName;
      readonly state: "skipped";
      readonly reason: string;
      /** Set when the skipped environment is nonetheless behind (the 19:30 check reads it). */
      readonly behind: boolean;
    }
  | {
      readonly env: FxEnvironmentName;
      readonly state: "failed";
      readonly reason: string;
    };

export interface FxRefreshDeps {
  /** Every HTTP call: the ECB file, the health reads and Railway's API. */
  readonly fetchImpl: typeof fetch;
  /** The remote `release` tip, or `null` when it cannot be read. */
  readonly releaseTip: () => string | null;
  readonly now: Date;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** One line to the run's log and the step summary. Never receives a token. */
  readonly report: (line: string) => void;
}

export interface FxRefreshOutcome {
  readonly exitCode: number;
  readonly ecbDate: string | null;
  readonly results: readonly EnvironmentResult[];
}

const SHA = /^[0-9a-f]{40}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** One environment's health, or why it is not usable. */
async function readHealth(
  fetchImpl: typeof fetch,
  baseUrl: string,
): Promise<
  | {
      readonly ok: true;
      readonly commit: string;
      readonly fxAsOf: string | undefined;
    }
  | { readonly ok: false; readonly reason: string }
> {
  let body: unknown;
  try {
    const response = await fetchImpl(
      `${baseUrl.replace(/\/+$/u, "")}/api/health`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!response.ok) {
      return {
        ok: false,
        reason: `health answered HTTP ${String(response.status)}`,
      };
    }
    body = await response.json();
  } catch {
    return { ok: false, reason: "health did not answer" };
  }
  const record = (body ?? {}) as Record<string, unknown>;
  if (record.status !== "ok")
    return { ok: false, reason: "health body is not a health body" };
  const commit = typeof record.commit === "string" ? record.commit : "";
  if (!SHA.test(commit)) {
    return {
      ok: false,
      reason: "health reports no commit SHA, so there is no commit to rebuild",
    };
  }
  const fxAsOf =
    typeof record.fxAsOf === "string" && DAY.test(record.fxAsOf)
      ? record.fxAsOf
      : undefined;
  return { ok: true, commit, fxAsOf };
}

/** One Railway GraphQL call with a project token. Throws on a transport or GraphQL error. */
async function railway(
  fetchImpl: typeof fetch,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(RAILWAY_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "project-access-token": token,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    errors?: readonly { message?: string }[];
  };
  if (
    !response.ok ||
    payload.errors !== undefined ||
    payload.data === undefined
  ) {
    const message =
      payload.errors?.[0]?.message ?? `HTTP ${String(response.status)}`;
    throw new Error(`Railway API: ${message}`);
  }
  return payload.data;
}

const PROJECT_TOKEN_QUERY =
  "query { projectToken { projectId environmentId } }";
const SERVICES_QUERY =
  "query ($id: String!) { project(id: $id) { services { edges { node { id name } } } } }";
const VARIABLE_UPSERT =
  "mutation ($input: VariableUpsertInput!) { variableUpsert(input: $input) }";
const DEPLOY_AT_COMMIT =
  "mutation ($serviceId: String!, $environmentId: String!, $commitSha: String!) { serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha) }";

/**
 * Request a new build of `web` at exactly `commit` in the token's environment, with the
 * cache-breaker set to `refreshAt` first. Returns the deployment id Railway answers.
 */
export async function requestRebuild(
  fetchImpl: typeof fetch,
  token: string,
  commit: string,
  refreshAt: string,
): Promise<string> {
  const scope = (await railway(fetchImpl, token, PROJECT_TOKEN_QUERY, {})) as {
    projectToken?: { projectId?: string; environmentId?: string };
  };
  const projectId = scope.projectToken?.projectId;
  const environmentId = scope.projectToken?.environmentId;
  if (projectId === undefined || environmentId === undefined) {
    throw new Error("Railway API: the token names no project environment");
  }
  const project = (await railway(fetchImpl, token, SERVICES_QUERY, {
    id: projectId,
  })) as {
    project?: {
      services?: {
        edges?: readonly { node?: { id?: string; name?: string } }[];
      };
    };
  };
  const serviceId = project.project?.services?.edges?.find(
    (edge) => edge.node?.name === WEB_SERVICE_NAME,
  )?.node?.id;
  if (serviceId === undefined) {
    throw new Error(
      `Railway API: no service named \`${WEB_SERVICE_NAME}\` in the project`,
    );
  }
  await railway(fetchImpl, token, VARIABLE_UPSERT, {
    input: {
      projectId,
      environmentId,
      serviceId,
      name: FX_REFRESH_AT_VARIABLE,
      value: refreshAt,
      skipDeploys: true,
    },
  });
  const deployed = await railway(fetchImpl, token, DEPLOY_AT_COMMIT, {
    serviceId,
    environmentId,
    commitSha: commit,
  });
  return String(deployed.serviceInstanceDeployV2 ?? "");
}

/** The whole run. Never throws: every failure is a result and a non-zero exit code. */
export async function runFxRefresh(
  deps: FxRefreshDeps,
): Promise<FxRefreshOutcome> {
  const verify = deps.env.FX_REFRESH_VERIFY === "true";
  const report = deps.report;
  const results: EnvironmentResult[] = [];

  const fetched = await fetchEcbDaily(deps.fetchImpl);
  const today = deps.now.toISOString().slice(0, 10);
  const parsed = fetched.ok ? parseEcbDaily(fetched.body, today) : null;
  if (parsed === null || !parsed.ok) {
    const reason = fetched.ok
      ? parsed?.ok === false
        ? parsed.reason
        : ""
      : fetched.reason;
    report(
      `fx-refresh: the ECB daily file is unusable (${reason}); a rebuild would serve the committed fallback, so nothing was rebuilt`,
    );
    return { exitCode: 1, ecbDate: null, results };
  }
  const ecbDate = parsed.snapshot.asOf;
  report(
    `fx-refresh: ECB daily file dated ${ecbDate}${verify ? " (19:30 verify run)" : ""}`,
  );

  for (const environment of FX_ENVIRONMENTS) {
    const result = await refreshOne(environment, ecbDate, deps);
    results.push(result);
    report(describe(result, ecbDate));
  }

  const failed = results.filter((result) => result.state === "failed");
  const stillBehind = verify
    ? results.filter(
        (result) =>
          result.state === "rebuilt" ||
          (result.state === "skipped" && result.behind),
      )
    : [];
  for (const result of stillBehind) {
    report(
      `fx-refresh: ${result.env} is still behind the ECB (${ecbDate}) at the 19:30 check${
        result.state === "skipped" ? `, skipped: ${result.reason}` : ""
      }`,
    );
  }
  return {
    exitCode: failed.length > 0 || stillBehind.length > 0 ? 1 : 0,
    ecbDate,
    results,
  };
}

async function refreshOne(
  environment: FxEnvironment,
  ecbDate: string,
  deps: FxRefreshDeps,
): Promise<EnvironmentResult> {
  const env = environment.name;
  const baseUrl = deps.env[environment.urlVariable] ?? "";
  if (baseUrl === "") {
    return {
      env,
      state: "failed",
      reason: `repository variable ${environment.urlVariable} is not set`,
    };
  }
  const token = deps.env[environment.tokenSecret] ?? "";
  if (token === "") {
    return {
      env,
      state: "failed",
      reason: `secret ${environment.tokenSecret} is not set`,
    };
  }

  const health = await readHealth(deps.fetchImpl, baseUrl);
  if (!health.ok)
    return { env, state: "skipped", reason: health.reason, behind: false };
  if (health.fxAsOf === undefined) {
    return {
      env,
      state: "skipped",
      reason:
        "health reports no fxAsOf (the deployment predates the FX bridge)",
      behind: false,
    };
  }
  if (health.fxAsOf >= ecbDate)
    return { env, state: "current", fxAsOf: health.fxAsOf };

  if (environment.releaseGuard) {
    const tip = deps.releaseTip();
    if (tip !== health.commit) {
      return {
        env,
        state: "skipped",
        reason: `its commit ${health.commit.slice(0, 12)} is not the release tip ${
          tip === null ? "(unreadable)" : tip.slice(0, 12)
        }: a promotion or rollback is in flight (spec 040 §14 A3 change 4)`,
        behind: true,
      };
    }
  }

  try {
    await requestRebuild(
      deps.fetchImpl,
      token,
      health.commit,
      deps.now.toISOString(),
    );
  } catch (error) {
    return {
      env,
      state: "failed",
      reason: `rebuild request refused: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
  return {
    env,
    state: "rebuilt",
    commit: health.commit,
    fxAsOf: health.fxAsOf,
  };
}

function describe(result: EnvironmentResult, ecbDate: string): string {
  switch (result.state) {
    case "current":
      return `- ${result.env}: current (fxAsOf ${result.fxAsOf})`;
    case "rebuilt":
      return `- ${result.env}: fxAsOf ${result.fxAsOf} is behind ${ecbDate}; requested a build of \`${WEB_SERVICE_NAME}\` at ${result.commit}`;
    case "skipped":
      return `- ${result.env}: skipped, ${result.reason}`;
    case "failed":
      return `- ${result.env}: FAILED, ${result.reason}`;
  }
}

/** The remote `release` tip, read without moving anything. */
function lsRemoteRelease(): string | null {
  try {
    const out = execFileSync(
      "git",
      ["ls-remote", "origin", "refs/heads/release"],
      {
        encoding: "utf8",
      },
    );
    const sha = out.split(/\s/u)[0] ?? "";
    return SHA.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/* c8 ignore start — the process entry point; every decision above is unit-tested. */
if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const outcome = await runFxRefresh({
    fetchImpl: fetch,
    releaseTip: lsRemoteRelease,
    now: new Date(),
    env: process.env,
    report: (line) => {
      console.log(line);
      if (summaryPath !== undefined && summaryPath !== "") {
        appendFileSync(summaryPath, `${line}\n`);
      }
    },
  });
  process.exit(outcome.exitCode);
}
/* c8 ignore stop */
