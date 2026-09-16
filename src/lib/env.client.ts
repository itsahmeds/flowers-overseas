/**
 * Client environment (spec 001 §5.2, TASK-005).
 *
 * Safe in both bundles: `NEXT_PUBLIC_*` only. Each variable is read as an explicit member
 * expression so Next can inline it into the browser bundle (a `process.env` spread would not be
 * replaced and would validate to `undefined` in the browser).
 *
 * `NEXT_PUBLIC_VERCEL_ENV` is deliberately **absent** from the map since spec 040 (§5.2,
 * TASK-097): the key stays in `clientEnvSchema` as an optional value until the Vercel unlink
 * of §13 Q5, but no application code reads it any more — `NEXT_PUBLIC_APP_ENV` is the browser
 * mirror of the one environment signal, and `pnpm check:no-vercel-env` keeps it that way.
 */
import { type ClientEnv, clientEnvSchema } from "./env.schema";

const raw: Readonly<Record<string, string | undefined>> = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA:
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
};

/** Frozen at module load. Invalid values throw here, at import time, on server and client alike. */
export const clientEnv: Readonly<ClientEnv> = Object.freeze(
  clientEnvSchema.parse(raw),
);
