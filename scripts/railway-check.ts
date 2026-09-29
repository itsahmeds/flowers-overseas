/**
 * `pnpm railway:check [--env <name>]` — the Railway drift gate (spec 040 §5.3, AC-9 / AC-11,
 * T-10 / T-11; TASK-098; §14 A3 AC-34, T-34; TASK-155).
 *
 * Three checks, all read-only:
 *
 *  - **Triggers** (AC-34), always: every environment's deployment triggers against
 *    `config/deploy-triggers.json`. Production's `web` and `worker` must follow `release`,
 *    staging's `main`, and no other environment may follow `release`. One project-level query;
 *    needs `RAILWAY_API_TOKEN` and `RAILWAY_PROJECT_ID` only.
 *  - **Service** (AC-9), when `RAILWAY_ENVIRONMENT_ID` is set: the four live values of that
 *    environment's `web` service — region, replica count, healthcheck path and restart policy —
 *    against `config/railway.json`. A raised replica count is a correctness bug until a shared ISR
 *    cache handler exists (ADR-0018), which is why it is a gate and not a note in a runbook.
 *  - **Variables** (`--env <name>`, AC-11, needs `RAILWAY_ENVIRONMENT_ID`): the live **key set**
 *    against the 28-key contract plus the environment's optional switch. Only key *names* are
 *    ever read or printed; the API's values are parsed as `unknown` in `src/lib/railway.ts` and
 *    never touched.
 *
 * Output: the report lines go to **stdout**, and on a red run the verdict goes to **stderr**. A
 * red trigger check prints only its failing rows, so with `RAILWAY_ENVIRONMENT_ID` unset the run
 * AC-42 records while production has no `web` (TASK-104 creates it) is exactly its
 * `production · <service> · triggers on none, declared release` lines on stdout, plus, while
 * staging has no `worker` (TASK-103 creates it), `staging · worker · triggers on none, declared
 * main`; exit 1, and a stderr verdict that labels it `EXPECTED RED until …` with AC-44's line for
 * the cases present. Any other failure carries no such label.
 *
 * Credentials: `RAILWAY_API_TOKEN` (a token the founder pastes into their shell or the CI secret
 * store) and `RAILWAY_PROJECT_ID`. Neither is in the repository, and with either absent the
 * script exits 2 saying so rather than pretending to pass.
 *
 * `--fixture-triggers <path>`, `--fixture-environment <path>` and `--fixture-variables <path>`
 * replace the API calls with recorded responses, and only the checks given a fixture run. That is
 * how `tests/contract/railway-check.test.ts` exercises the whole comparison without a token, and
 * how a reviewer reproduces a failure.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEPLOY_TRIGGERS_PATH,
  type DeployTriggers,
  RAILWAY_CONFIG_PATH,
  type RailwayConfig,
  type RailwayEnvironmentResponse,
  type RailwayVariablesResponse,
  type TriggerReport,
  WEB_SERVICE_NAME,
  compareDeployTriggers,
  compareVariableKeys,
  compareWebService,
  deployTriggersSchema,
  findServiceInstance,
  railwayConfigSchema,
  railwayEnvironmentResponseSchema,
  railwayTriggersResponseSchema,
  railwayVariablesResponseSchema,
} from "../src/lib/railway.ts";

const API_URL = "https://backboard.railway.com/graphql/v2";

export interface RailwayCheckInput {
  readonly declared: RailwayConfig;
  readonly environmentName: string;
  readonly environment: RailwayEnvironmentResponse;
  /** Absent unless `--env` was passed: the variable check is opt-in. */
  readonly variables?: RailwayVariablesResponse | undefined;
}

export interface RailwayCheckReport {
  readonly ok: boolean;
  readonly lines: readonly string[];
}

/**
 * The whole comparison, pure. Every line it returns names a field or a variable **key**; no line
 * can contain a variable value, because no value reaches this function.
 */
