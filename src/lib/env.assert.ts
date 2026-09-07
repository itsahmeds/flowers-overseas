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
  EnvValidationError,
  deploymentEnvironment,
  formatEnvIssues,
  validateEnv,
} from "./env.schema";

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
    throw new EnvValidationError(result.issues, deploymentEnvironment(source));
  }
}

/** `assertEnv` as a report instead of a throw, for scripts that print and exit. */
export function envReport(
  source: NodeJS.ProcessEnv = process.env,
): string | undefined {
  loadDotEnvFiles();
  const result = validateEnv(source);
  if (result.issues.length === 0) return undefined;
  return formatEnvIssues(result.issues, deploymentEnvironment(source));
}
