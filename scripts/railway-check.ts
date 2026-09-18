/**
 * `pnpm railway:check [--env <name>]` — the Railway drift gate (spec 040 §5.3, AC-9 / AC-11,
 * T-10 / T-11; TASK-098).
 *
 * Two checks, both read-only:
 *
 *  - **Service** (AC-9): the four live values of the `web` service — region, replica count,
 *    healthcheck path and restart policy — against `config/railway.json`. A raised replica count
 *    is a correctness bug until a shared ISR cache handler exists (ADR-0018), which is why it is
 *    a gate and not a note in a runbook.
 *  - **Variables** (`--env <name>`, AC-11): the live **key set** against the 28-key contract plus
 *    the environment's optional switch. Only key *names* are ever read or printed; the API's
 *    values are parsed as `unknown` in `src/lib/railway.ts` and never touched.
 *
 * Credentials: `RAILWAY_API_TOKEN` (a project token, pasted by the founder into their shell or
 * the CI secret store) and `RAILWAY_PROJECT_ID`. Neither is in the repository, and with neither
 * present the script exits non-zero saying so rather than pretending to pass.
 *
 * `--fixture-environment <path>` / `--fixture-variables <path>` replace the two API calls with
 * recorded responses. That is how `tests/contract/railway-check.test.ts` exercises the whole
 * comparison without a token, and how a reviewer reproduces a failure.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RAILWAY_CONFIG_PATH,
  type RailwayConfig,
  type RailwayEnvironmentResponse,
  type RailwayVariablesResponse,
  WEB_SERVICE_NAME,
  compareVariableKeys,
  compareWebService,
  findServiceInstance,
  railwayConfigSchema,
  railwayEnvironmentResponseSchema,
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
  readonly fixtureEnvironment: string | undefined;
  readonly fixtureVariables: string | undefined;
}

function parseArgs(argv: readonly string[]): CliOptions {
  return {
    environmentName: flagValue(argv, "--env"),
    fixtureEnvironment: flagValue(argv, "--fixture-environment"),
    fixtureVariables: flagValue(argv, "--fixture-variables"),
  };
}

function readFixture(path: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv);
  const declared = loadDeclaredConfig(process.cwd());

  let environmentPayload: unknown;
  let variablesPayload: unknown;

  if (options.fixtureEnvironment !== undefined) {
    environmentPayload = readFixture(options.fixtureEnvironment);
    if (options.fixtureVariables !== undefined) {
      variablesPayload = readFixture(options.fixtureVariables);
    }
  } else {
    const token = process.env["RAILWAY_API_TOKEN"];
    const environmentId = process.env["RAILWAY_ENVIRONMENT_ID"];
    const projectId = process.env["RAILWAY_PROJECT_ID"];
    if (
      token === undefined ||
      token === "" ||
      environmentId === undefined ||
      environmentId === "" ||
      projectId === undefined ||
      projectId === ""
    ) {
      process.stderr.write(
        "railway:check needs RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID and RAILWAY_ENVIRONMENT_ID " +
          "in the environment (docs/runbooks/railway-cloudflare-setup.md), or " +
          "--fixture-environment <path> for a recorded response\n",
      );
      return 2;
    }
    environmentPayload = await post(token, ENVIRONMENT_QUERY, {
      id: environmentId,
    });
    if (options.environmentName !== undefined) {
      variablesPayload = await post(token, VARIABLES_QUERY, {
        projectId,
        environmentId,
      });
    }
  }

  const environment =
    railwayEnvironmentResponseSchema.parse(environmentPayload);
  const variables =
    options.environmentName === undefined || variablesPayload === undefined
      ? undefined
      : railwayVariablesResponseSchema.parse(variablesPayload);

  const report = runRailwayCheck({
    declared,
    environmentName:
      options.environmentName ?? environment.data.environment.name,
    environment,
    variables,
  });

  const output = `${report.lines.join("\n")}\n`;
  if (report.ok) {
    process.stdout.write(output);
    return 0;
  }
  process.stderr.write(`railway:check failed:\n${output}`);
  return 1;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exitCode = await main(process.argv.slice(2));
}