export function runRailwayCheck(input: RailwayCheckInput): RailwayCheckReport {
  const lines: string[] = [];
  let ok = true;

  const web = findServiceInstance(input.environment, WEB_SERVICE_NAME);
  if (web === undefined) {
    ok = false;
    lines.push(
      `service ${WEB_SERVICE_NAME}: not found in environment ${input.environmentName}`,
    );
  } else {
    const mismatches = compareWebService(input.declared.deploy, web);
    for (const mismatch of mismatches) {
      ok = false;
      lines.push(
        `service ${WEB_SERVICE_NAME}: ${mismatch.field} is ${mismatch.live}, ${RAILWAY_CONFIG_PATH} declares ${mismatch.declared}`,
      );
    }
    if (mismatches.length === 0) {
      lines.push(
        `service ${WEB_SERVICE_NAME}: region, numReplicas, healthcheckPath and restart policy match ${RAILWAY_CONFIG_PATH}`,
      );
    }
  }

  if (input.variables !== undefined) {
    const keys = Object.keys(input.variables.data.variables);
    const report = compareVariableKeys(keys, input.environmentName);
    for (const key of report.missing) {
      ok = false;
      lines.push(`variables ${input.environmentName}: missing key ${key}`);
    }
    for (const key of report.unexpected) {
      ok = false;
      lines.push(`variables ${input.environmentName}: unexpected key ${key}`);
    }
    if (report.ok) {
      lines.push(
        `variables ${input.environmentName}: ${String(keys.length)} keys, contract satisfied (names only compared)`,
      );
    }
  }

  return { ok, lines };
}

