/**
 * Environment contract (spec 001 §5.2, AC-10 / AC-11, TASK-005).
 *
 * One place defines the keys, their zod shapes and their per-environment requiredness:
 *  - `clientEnvSchema` — `NEXT_PUBLIC_*` only. Inlined into the browser bundle by Next.
 *  - `serverEnvSchema` — everything else. Never reaches the browser (see `env.server.ts`).
 *
 * `assertEnv()` is called from `next.config.ts` so `pnpm build` fails before compiling anything
 * when a variable is missing or malformed. Error messages name the offending keys and **never**
 * echo a value (AC-10, spec 001 §8 "Logs / PII").
 *
 * `scripts/env-check.ts` compares `ENV_KEYS` below with `.env.example` in both directions
 * (AC-11), so a new key cannot be added to one without the other.
 *
 * This module must stay free of `server-only` and of any Next runtime import: `next.config.ts`
 * loads it in plain Node.
 */
import { z } from "zod";

/** Deployment environment. `VERCEL_ENV` when on Vercel, otherwise derived from `NODE_ENV`. */
export const deploymentEnvironments = [
  "development",
  "test",
  "preview",
  "production",
] as const;
export type DeploymentEnvironment = (typeof deploymentEnvironments)[number];

/**
 * Values `.env.example` ships (spec 001 §13 Q10: syntactically valid dummies so a clean clone
 * builds). Accepted in `development`/`test`, rejected in `preview`/`production` — that is the
 * "per-environment requiredness" of §5.
 */
export const PLACEHOLDER_VALUES = [
  "https://placeholder.supabase.co",
  "placeholder-anon-key",
  "placeholder-service-role-key",
  "postgres://user:pass@localhost:5432/fo",
  "placeholder-cron-secret",
] as const;

const placeholders: ReadonlySet<string> = new Set(PLACEHOLDER_VALUES);

/** Treat `KEY=` (present but empty) as absent, so optional keys can ship blank in `.env.example`. */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const requiredUrl = z.url();
const requiredSecret = z.string().min(1);

const logLevels = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
export type LogLevel = (typeof logLevels)[number];

export const clientEnvSchema = z.object({
  /** Absolute origin of the site. Used for canonicals and absolute URLs from spec 007. */
  NEXT_PUBLIC_SITE_URL: requiredUrl,
  /** Supabase project URL (public). Real value in the Vercel env store. */
  NEXT_PUBLIC_SUPABASE_URL: requiredUrl,
  /** Supabase anon key (public, RLS-protected). */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredSecret,
  /** Mirror of `VERCEL_ENV` for client code. Optional: unset locally. */
  NEXT_PUBLIC_VERCEL_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(deploymentEnvironments).optional(),
  ),
  /** Browser Sentry DSN. Unset ⇒ the browser SDK is a no-op (spec 001 §5, AC-13). */
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
});

export const serverEnvSchema = z.object({
  /** Postgres connection string. Placeholder until spec 002 provisions Supabase. */
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      message: "must be a postgres:// connection string",
    }),
  /** Supabase service-role key. Server only: bypasses RLS. */
  SUPABASE_SERVICE_ROLE_KEY: requiredSecret,
  /** Server/edge Sentry DSN. Unset ⇒ no-op (spec 001 §5, AC-13). */
  SENTRY_DSN: optionalUrl,
  /** Source-map upload token. CI only, never needed for a local or preview build. */
  SENTRY_AUTH_TOKEN: optionalText,
  /** Shared secret for internal cron/job endpoints. Placeholder until jobs exist. */
  INTERNAL_CRON_SECRET: requiredSecret,
  /** Logger threshold (`src/lib/logger.ts`). */
  LOG_LEVEL: z.enum(logLevels).default("info"),
  /** Injected by Vercel; read-through only. Absent locally. */
  VERCEL_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(deploymentEnvironments).optional(),
  ),
  /** Injected by Vercel; the Sentry release. Absent locally. */
  VERCEL_GIT_COMMIT_SHA: optionalText,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Every key the schemas know, sorted. The contract `scripts/env-check.ts` enforces (AC-11). */
export const ENV_KEYS: readonly string[] = [
  ...Object.keys(clientEnvSchema.shape),
  ...Object.keys(serverEnvSchema.shape),
].sort();

