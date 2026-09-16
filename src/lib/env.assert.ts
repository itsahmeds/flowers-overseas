/**
 * Build-time env gate (spec 001 §5.2, AC-10, TASK-005).
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
 * Validate `process.env`. Throws `EnvValidationError` naming the offending keys and printing no
 * value. Called from `next.config.ts`, so a missing variable fails `pnpm build`.
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