/** Parse `config/railway.json` (T-09). Throws a zod error naming the offending field. */
export function loadDeclaredConfig(repoRoot: string): RailwayConfig {
  const path = resolve(repoRoot, RAILWAY_CONFIG_PATH);
  return railwayConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

/** Parse `config/deploy-triggers.json` (T-35). Throws a zod error naming the offending field. */
export function loadDeclaredTriggers(repoRoot: string): DeployTriggers {
  const path = resolve(repoRoot, DEPLOY_TRIGGERS_PATH);
  return deployTriggersSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * AC-44's three stderr lines, one per set of expected cases present. Case (b), staging's
 * `worker`, retires with TASK-103: its PR deletes the `staging-worker` and
 * `production-services+staging-worker` lines here, and the case in `src/lib/railway.ts`.
 */
const EXPECTED_RED_LABELS: Readonly<Record<string, string>> = {
  "production-services":
    "railway:check: EXPECTED RED until TASK-104 creates production `web` on `release` " +
    "(spec 040 AC-42, T-44): every failure above is a declared production service that does " +
    "not exist yet. Once production `web` exists, this output is a real failure.\n",
  "staging-worker":
    "railway:check: EXPECTED RED until TASK-103 creates staging `worker` " +
    "(spec 040 AC-44, T-45): every failure above is staging's `worker`, which does not exist " +
    "yet. Once staging `worker` exists, this output is a real failure.\n",
  "production-services+staging-worker":
    "railway:check: EXPECTED RED until TASK-104 creates production `web` on `release` and " +
    "TASK-103 creates staging `worker` (spec 040 AC-42, AC-44, T-44, T-45): every failure " +
    "above is a declared production service or staging's `worker`, none of which exists yet. " +
    "Once both exist, this output is a real failure.\n",
};

/**
 * The stderr verdict of a red run. Only the expected red of AC-42 and AC-44 is labelled, chosen
 * by the cases present (`TriggerReport.expectedAbsences`, production's first), and only when the
 * trigger check is the sole failure: a service drift or key-set failure on the same run is a
 * real failure, and the label would hide it.
 */
export function failureVerdict(
  triggers: TriggerReport | undefined,
  otherChecksOk: boolean,
): string {
  const label =
    otherChecksOk && triggers !== undefined
      ? EXPECTED_RED_LABELS[triggers.expectedAbsences.join("+")]
      : undefined;
  return (
    label ?? "railway:check failed: the lines above name each difference.\n"
  );
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

const ENVIRONMENT_QUERY = `query Environment($id: String!) {
  environment(id: $id) {
    name
    serviceInstances {
      edges {
        node {
          serviceName
          region
          numReplicas
          healthcheckPath
          healthcheckTimeout
          restartPolicyType
          restartPolicyMaxRetries
          startCommand
        }
      }
    }
  }
}`;

const TRIGGERS_QUERY = `query DeploymentTriggers($projectId: String!) {
  project(id: $projectId) {
    environments {
      edges {
        node {
          id
          name
          serviceInstances {
            edges {
              node {
                serviceId
                serviceName
                source {
                  repo
                  image
                }
              }
            }
          }
          deploymentTriggers {
            edges {
              node {
                id
                branch
                environmentId
                serviceId
              }
            }
          }
        }
      }
    }
  }
}`;

const VARIABLES_QUERY = `query Variables($projectId: String!, $environmentId: String!) {
  variables(projectId: $projectId, environmentId: $environmentId)
}`;

async function post(
  token: string,
  query: string,
  variables: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(
      `Railway API answered ${String(response.status)} (no response body is printed: it can carry variable values)`,
    );
  }
  return response.json();
}

interface CliOptions {
  readonly environmentName: string | undefined;
  readonly fixtureTriggers: string | undefined;
  readonly fixtureEnvironment: string | undefined;
  readonly fixtureVariables: string | undefined;
}

function parseArgs(argv: readonly string[]): CliOptions {
  return {
    environmentName: flagValue(argv, "--env"),
    fixtureTriggers: flagValue(argv, "--fixture-triggers"),
    fixtureEnvironment: flagValue(argv, "--fixture-environment"),
    fixtureVariables: flagValue(argv, "--fixture-variables"),
  };
}

function readFixture(path: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

const present = (value: string | undefined): value is string =>
  value !== undefined && value !== "";

interface Payloads {
  readonly triggers: unknown;
  readonly environment: unknown;
  readonly variables: unknown;
}

/** Recorded responses, or the live API; `undefined` for a check that does not run. */
async function fetchPayloads(options: CliOptions): Promise<Payloads | string> {
  const fixtureMode =
    options.fixtureTriggers !== undefined ||
    options.fixtureEnvironment !== undefined;
  if (fixtureMode) {
    return {
      triggers:
        options.fixtureTriggers === undefined
          ? undefined
          : readFixture(options.fixtureTriggers),
      environment:
        options.fixtureEnvironment === undefined
          ? undefined
          : readFixture(options.fixtureEnvironment),
      variables:
        options.fixtureEnvironment === undefined ||
        options.fixtureVariables === undefined
          ? undefined
          : readFixture(options.fixtureVariables),
    };
  }

  const token = process.env["RAILWAY_API_TOKEN"];
  const projectId = process.env["RAILWAY_PROJECT_ID"];
  const environmentId = process.env["RAILWAY_ENVIRONMENT_ID"];
  if (!present(token) || !present(projectId)) {
    return (
      "railway:check needs RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID in the environment " +
      "(docs/runbooks/railway-cloudflare-setup.md), plus RAILWAY_ENVIRONMENT_ID for the service " +
      "and --env checks, or --fixture-triggers / --fixture-environment <path> for a recorded response\n"
    );
  }
  if (options.environmentName !== undefined && !present(environmentId)) {
    return "railway:check --env needs RAILWAY_ENVIRONMENT_ID: the variable check reads one environment\n";
  }
  const triggers = await post(token, TRIGGERS_QUERY, { projectId });
  if (!present(environmentId)) {
    return { triggers, environment: undefined, variables: undefined };
  }
  const environment = await post(token, ENVIRONMENT_QUERY, {
    id: environmentId,
  });
  const variables =
    options.environmentName === undefined
      ? undefined
      : await post(token, VARIABLES_QUERY, { projectId, environmentId });
  return { triggers, environment, variables };
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv);
  const payloads = await fetchPayloads(options);
  if (typeof payloads === "string") {
    process.stderr.write(payloads);
    return 2;
  }

  const lines: string[] = [];
  let ok = true;
  let otherChecksOk = true;

  const triggerReport =
    payloads.triggers === undefined
      ? undefined
      : compareDeployTriggers(
          loadDeclaredTriggers(process.cwd()),
          railwayTriggersResponseSchema.parse(payloads.triggers),
        );
  if (triggerReport !== undefined) {
    ok &&= triggerReport.ok;
    lines.push(...triggerReport.lines);
  }

  if (payloads.environment !== undefined) {
    const environment = railwayEnvironmentResponseSchema.parse(
      payloads.environment,
    );
    const variables =
      options.environmentName === undefined || payloads.variables === undefined
        ? undefined
        : railwayVariablesResponseSchema.parse(payloads.variables);
    const report = runRailwayCheck({
      declared: loadDeclaredConfig(process.cwd()),
      environmentName:
        options.environmentName ?? environment.data.environment.name,
      environment,
      variables,
    });
    ok &&= report.ok;
    otherChecksOk &&= report.ok;
    lines.push(...report.lines);
  }

  process.stdout.write(lines.length === 0 ? "" : `${lines.join("\n")}\n`);
  if (ok) return 0;
  process.stderr.write(failureVerdict(triggerReport, otherChecksOk));
  return 1;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exitCode = await main(process.argv.slice(2));
}
