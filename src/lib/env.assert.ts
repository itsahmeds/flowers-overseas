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
  type EnvSource,
  EnvValidationError,
  deploymentEnvironment,
  formatEnvIssues,
  placeholderHatchEnabled,
  validateEnv,
} from "./env.schema";
import { createLogger } from "./logger";

let loaded = false;
let hatchWarned = false;

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
 * One `warn` line, at most once per process, when `ALLOW_PLACEHOLDER_ENV=true` suspends the
 * placeholder rule in a deployed environment (TASK-007). The hatch exists for spec 001 only, so
 * it must be visible in the deploy log rather than silent. `write` is injected in tests.
 */
export function warnOnPlaceholderHatch(
  source: EnvSource = process.env,
  write?: (line: string) => void,
): void {
  const environment = deploymentEnvironment(source);
  if (environment !== "preview" && environment !== "production") return;
  if (!placeholderHatchEnabled(source)) return;
  // Once per process. `next build` loads `next.config.ts` in more than one process, so a build
  // prints one line per process rather than one line in total — still not a per-request log.
  if (hatchWarned) return;
  hatchWarned = true;
  createLogger({
    level: "warn",
    pretty: false,
    ...(write ? { write } : {}),
  }).warn(
    { environment, key: "ALLOW_PLACEHOLDER_ENV" },
    "ALLOW_PLACEHOLDER_ENV=true: .env.example placeholder values accepted in a deployed environment (spec 001 only; spec 002 removes this hatch)",
  );
}

/**
 * Validate `process.env`. Throws `EnvValidationError` naming the offending keys and printing no
 * value. Called from `next.config.ts`, so a missing variable fails `pnpm build`.
 */
export function assertEnv(source: NodeJS.ProcessEnv = process.env): void {
  loadDotEnvFiles();
  warnOnPlaceholderHatch(source);
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
  warnOnPlaceholderHatch(source);
  const result = validateEnv(source);
  if (result.issues.length === 0) return undefined;
  return formatEnvIssues(result.issues, deploymentEnvironment(source));
}
