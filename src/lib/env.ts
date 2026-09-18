/**
 * Env barrel (spec 001 §5.2, TASK-005).
 *
 * Server code imports `@/lib/env`:
 *   import { env } from "@/lib/env";        // server + NEXT_PUBLIC_* variables
 * Client components import `@/lib/env.client` instead:
 *   import { clientEnv } from "@/lib/env.client";
 *
 * This module re-exports `env.server`, which is marked `server-only`; importing it from a client
 * bundle is therefore a build error rather than a leak. Schemas and pure helpers live in
 * `env.schema.ts` (no Next, no `server-only`) so `next.config.ts` and `scripts/env-check.ts` can
 * use them.
 */
export { clientEnv } from "./env.client";
export { env, environment, serverEnv } from "./env.server";
export { assertBuildEnv, assertEnv, envReport } from "./env.assert";
export {
  APP_ENV_KEY,
  BUILD_ENV_KEYS,
  ENV_KEYS,
  RUNTIME_ENV_KEYS,
  EnvValidationError,
  NEXT_PUBLIC_APP_ENV_KEY,
  type ClientEnv,
  type DeploymentEnvironment,
  type EnvIssue,
  type HostPlatform,
  type LogLevel,
  type ServerEnv,
  appEnvironment,
  assertRuntimeEnv,
  clientEnvSchema,
  commitSha,
  deploymentEnvironment,
  deploymentRegion,
  formatEnvIssues,
  hostPlatform,
  serverEnvSchema,
  validateBuildEnv,
  validateEnv,
  validateRuntimeEnv,
} from "./env.schema";
