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
  "postgres://user:pass@localhost:5432/fo",
  "postgres://user:pass@localhost:5432/fo_direct",
  "placeholder-cron-secret",
  "00000000000000000000000000000000",
  "placeholder-bucket",
  "placeholder-backups-bucket",
  "https://00000000000000000000000000000000.eu.r2.cloudflarestorage.com",
  "https://placeholder.r2.dev",
  "placeholder-r2-access-key-id",
  "placeholder-r2-secret-access-key",
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

/** A Postgres connection string. Shape only: no host, user or database name is prescribed. */
const postgresUrl = z
  .string()
  .min(1)
  .refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: "must be a postgres:// connection string",
  });

/** An `https://` URL. `http` is refused everywhere, not only in deployed environments. */
const httpsUrl = z.url().refine((value) => value.startsWith("https://"), {
  message: "must use https",
});

/** An S3/R2 bucket name: lowercase letters, digits and dashes, 3–63 characters. */
const bucketName = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
    "must be a bucket name: 3-63 lowercase letters, digits or dashes",
  );

const logLevels = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
export type LogLevel = (typeof logLevels)[number];

export const clientEnvSchema = z.object({
  /** Absolute origin of the site. Used for canonicals and absolute URLs from spec 007. */
  NEXT_PUBLIC_SITE_URL: requiredUrl,
  /** Mirror of `VERCEL_ENV` for client code. Optional: unset locally. */
  NEXT_PUBLIC_VERCEL_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(deploymentEnvironments).optional(),
  ),
  /** Browser Sentry DSN. Unset ⇒ the browser SDK is a no-op (spec 001 §5, AC-13). */
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  /**
   * GA4 measurement id (spec 004 §2, §5.2, AC-21; TASK-050). **Optional, and unset everywhere in
   * Phase 0** — CI, local and preview — which is what makes "no third-party script loads at all"
   * a testable fact rather than a claim: with no id there is no tag element, so no request to
   * `googletagmanager.com` can be made.
   *
   * Setting it is a **RoPA-affecting act**: Google becomes an active processor
   * (`docs/compliance/ropa.md` row 4) and the privacy policy must already name it. The shape is
   * pinned so a container id (`GTM-…`) or a Universal Analytics property (`UA-…`) cannot be
   * pasted in by mistake — either would load a tag that ignores Consent Mode v2's defaults in a
   * way we have not tested.
   */
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(
        /^G-[A-Z0-9]{6,16}$/,
        "must be a GA4 measurement id, `G-XXXXXXXXXX`",
      )
      .optional(),
  ),
  /**
   * Commit SHA, readable from the browser bundle: the Sentry release for client events
   * (TASK-007). `VERCEL_GIT_COMMIT_SHA` is server-side only, so without this mirror browser
   * events would have no release. Optional: absent locally.
   */
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: optionalText,
});

