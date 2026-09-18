/**
 * Server environment (spec 001 §5.2, TASK-005; lazy since spec 001 §14 A16, TASK-135).
 *
 * `import "server-only"` makes any client-bundle import of this module a build error, which is
 * the mechanical form of "import of a server variable from a client bundle fails" (spec 001 §5).
 * Client components read `@/lib/env.client`.
 *
 * **The parse happens on the first read, not at module load.** `next build` imports every route
 * module to collect its configuration, so a module-load `parseEnv(process.env)` made the whole
 * server contract — `DATABASE_URL`, the R2 credentials, `INTERNAL_CRON_SECRET` — a *build*
 * requirement through any route that imported this file, which is exactly what the credential-free
 * container build of spec 040 §5.3 cannot have (Railway build log, 2026-09-18). Reading a value
 * still throws `EnvValidationError` naming the keys and printing no value, and
 * `instrumentation.ts` asserts the same keys at server start, so nothing is served by a process
 * whose environment is incomplete: the assertion moved, it did not disappear.
 */
import "server-only";

import {
  ENV_KEYS,
  type ClientEnv,
  type DeploymentEnvironment,
  type ServerEnv,
  appEnvironment,
  parseEnv,
  serverEnvSchema,
} from "./env.schema";

let parsed: { client: ClientEnv; server: ServerEnv } | undefined;

/** Parse once, on first read, and keep the result: the environment is read many times per request. */
function values(): { client: ClientEnv; server: ServerEnv } {
  parsed ??= parseEnv(process.env);
  return parsed;
}

/**
 * A frozen object whose keys are fixed at module load and whose *values* are read through the
 * parse above. `Object.keys()`, spreads and destructuring all behave as they did when this was a
 * plain frozen object; the only difference is when the validation runs.
 */
function view<T extends object>(
  keys: readonly string[],
  read: (source: {
    client: ClientEnv;
    server: ServerEnv;
  }) => Record<string, unknown>,
): Readonly<T> {
  const target: Record<string, unknown> = {};
  for (const key of keys) {
    Object.defineProperty(target, key, {
      enumerable: true,
      get: () => read(values())[key],
    });
  }
  return Object.freeze(target) as Readonly<T>;
}

const serverKeys = Object.keys(serverEnvSchema.shape);

export const serverEnv: Readonly<ServerEnv> = view<ServerEnv>(
  serverKeys,
  (source) => source.server as unknown as Record<string, unknown>,
);

export const env: Readonly<ServerEnv & ClientEnv> = view<ServerEnv & ClientEnv>(
  ENV_KEYS,
  (source) =>
    ({ ...source.server, ...source.client }) as unknown as Record<
      string,
      unknown
    >,
);

/**
 * The resolved environment (spec 040 §5.2): `APP_ENV`, else the `VERCEL_ENV` fallback. Eager,
 * because it depends on `APP_ENV` alone — a build key, already graded by `assertBuildEnv()` — and
 * because a great deal of module-scope code reads it as a value.
 */
export const environment: DeploymentEnvironment = appEnvironment(process.env);

export { appEnvironment };
