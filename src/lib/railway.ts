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

import { ENV_KEYS } from "./env.schema";
import { STAGING_BASIC_AUTH_KEY } from "./basic-auth";

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