export const serverEnvSchema = z.object({
  /**
   * Pooled Postgres connection string — Neon, Frankfurt `aws-eu-central-1`, PgBouncer transaction
   * mode (spec 002 §2, AC-1, ADR-0015). Every web request uses this one; `src/lib/db.ts` (spec 002,
   * TASK-014) is the only module allowed to construct a client from it.
   */
  DATABASE_URL: postgresUrl,
  /**
   * Direct (unpooled) Postgres connection string for the same database — migrations, `db:check`,
   * pg-boss and the nightly backup workflow, none of which may run through a transaction-mode
   * pooler (spec 002 §2, AC-1). Separate key rather than a derived string: Neon's pooled and
   * direct hostnames differ, and deriving one from the other silently breaks on a provider change.
   */
  DATABASE_URL_UNPOOLED: postgresUrl,
  /**
   * Cloudflare account id that owns the R2 buckets — the 32-hex prefix of the S3 endpoint
   * (spec 002 §2 "Jobs, storage seam, probes", ADR-0015). Shape-checked so a token, a bucket name
   * or a full URL pasted here fails the build instead of producing 401s at runtime.
   */
  R2_ACCOUNT_ID: z
    .string()
    .regex(
      /^[0-9a-f]{32}$/,
      "must be the 32-character hex Cloudflare account id",
    ),
  /** Public media bucket (EU jurisdiction). Images and their variants; no database bytes. */
  R2_BUCKET: bucketName,
  /**
   * Private bucket for the nightly `pg_dump` artefacts, 30-day lifecycle rule (spec 002 AC-25).
   * Never public: the dump contains personal data once real orders exist.
   */
  R2_BACKUPS_BUCKET: bucketName,
  /** S3-compatible endpoint of the account, `https://<account>.eu.r2.cloudflarestorage.com`. */
  R2_S3_ENDPOINT: httpsUrl,
  /** R2 access key id of the scoped `flowersoverseas-app` token (object read/write). SECRET. */
  R2_ACCESS_KEY_ID: requiredSecret,
  /** R2 secret access key of the same token. SECRET — never logged, never in an error message. */
  R2_SECRET_ACCESS_KEY: requiredSecret,
  /** Public base URL media is served from (the r2.dev dev URL until a CDN hostname exists). */
  R2_PUBLIC_BASE_URL: httpsUrl,
  /**
   * Neon API key for the daily compute/storage usage probe (spec 002 AC-24). **Optional**: with it
   * unset the job logs one `info` line and succeeds, so no environment is blocked on it.
   */
  NEON_API_KEY: optionalText,
  /** Neon project id, read by the same probe and by the runbooks. Optional. */
  NEON_PROJECT_ID: optionalText,
  /** Neon branch the URLs above point at (`production`). Documentation for operators. Optional. */
  NEON_BRANCH: optionalText,
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
  /**
   * Send the Content-Security-Policy as `Content-Security-Policy-Report-Only` instead of
   * enforcing it (spec 004 §5.2, AC-23, ADR-0016; TASK-046).
   *
   * **Absent means `true`**, so report-only is what a forgotten variable gets: the policy is
   * collected as evidence at `/api/csp-report` first and enforced once the reports are empty. Only
   * the exact string `"false"` enforces, so a typo cannot half-enable enforcement, and the flip is
   * one env-store edit per environment rather than a deploy.
   */
  CSP_REPORT_ONLY: z.preprocess(
    emptyToUndefined,
    z.enum(["true", "false"]).optional(),
  ),
  /**
   * Serve the component gallery at `/dev/components` (spec 004 §2 "Component gallery", §12
   * "Environments", AC-28; TASK-045). `"true"` locally and on previews — the gallery is the
   * cheapest visual-regression and axe surface, and it is where the founder's florist demos see
   * the components in every state — and **refused in `production`** by `validateEnv()` below, so
   * a development affordance cannot reach a buyer through a configuration mistake. Absent counts
   * as `"false"`, so production needs no value at all; the route itself answers 404 when it is
   * off (`src/app/(dev)/dev/components/page.tsx`).
   */
  ENABLE_DEV_UI: z.preprocess(
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
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "INTERNAL_CRON_SECRET",
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_BACKUPS_BUCKET",
  "R2_S3_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BASE_URL",
] as const;

export type EnvSource = Readonly<Record<string, string | undefined>>;

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

/** The key that decides whether the CSP is enforced or only reported (ADR-0016, TASK-046). */
export const CSP_REPORT_ONLY_KEY = "CSP_REPORT_ONLY" as const;

/** The key that turns the GA4 tag on by carrying a measurement id (spec 004 AC-21, TASK-050). */
export const GA4_MEASUREMENT_ID_KEY = "NEXT_PUBLIC_GA4_MEASUREMENT_ID" as const;

/**
 * The configured GA4 measurement id, or `undefined` (spec 004 AC-21, TASK-050).
 *
 * Pure: the caller passes the environment. A value that is not a well-formed GA4 id is treated as
 * **absent** rather than passed through, so a typo, a `GTM-…` container id or a stray quote leaves
 * the site in its Phase 0 state — no tag, no third-party origin in the CSP — instead of loading
 * something that answers 404 and putting `googletagmanager.com` in the policy for nothing.
 * `clientEnvSchema` rejects the same values at build time; this function is what `next.config.ts`
 * and the loader read, and it must not throw on a malformed value in a deployed environment where
 * the build has already succeeded.
 */
export function ga4MeasurementId(source: EnvSource): string | undefined {
  const raw = source[GA4_MEASUREMENT_ID_KEY]?.trim();
  if (raw === undefined || raw === "") return undefined;
  return /^G-[A-Z0-9]{6,16}$/.test(raw) ? raw : undefined;
}

/**
 * Whether the CSP is sent as `Content-Security-Policy-Report-Only` (spec 004 AC-23, ADR-0016).
 *
 * Pure: the caller passes the environment. **Only the exact string `"false"` enforces**; anything
 * else — absent, blank, `"true"`, a typo — reports. That asymmetry is deliberate: a
 * misconfiguration must not silently start blocking scripts on a live shop, and a Report-Only
 * header that should have been enforcing is visible in the `/api/csp-report` evidence.
 */
export function cspReportOnly(source: EnvSource): boolean {
  return source[CSP_REPORT_ONLY_KEY] !== "false";
}

/** The key that switches the component gallery on. */
export const DEV_UI_KEY = "ENABLE_DEV_UI" as const;

/**
 * Whether the `en-XA` / `ar-XB` pseudo-locales are part of the locale registry
 * (`src/config/locales.ts`). Pure: the caller passes the environment, nothing is read here.
 * Anything other than the exact string `"true"` is off, so a typo cannot half-enable them, and
 * `validateEnv()` refuses `"true"` in production regardless.
 */
export function pseudoLocalesEnabled(source: EnvSource): boolean {
  return source[PSEUDO_LOCALES_KEY] === "true";
}

/**
 * Whether `/dev/components` exists (spec 004 AC-28). Pure: the caller passes the environment.
 * Anything other than the exact string `"true"` is off, so a typo cannot half-enable the gallery,
 * and `validateEnv()` refuses `"true"` in production regardless.
 */
export function devUiEnabled(source: EnvSource): boolean {
  return source[DEV_UI_KEY] === "true";
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

  // AC-28, the same reasoning as the pseudo-locales above and the same enforcement point: the
  // gallery is a development surface, and refusing the flag in the gate `next.config.ts` runs
  // before compiling anything makes "the gallery cannot be served in production" a build failure
  // rather than a code review. Previews are password-protected and `noindex` (§12).
  if (environment === "production" && devUiEnabled(source)) {
    issues.push({
      key: DEV_UI_KEY,
      message:
        "must not be `true` in production: the /dev/components gallery is refused there (spec 004 §2, AC-28). Unset it or set it to `false`.",
    });
  }

  if (environment === "preview" || environment === "production") {
    // Spec 002 AC-2: there is no escape hatch any more. The opt-out spec 001 carried existed only
    // because no database existed to point at; with Neon and R2 provisioned, a deployed
    // environment carrying a `.env.example` placeholder is a misconfiguration and fails the build,
    // naming the offending keys and no value.
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
