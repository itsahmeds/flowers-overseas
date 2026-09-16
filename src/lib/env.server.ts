/**
 * Server environment (spec 001 §5.2, TASK-005).
 *
 * `import "server-only"` makes any client-bundle import of this module a build error, which is
 * the mechanical form of "import of a server variable from a client bundle fails" (spec 001 §5).
 * Client components read `@/lib/env.client`.
 */
import "server-only";

import {
  type ClientEnv,
  type DeploymentEnvironment,
  type ServerEnv,
  appEnvironment,
  parseEnv,
} from "./env.schema";

const parsed = parseEnv(process.env);

/** Frozen at module load: nothing can mutate the environment after validation. */
export const serverEnv: Readonly<ServerEnv> = Object.freeze(parsed.server);
export const env: Readonly<ServerEnv & ClientEnv> = Object.freeze({
  ...parsed.server,
  ...parsed.client,
});

/** The resolved environment (spec 040 §5.2): `APP_ENV`, else the `VERCEL_ENV` fallback. */
export const environment: DeploymentEnvironment = parsed.environment;

export { appEnvironment };