/** Keys that must carry a real value once deployed (not a `.env.example` placeholder). */
const REAL_VALUE_REQUIRED = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INTERNAL_CRON_SECRET",
] as const;

export type EnvSource = Readonly<Record<string, string | undefined>>;

export function deploymentEnvironment(
  source: EnvSource,
): DeploymentEnvironment {
  const vercelEnv = source["VERCEL_ENV"];
  if (vercelEnv === "preview" || vercelEnv === "production") return vercelEnv;
  return source["NODE_ENV"] === "test" ? "test" : "development";
}

/** A validation problem. `key` is safe to print; values are never captured. */
export interface EnvIssue {
  readonly key: string;
  readonly message: string;
}

export interface EnvValidationResult {
  readonly issues: readonly EnvIssue[];
  readonly client: ClientEnv | undefined;
  readonly server: ServerEnv | undefined;
}

/**
 * Defence in depth for AC-10: zod messages describe the shape ("expected string, received
 * undefined", "Invalid URL") and never the received value, but a custom `refine` message or a
 * future zod release could. Any substring equal to an actual environment value is replaced, so no
 * value can reach stdout even if a message is changed later.
 */
export function scrubValues(message: string, source: EnvSource): string {
  let scrubbed = message;
  for (const value of Object.values(source)) {
    if (typeof value !== "string" || value.length < 4) continue;
    while (scrubbed.includes(value))
      scrubbed = scrubbed.replace(value, "[redacted]");
  }
  return scrubbed;
}

function collect(error: z.ZodError, source: EnvSource): EnvIssue[] {
  return error.issues.map((issue) => ({
    key: issue.path.map(String).join(".") || "(unknown)",
    message: scrubValues(issue.message, source),
  }));
}

/**
 * Validate a raw environment. Pure: no `process.env` read, no throw, no value in the output.
 */
export function validateEnv(source: EnvSource): EnvValidationResult {
  const environment = deploymentEnvironment(source);
  const issues: EnvIssue[] = [];

  const clientResult = clientEnvSchema.safeParse(source);
  if (!clientResult.success)
    issues.push(...collect(clientResult.error, source));

  const serverResult = serverEnvSchema.safeParse(source);
  if (!serverResult.success)
    issues.push(...collect(serverResult.error, source));

  if (environment === "preview" || environment === "production") {
    for (const key of REAL_VALUE_REQUIRED) {
      const value = source[key];
      if (value !== undefined && placeholders.has(value)) {
        issues.push({
          key,
          message: `must be a real value in ${environment}, not the .env.example placeholder`,
        });
      }
    }
    const siteUrl = source["NEXT_PUBLIC_SITE_URL"];
    if (siteUrl !== undefined && !siteUrl.startsWith("https://")) {
      issues.push({
        key: "NEXT_PUBLIC_SITE_URL",
        message: `must use https in ${environment}`,
      });
    }
  }

  return {
    issues,
    client: clientResult.success ? clientResult.data : undefined,
    server: serverResult.success ? serverResult.data : undefined,
  };
}

/** Human-readable, value-free report (AC-10). */
export function formatEnvIssues(
  issues: readonly EnvIssue[],
  environment: DeploymentEnvironment,
): string {
  const lines = [
    `Invalid environment (${environment}). ${String(issues.length)} problem(s); values are never printed:`,
    ...issues.map((issue) => `  - ${issue.key}: ${issue.message}`),
    "Fix .env.local (see .env.example) or the Vercel env store, then rebuild.",
  ];
  return lines.join("\n");
}

export class EnvValidationError extends Error {
  readonly keys: readonly string[];

  constructor(issues: readonly EnvIssue[], environment: DeploymentEnvironment) {
    super(formatEnvIssues(issues, environment));
    this.name = "EnvValidationError";
    this.keys = issues.map((issue) => issue.key);
  }
}

/**
 * Throw `EnvValidationError` unless `source` satisfies both schemas. Used by `assertEnv()` and by
 * the module-load parse in `env.server.ts` / `env.client.ts`.
 */
export function parseEnv(source: EnvSource): {
  client: ClientEnv;
  server: ServerEnv;
  environment: DeploymentEnvironment;
} {
  const environment = deploymentEnvironment(source);
  const result = validateEnv(source);
  if (result.issues.length > 0 || !result.client || !result.server) {
    throw new EnvValidationError(result.issues, environment);
  }
  return { client: result.client, server: result.server, environment };
}
