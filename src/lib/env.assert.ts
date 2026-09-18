/**
 * Env gates (spec 001 §5.2, AC-10, TASK-005; split by spec 001 §14 A16 / spec 040 §14 A1,
 * TASK-135).
 *
 * Two gates, because a build and a running server consume different halves of the contract:
 *
 *  - `assertBuildEnv()` — `APP_ENV` + the `NEXT_PUBLIC_*` set (`BUILD_ENV_KEYS`). Called from
 *    `next.config.ts`, so a missing key the build *inlines* still fails `pnpm build` before
 *    anything is compiled. It demands no credential, which is what makes `docker build` work with
 *    an empty environment: the ten server keys are not — and must never be — build arguments,
 *    since a build argument is recoverable from the build stage's layer history.
 *  - `assertRuntimeEnv()` — the server-only keys (`RUNTIME_ENV_KEYS`). Called at server start from
 *    `instrumentation.ts`, where the values exist. A miss fails `/api/health` and therefore the
 *    Railway healthcheck, so the deployment never takes traffic: the same fail-closed intent as
 *    AC-10, one step later than the build. It lives in `env.schema.ts`, not here, because
 *    `instrumentation.ts` is bundled for the **edge** runtime too and this module's `@next/env`
 *    loader is a Node API; at server start Next has already loaded the `.env*` files anyway.
 *
 * Imported by `next.config.ts`, therefore loaded in plain Node before Next compiles anything.
 * Keep it free of `server-only`, of React and of any `src/` import other than the schema.
 *
 * `.env`/`.env.local` are loaded explicitly with `@next/env` (the loader Next itself uses) so the
 * gate does not depend on whether Next has already populated `process.env` at config-load time.
 */
import { loadEnvConfig } from "@next/env";

import {
  type DeploymentEnvironment,
  type EnvSource,
  EnvValidationError,
  appEnvironment,
  formatEnvIssues,
  validateBuildEnv,
  validateEnv,
} from "./env.schema";

/**
 * The environment to label a *failure* report with. `appEnvironment()` itself throws when
 * `APP_ENV` is present and unparseable (spec 040 AC-1) — and that is exactly the case this
 * function is called in — so the label falls back to `development` rather than replacing the
 * report, which already names `APP_ENV` as an issue.
 */
function environmentFor(source: EnvSource): DeploymentEnvironment {
  try {
    return appEnvironment(source);
  } catch {
    return "development";
  }
}

let loaded = false;

function loadDotEnvFiles(): void {
  if (loaded) return;
  loaded = true;
  // `dev = false`: `next build` and `next start` semantics (`.env.production.local` > `.env.local`).
  loadEnvConfig(process.cwd(), false, {
    info: () => undefined,
    error: () => undefined,
  });
}

/**
 * Validate the keys the **build** consumes (`BUILD_ENV_KEYS`). Throws `EnvValidationError` naming
 * the offending keys and printing no value. Called from `next.config.ts`, so a missing variable
 * the build inlines fails `pnpm build` before anything is compiled (AC-10 for that half).
 *
 * It deliberately says nothing about `DATABASE_URL`, the R2 credentials or `INTERNAL_CRON_SECRET`:
 * a build neither reads nor embeds them, and requiring them would force a container build to be
 * handed secrets it has no business holding (spec 001 §14 A16; Railway build log, 2026-09-18).
 */
export function assertBuildEnv(source: NodeJS.ProcessEnv = process.env): void {
  loadDotEnvFiles();
  const result = validateBuildEnv(source);
  if (result.issues.length > 0) {
    throw new EnvValidationError(result.issues, environmentFor(source));
  }
}

/**
 * Validate `process.env` against the **whole** contract, both halves. Used by scripts and by the
 * module-load parse of `env.server.ts`; `next.config.ts` calls `assertBuildEnv()` instead.
 */
export function assertEnv(source: NodeJS.ProcessEnv = process.env): void {
  loadDotEnvFiles();
  const result = validateEnv(source);
  if (result.issues.length > 0) {
    throw new EnvValidationError(result.issues, environmentFor(source));
  }
}

/** `assertEnv` as a report instead of a throw, for scripts that print and exit. */
export function envReport(
  source: NodeJS.ProcessEnv = process.env,
): string | undefined {
  loadDotEnvFiles();
  const result = validateEnv(source);
  if (result.issues.length === 0) return undefined;
  return formatEnvIssues(result.issues, environmentFor(source));
}
