import { assertRuntimeEnv } from "./src/lib/env.schema";

/**
 * Is this `next build` collecting page data rather than a server taking traffic? Next sets
 * `NEXT_PHASE` to `phase-production-build` for the duration of a build, and it runs `register()`
 * in the build's workers too. The runtime assertion below must not fire there: the whole point of
 * spec 001 §14 A17 is that a build needs no credential (TASK-135).
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Next server instrumentation (spec 001 §5, TASK-005). Loads the Sentry config for the runtime
 * that is starting; both are no-ops without `SENTRY_DSN`.
 *
 * It is also the **server-start half of the env gate** (spec 001 §14 A17, spec 040 §14 A1;
 * TASK-135): `next.config.ts` asserts only what the build inlines, so the server-only keys —
 * `DATABASE_URL`, the R2 credentials, `INTERNAL_CRON_SECRET` — are asserted here, in the first
 * application code a server runs, where the values exist. A miss throws `EnvValidationError`
 * naming the keys and printing no value.
 *
 * It is asserted **again** in `src/app/api/health/route.ts`, and that is the copy the deployment
 * is judged on: measured on Next 16.3 (`node .next/standalone/server.js`, TASK-135), a `register()`
 * that throws does not stop the process from listening, so the enforced, observable failure is the
 * 500 from `/api/health` — which is the Railway healthcheck target, so the deployment never turns
 * `● Active` and never takes traffic. Same fail-closed intent as AC-10, one step later than the
 * build. Keeping the call here as well costs one zod parse at boot and fails earlier on any
 * runtime that does propagate the throw.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!isBuildPhase()) assertRuntimeEnv(process.env);
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
