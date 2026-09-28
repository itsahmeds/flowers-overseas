/**
 * The declared Railway topology and the comparisons `pnpm railway:check` makes (spec 040 §5.3,
 * AC-9, AC-11; TASK-098).
 *
 * `config/railway.json` is Railway's own config-as-code file for the `web` service — the founder
 * points the service's "Config as code" field at it — and it is therefore the declaration this
 * module parses with zod (T-09) and diffs against the live API answer (T-10, T-11). Keeping the
 * logic here rather than in the script means every rule is a unit/contract test on a pure
 * function and `scripts/railway-check.ts` is argument parsing, one fetch and printing.
 *
 * Two rules the whole module exists to keep:
 *
 *  - **Values never leave this module.** The variable check compares *key sets*: it takes
 *    `Object.keys` of the API's variable map and returns names only, so no secret can reach
 *    stdout, a CI log or an agent transcript (AC-11, spec 040 §8).
 *  - **The required key set is `ENV_KEYS`**, derived from the zod schemas in `src/lib/env.schema.ts`
 *    rather than re-typed here: the 26 keys of spec 002 plus `APP_ENV` and `NEXT_PUBLIC_APP_ENV`
 *    (AC-11's 28). A key added to the schemas without being added to Railway therefore fails
 *    `railway:check` on the next run instead of failing a deploy.
 */
import { z } from "zod";

// `.ts` extensions, because `pnpm railway:check` runs this file under plain `node`, whose ESM
// resolver does not guess extensions (spec 040 AC-34; TASK-155 found the CLI could not start).
import { ENV_KEYS } from "./env.schema.ts";
import { STAGING_BASIC_AUTH_KEY } from "./basic-auth.ts";

/** Path of the declaration, relative to the repository root. */
export const RAILWAY_CONFIG_PATH = "config/railway.json";

/** The one region this project deploys to: Amsterdam (ADR-0018, §5.3). */
export const RAILWAY_REGION = "europe-west4";

/** Restart policies Railway accepts; §5.3 declares `ON_FAILURE` with at most 10 retries. */
export const restartPolicyTypes = ["ON_FAILURE", "ALWAYS", "NEVER"] as const;

/** `deploy` block of `config/railway.json`. */
export const railwayDeploySchema = z.object({
  startCommand: z.string().min(1),
  region: z.string().min(1),
  numReplicas: z.number().int().min(1),
  healthcheckPath: z.string().startsWith("/"),
  /**
   * Railway's healthcheck **grace window** in seconds (§5.3's 300 s). The 5 s response budget and
   * the 30 s interval of the spec's table are Railway platform defaults and are not expressible
   * in this file; the response budget is separately pinned by AC-31's < 200 ms measurement.
   */
  healthcheckTimeout: z.number().int().positive(),
  restartPolicyType: z.enum(restartPolicyTypes),
  restartPolicyMaxRetries: z.number().int().min(0),
});
export type RailwayDeployConfig = z.infer<typeof railwayDeploySchema>;

/** The whole of `config/railway.json`. */
export const railwayConfigSchema = z.object({
  $schema: z.string().optional(),
  build: z.object({
    builder: z.literal("DOCKERFILE"),
    dockerfilePath: z.literal("Dockerfile"),
  }),
  deploy: railwayDeploySchema,
});
export type RailwayConfig = z.infer<typeof railwayConfigSchema>;

/**
 * The live shape, as the Railway GraphQL API (`backboard.railway.com/graphql/v2`) returns it for
 * an environment's service instances. Every field is nullable because the API answers `null` for
 * a setting left at its platform default — which is exactly the drift AC-9 wants reported.
 */
export const railwayServiceInstanceSchema = z.object({
  serviceName: z.string(),
  region: z.string().nullable().optional(),
  numReplicas: z.number().int().nullable().optional(),
  healthcheckPath: z.string().nullable().optional(),
  healthcheckTimeout: z.number().int().nullable().optional(),
  restartPolicyType: z.string().nullable().optional(),
  restartPolicyMaxRetries: z.number().int().nullable().optional(),
  startCommand: z.string().nullable().optional(),
});
export type RailwayServiceInstance = z.infer<
  typeof railwayServiceInstanceSchema
>;

