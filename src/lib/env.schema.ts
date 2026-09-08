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
  "http://localhost:3000",
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
  /**
   * Commit SHA, readable from the browser bundle: the Sentry release for client events
   * (TASK-007). `VERCEL_GIT_COMMIT_SHA` is server-side only, so without this mirror browser
   * events would have no release. Optional: absent locally.
   */
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: optionalText,
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
  /**
   * Documented escape hatch for spec 001 only (TASK-007).
   *
   * Spec 001 §5/§12 require a production deploy from `main` on `*.vercel.app`, but the real
   * Supabase and cron values only arrive with spec 002, so production must run on the
   * `.env.example` placeholders for now. Rather than weaken the placeholder rule, production
   * opts in explicitly with `ALLOW_PLACEHOLDER_ENV=true` in the Vercel env store; `assertEnv()`
   * logs one `warn` line when it is honoured. Spec 002 deletes this key together with the
   * placeholders. Only the exact string `"true"` is accepted, so a typo cannot half-enable it.
   */
  ALLOW_PLACEHOLDER_ENV: z.preprocess(
    emptyToUndefined,
    z.literal("true").optional(),
  ),
  /**
   * Add the `en-XA` / `ar-XB` pseudo-locales to the routing table (spec 003 §2 "Pseudo-locales",
   * §8 "Security", §13 Q6, AC-29; TASK-042). `"true"` on a preview — that is where Playwright's
   * visual and a11y suites run — and locally; **refused in `production`** by `validateEnv()`
   * below, so a pseudo-locale route cannot reach a buyer through a configuration mistake.
   * Absent counts as `"false"`, so production needs no value at all.
   */
  ENABLE_PSEUDO_LOCALES: z.preprocess(
    emptyToUndefined,
    z.enum(["true", "false"]).optional(),
  ),
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

/** The one accepted value of the `ALLOW_PLACEHOLDER_ENV` escape hatch. */
export const PLACEHOLDER_HATCH_VALUE = "true" as const;

/**
 * Whether the placeholder escape hatch is in force. Anything other than the exact string
 * `"true"` is not the hatch (and is rejected by `serverEnvSchema` as well).
 */
export function placeholderHatchEnabled(source: EnvSource): boolean {
  return source["ALLOW_PLACEHOLDER_ENV"] === PLACEHOLDER_HATCH_VALUE;
}

/**
 * `preview`/`production` come from `VERCEL_ENV`, everything else is `development`/`test`.
 *
 * Note (TASK-007, review of PR #6): on the ADR-0012 fallback host (Railway + Cloudflare)
 * `VERCEL_ENV` is unset, so this returns `development` and the global `X-Robots-Tag: noindex` of
 * spec 001 §5 keeps firing. That is the safe direction — an unindexed production beats an
 * indexed staging — and it is correct for all of Phase 0, where every deploy is `noindex`
 * anyway (§12). The host-independent signal (an explicit `APP_ENV` set by whichever platform
 * runs the app) belongs to the spec that first makes a page indexable, and must land before the
 * first indexable deploy on the fallback host. No behaviour change here.
 */
export function deploymentEnvironment(
  source: EnvSource,
): DeploymentEnvironment {
  const vercelEnv = source["VERCEL_ENV"];
  if (vercelEnv === "preview" || vercelEnv === "production") return vercelEnv;
  return source["NODE_ENV"] === "test" ? "test" : "development";
}

/** The key that switches the pseudo-locales on, and its only enabling value. */
export const PSEUDO_LOCALES_KEY = "ENABLE_PSEUDO_LOCALES" as const;

/**
 * Whether the `en-XA` / `ar-XB` pseudo-locales are part of the locale registry
 * (`src/config/locales.ts`). Pure: the caller passes the environment, nothing is read here.
 * Anything other than the exact string `"true"` is off, so a typo cannot half-enable them, and
 * `validateEnv()` refuses `"true"` in production regardless.
 */
export function pseudoLocalesEnabled(source: EnvSource): boolean {
  return source[PSEUDO_LOCALES_KEY] === "true";
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

  // §8 "Security" / AC-29: pseudo-locales are a *development* affordance. Refusing them here —
  // in the gate `next.config.ts` runs before compiling anything — is what makes "a pseudo-locale
  // route cannot be exposed to buyers by configuration mistake" a build failure rather than a
  // code review. Checked against `production` only: a preview is password-protected and
  // `noindex`, and is where the visual and a11y suites run (§13 Q6).
  if (environment === "production" && pseudoLocalesEnabled(source)) {
    issues.push({
      key: PSEUDO_LOCALES_KEY,
      message:
        "must not be `true` in production: the en-XA/ar-XB pseudo-locales are refused there (spec 003 §2, §8). Unset it or set it to `false`.",
    });
  }

  if (environment === "preview" || environment === "production") {
    // `ALLOW_PLACEHOLDER_ENV=true` suspends the placeholder rule (spec 001 only, TASK-007).
    // Everything else about the deployed environments still applies, including https origins.
    if (!placeholderHatchEnabled(source)) {
      for (const key of REAL_VALUE_REQUIRED) {
        const value = source[key];
        if (value !== undefined && placeholders.has(value)) {
          issues.push({
            key,
            message: `must be a real value in ${environment}, not the .env.example placeholder`,
          });
        }
      }
    }
    // The hatch covers the committed `http://localhost:3000` origin too (it is one of the
    // placeholders); a real non-https origin is still rejected in a deployed environment.
    const siteUrl = source["NEXT_PUBLIC_SITE_URL"];
    const siteUrlExempt =
      placeholderHatchEnabled(source) &&
      siteUrl !== undefined &&
      placeholders.has(siteUrl);
    if (
      siteUrl !== undefined &&
      !siteUrlExempt &&
      !siteUrl.startsWith("https://")
    ) {
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