/** The environment query's payload. Unknown fields are ignored, not rejected. */
export const railwayEnvironmentResponseSchema = z.object({
  data: z.object({
    environment: z.object({
      name: z.string(),
      serviceInstances: z.object({
        edges: z.array(z.object({ node: railwayServiceInstanceSchema })),
      }),
    }),
  }),
});
export type RailwayEnvironmentResponse = z.infer<
  typeof railwayEnvironmentResponseSchema
>;

/**
 * The variables query's payload: a map of key → value. The values are parsed as `unknown` on
 * purpose — nothing in this codebase has a use for them, and a type that cannot be printed is
 * the cheapest guarantee that they are not (AC-11).
 */
export const railwayVariablesResponseSchema = z.object({
  data: z.object({ variables: z.record(z.string(), z.unknown()) }),
});
export type RailwayVariablesResponse = z.infer<
  typeof railwayVariablesResponseSchema
>;

/** The service whose four §5.3 values AC-9 pins. */
export const WEB_SERVICE_NAME = "web";

/** One difference between the declaration and the live service. Values are configuration, never secrets. */
export interface ServiceMismatch {
  readonly field: string;
  readonly declared: string;
  readonly live: string;
}

const show = (value: unknown): string =>
  value === null || value === undefined ? "unset" : String(value);

/**
 * AC-9's four live values: region, replica count, healthcheck path and restart policy (type and
 * maximum retries, which are one policy). Returns one entry per difference, in a stable order.
 */
export function compareWebService(
  declared: RailwayDeployConfig,
  live: RailwayServiceInstance,
): ServiceMismatch[] {
  const rows: readonly (readonly [string, unknown, unknown])[] = [
    ["region", declared.region, live.region],
    ["numReplicas", declared.numReplicas, live.numReplicas],
    ["healthcheckPath", declared.healthcheckPath, live.healthcheckPath],
    ["restartPolicyType", declared.restartPolicyType, live.restartPolicyType],
    [
      "restartPolicyMaxRetries",
      declared.restartPolicyMaxRetries,
      live.restartPolicyMaxRetries,
    ],
  ];
  return rows
    .filter(
      ([, declaredValue, liveValue]) => show(declaredValue) !== show(liveValue),
    )
    .map(([field, declaredValue, liveValue]) => ({
      field,
      declared: show(declaredValue),
      live: show(liveValue),
    }));
}

/** Find a service instance by name, or `undefined` when the environment has no such service. */
export function findServiceInstance(
  response: RailwayEnvironmentResponse,
  serviceName: string,
): RailwayServiceInstance | undefined {
  return response.data.environment.serviceInstances.edges
    .map((edge) => edge.node)
    .find((node) => node.serviceName === serviceName);
}

/** The declared contract: AC-11's 28 keys, straight from the zod schemas. */
export const CONTRACT_VARIABLE_KEYS: readonly string[] = [...ENV_KEYS].sort();

/**
 * Four of the 28 are **platform-injected, not pasted**: Vercel sets them itself and
 * `docs/runbooks/vercel-setup.md` §6 says in as many words that they must stay unset in the env
 * store. Nothing on Railway injects them and nobody should type them there either, so they are
 * part of the declared contract but not required to be present — required-and-absent and
 * forbidden-but-tolerated are both wrong answers for a key whose whole job is to be supplied by a
 * host we are leaving (spec 040 §13 Q5).
 */
export const PLATFORM_INJECTED_CONTRACT_KEYS: readonly string[] = [
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_SHA",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
];

/** Every key an environment must actually carry: the contract minus the injected four. */
export const REQUIRED_VARIABLE_KEYS: readonly string[] =
  CONTRACT_VARIABLE_KEYS.filter(
    (key) => !PLATFORM_INJECTED_CONTRACT_KEYS.includes(key),
  );

/**
 * Keys an environment **may** carry beyond the contract. `STAGING_BASIC_AUTH` is spec 040 §12's
 * absent-means-off access switch: it is deliberately not one of the 28 (it is not read by the env
 * schemas and `pnpm env:check` therefore never asks for it), and it is expected on `staging` and
 * on every PR environment, where AC-25 requires the 401 wall.
 */
export const OPTIONAL_VARIABLE_KEYS: Readonly<
  Record<"production" | "staging" | "preview", readonly string[]>
> = Object.freeze({
  production: [],
  staging: [STAGING_BASIC_AUTH_KEY],
  preview: [STAGING_BASIC_AUTH_KEY],
});

/**
 * Names Railway injects into every environment. They are not part of the contract and must not be
 * reported as unexpected: `RAILWAY_*` (including the SHA and the replica region the health body
 * reports), and the port/host the standalone server binds to.
 */
const INJECTED_KEY_PREFIXES: readonly string[] = ["RAILWAY_"];
const INJECTED_KEYS: readonly string[] = ["PORT", "HOSTNAME", "NODE_ENV"];

function isInjected(key: string): boolean {
  return (
    INJECTED_KEYS.includes(key) ||
    INJECTED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/** `production`, `staging`, or `preview` for any PR environment (§5.3's environment table). */
export function environmentKind(
  environmentName: string,
): "production" | "staging" | "preview" {
  if (environmentName === "production") return "production";
  if (environmentName === "staging") return "staging";
  return "preview";
}

export interface VariableKeyReport {
  /** Declared but absent from the environment. */
  readonly missing: readonly string[];
  /** Present in the environment and in neither the contract nor the injected set. */
  readonly unexpected: readonly string[];
  readonly ok: boolean;
}

/**
 * AC-11: the live key set against the declared one, **names only**. `liveKeys` is what the caller
 * got from `Object.keys` of the API's variable map; no value is accepted by this signature, so
 * none can be reported by it.
 */
export function compareVariableKeys(
  liveKeys: readonly string[],
  environmentName: string,
): VariableKeyReport {
  const optional = OPTIONAL_VARIABLE_KEYS[environmentKind(environmentName)];
  const live = new Set(liveKeys);
  const missing = REQUIRED_VARIABLE_KEYS.filter((key) => !live.has(key)).sort();
  const unexpected = [...live]
    .filter(
      (key) =>
        !CONTRACT_VARIABLE_KEYS.includes(key) &&
        !optional.includes(key) &&
        !isInjected(key),
    )
    .sort();
  return {
    missing,
    unexpected,
    ok: missing.length === 0 && unexpected.length === 0,
  };
}

/*
 * ---------------------------------------------------------------------------------------------
 * Trigger branches (spec 040 §14 A3 change 6, AC-34, T-34 / T-35; TASK-155).
 *
 * Railway deploys each service from one trigger branch per environment, set in the dashboard.
 * Its config-as-code has no key for it, so the declaration lives in `config/deploy-triggers.json`,
 * which only our scripts read, and `pnpm railway:check` compares it with the public API's
 * `deploymentTriggers` (`environmentId`, `branch`). Production deploys only from `release`, which
 * only `pnpm release:promote` moves; `main` deploys to staging; no other environment may trigger
 * on `release`.
 * ---------------------------------------------------------------------------------------------
 */

/** Path of the trigger declaration, relative to the repository root. */
export const DEPLOY_TRIGGERS_PATH = "config/deploy-triggers.json";

/** The branch production deploys from, and the only one no other environment may use. */
export const RELEASE_BRANCH = "release";

/** The two branches a declared environment may follow (§14 A3 changes 1 and 2). */
export const deployBranches = [RELEASE_BRANCH, "main"] as const;
export type DeployBranch = (typeof deployBranches)[number];

/** The services AC-34 declares, in the order the check reports them. */
export const DEPLOY_SERVICES = ["web", "worker"] as const;
export type DeployService = (typeof DEPLOY_SERVICES)[number];

/**
 * Services that may be provisioned with **no repository source** (§5.3: `worker` is a seat, not
 * started until spec 002). With no repository there is no trigger, and no branch it could follow,
 * so there is nothing to check; F1 sets its trigger "if it has a source". `web` is never exempt:
 * a production `web` with no trigger is exactly the state AC-34 exists to report.
 */
export const SOURCE_OPTIONAL_SERVICES: readonly DeployService[] = ["worker"];

const serviceBranchesSchema = z.strictObject({
  web: z.enum(deployBranches),
  worker: z.enum(deployBranches),
});

/** `config/deploy-triggers.json` (T-35). Strict, so a misspelt environment or service fails. */
export const deployTriggersSchema = z.strictObject({
  $comment: z.string().optional(),
  production: serviceBranchesSchema,
  staging: serviceBranchesSchema,
});
export type DeployTriggers = z.infer<typeof deployTriggersSchema>;

/** The environments the declaration names, in report order. */
export const DECLARED_ENVIRONMENTS = ["production", "staging"] as const;

/**
 * The branch **every** staging trigger must follow, declared service or not (AC-34: "staging's
 * triggers on anything but `main`"). A staging `cron` or a trigger with no service on `release`
 * would ship an ungated commit to the release candidate, so it fails like `web` would.
 */
export const STAGING_BRANCH = "main";

/**
 * The branch every trigger of a declared environment must follow, including services the
 * declaration does not name (a `cron`, or a trigger with no service). Production deploys only
 * from `release` (§14 A3): a production `cron` on `main` would ship ungated commits, so it fails
 * like `web` would (`/break 110` round 2, hole 5).
 */
export const ENVIRONMENT_BRANCH: Readonly<
  Record<(typeof DECLARED_ENVIRONMENTS)[number], DeployBranch>
> = Object.freeze({ production: RELEASE_BRANCH, staging: STAGING_BRANCH });

/**
 * The trigger query's payload: every environment of the project, with its service instances (to
 * name a trigger's service, and to tell an absent service from one with no trigger) and its
 * deployment triggers. Field names and nullability are the live schema's (introspected
 * 2026-09-28): `branch` and `environmentId` are non-null, `serviceId` may be null.
 */
export const railwayTriggersResponseSchema = z.object({
  data: z.object({
    project: z.object({
      environments: z.object({
        edges: z.array(
          z.object({
            node: z.object({
              id: z.string(),
              name: z.string(),
              serviceInstances: z.object({
                edges: z.array(
                  z.object({
                    node: z.object({
                      serviceId: z.string(),
                      serviceName: z.string(),
                      source: z
                        .object({
                          repo: z.string().nullable().optional(),
                          image: z.string().nullable().optional(),
                        })
                        .nullable()
                        .optional(),
                    }),
                  }),
                ),
              }),
              deploymentTriggers: z.object({
                edges: z.array(
                  z.object({
                    node: z.object({
                      id: z.string(),
                      branch: z.string(),
                      environmentId: z.string(),
                      serviceId: z.string().nullable().optional(),
                    }),
                  }),
                ),
              }),
            }),
          }),
        ),
      }),
    }),
  }),
});
export type RailwayTriggersResponse = z.infer<
  typeof railwayTriggersResponseSchema
>;

/** Why a row failed: the service is not there, has no trigger, follows the wrong branch, or ships `release` outside production. */
export type TriggerFailure =
  "absent" | "no-trigger" | "wrong-branch" | "release-outside-production";

export interface TriggerRow {
  readonly environment: string;
  readonly service: string;
  /** The branches the live triggers follow; empty when there is none. */
  readonly live: readonly string[];
  /** The declared branch, or `not release` for an environment the declaration does not name. */
  readonly declared: string;
  readonly status: "match" | "not-checked" | TriggerFailure;
}

export interface TriggerReport {
  readonly ok: boolean;
  readonly rows: readonly TriggerRow[];
  /**
   * What `railway:check` prints: every row when all match, and **only the failing rows**
   * otherwise, so the red run of AC-42 is exactly its `triggers on none` lines.
   */
  readonly lines: readonly string[];
  /**
   * True only for the expected red of spec 040 AC-42, until TASK-104 creates production `web` on
   * `release`. All of these must hold: the check failed, the production environment is in the
   * response, its `web` row is absent, and every failure is a declared production service that
   * does not exist and has no live trigger. A service that exists with no trigger, a wrong branch,
   * or any staging failure is never this. The CLI also withholds the label when another check
   * failed (`failureVerdict`).
   */
  readonly onlyAbsentProductionServices: boolean;
}

/** `<environment> · <service> · triggers on <live>, declared <declared>` (AC-34's line). */
export function formatTriggerRow(row: TriggerRow): string {
  if (row.status === "not-checked") {
    return `${row.environment} · ${row.service} · no repository source, not checked`;
  }
  const live = row.live.length === 0 ? "none" : row.live.join(", ");
  return `${row.environment} · ${row.service} · triggers on ${live}, declared ${row.declared}`;
}

/**
 * AC-34's comparison, pure. Triggers are grouped by their own `environmentId` (the field the
 * spec names), not by where the response nests them, and named by the instance whose `serviceId`
 * they carry.
 */
export function compareDeployTriggers(
  declared: DeployTriggers,
  response: RailwayTriggersResponse,
): TriggerReport {
  const environments = response.data.project.environments.edges.map(
    (edge) => edge.node,
  );
  const environmentName = new Map(
    environments.map((env) => [env.id, env.name]),
  );
  const serviceName = new Map(
    environments.flatMap((env) =>
      env.serviceInstances.edges.map(
        (edge) => [edge.node.serviceId, edge.node.serviceName] as const,
      ),
    ),
  );
  // environment name → service name → live branches
  const live = new Map<string, Map<string, string[]>>();
  for (const trigger of environments.flatMap((env) =>
    env.deploymentTriggers.edges.map((edge) => edge.node),
  )) {
    const environment =
      environmentName.get(trigger.environmentId) ??
      `environment ${trigger.environmentId}`;
    const service =
      trigger.serviceId === null || trigger.serviceId === undefined
        ? "(no service)"
        : (serviceName.get(trigger.serviceId) ??
          `service ${trigger.serviceId}`);
    const byService = live.get(environment) ?? new Map<string, string[]>();
    byService.set(service, [...(byService.get(service) ?? []), trigger.branch]);
    live.set(environment, byService);
  }

  const rows: TriggerRow[] = [];
  for (const environment of DECLARED_ENVIRONMENTS) {
    const instances =
      environments
        .find((env) => env.name === environment)
        ?.serviceInstances.edges.map((edge) => edge.node) ?? [];
    for (const service of DEPLOY_SERVICES) {
      const want = declared[environment][service];
      const branches = [...(live.get(environment)?.get(service) ?? [])].sort();
      const instance = instances.find((node) => node.serviceName === service);
      const hasRepository =
        typeof instance?.source?.repo === "string" &&
        instance.source.repo !== "";
      // Exact: one trigger, on the declared branch. A live trigger is judged before absence, so a
      // service Railway still deploys from `main` is a wrong branch even if no instance is listed.
      let status: TriggerRow["status"];
      if (branches.length === 1 && branches[0] === want) status = "match";
      else if (branches.length > 0) status = "wrong-branch";
      else if (instance === undefined) status = "absent";
      else if (!hasRepository && SOURCE_OPTIONAL_SERVICES.includes(service))
        status = "not-checked";
      else status = "no-trigger";
      rows.push({
        environment,
        service,
        live: branches,
        declared: want,
        status,
      });
    }
  }

  // Triggers beyond the declared services, in production and staging: every one must follow
  // the environment's branch (`release` and `main`).
  const declaredServices: readonly string[] = DEPLOY_SERVICES;
  for (const environment of DECLARED_ENVIRONMENTS) {
    const want = ENVIRONMENT_BRANCH[environment];
    for (const [service, branches] of [
      ...(live.get(environment) ?? new Map<string, string[]>()),
    ].sort(([a], [b]) => a.localeCompare(b))) {
      if (declaredServices.includes(service)) continue;
      if (branches.every((branch) => branch === want)) continue;
      rows.push({
        environment,
        service,
        live: [...branches].sort(),
        declared: want,
        status: "wrong-branch",
      });
    }
  }

  const declaredNames: readonly string[] = DECLARED_ENVIRONMENTS;
  for (const [environment, byService] of [...live].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (declaredNames.includes(environment)) continue;
    for (const [service, branches] of [...byService].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!branches.includes(RELEASE_BRANCH)) continue;
      rows.push({
        environment,
        service,
        live: [...branches].sort(),
        declared: `not ${RELEASE_BRANCH}`,
        status: "release-outside-production",
      });
    }
  }

  const failing = rows.filter(
    (row) => row.status !== "match" && row.status !== "not-checked",
  );
  const ok = failing.length === 0;
  return {
    ok,
    rows,
    lines: (ok ? rows : failing).map(formatTriggerRow),
    onlyAbsentProductionServices:
      !ok &&
      environments.some((env) => env.name === "production") &&
      rows.some(
        (row) =>
          row.environment === "production" &&
          row.service === WEB_SERVICE_NAME &&
          row.status === "absent",
      ) &&
      failing.every(
        (row) => row.environment === "production" && row.status === "absent",
      ),
  };
}
