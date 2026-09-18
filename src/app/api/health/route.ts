/**
 * `GET /api/health` (spec 001 §5.2, §5.4, AC-14, TASK-006).
 *
 * Thin by design (plan/01 §5): read the environment, delegate to `@/lib/health`. No database
 * access in 001. Used by Vercel checks and, later, the uptime monitor (spec 001 §11).
 */
import {
  assertRuntimeEnv,
  commitSha,
  deploymentRegion,
  environment,
} from "@/lib/env";
import { healthResponse } from "@/lib/health";

/** Never cached, never prerendered: the body reports the running deployment (spec 001 §5.4). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request): Response {
  // The server-only half of the env contract (spec 001 §14 A16, spec 040 §14 A1; TASK-135). The
  // build asserts only what it inlines, so this endpoint — the Railway healthcheck target — is
  // where a missing `DATABASE_URL`, R2 credential or `INTERNAL_CRON_SECRET` surfaces: it throws,
  // the response is a 500, the healthcheck fails and the deployment never takes traffic.
  // `instrumentation.ts` runs the same assertion at boot; this call is what makes the failure
  // observable at the endpoint Railway actually polls, whatever a future Next release does with a
  // throwing `register()`. The error names keys and prints no value.
  assertRuntimeEnv(process.env);
  return healthResponse(request, {
    environment,
    // Host-agnostic since spec 040 §5.2 (TASK-097): Railway's SHA, else Vercel's, else the
    // browser mirror. The resolution lives in `src/lib/env.schema.ts` because that is one of the
    // two modules `pnpm check:no-vercel-env` exempts.
    version: commitSha(process.env),
    // Spec 040 AC-31: the region of the running replica (`RAILWAY_REPLICA_REGION`), resolved in
    // `src/lib/env.schema.ts` like the SHA above. Still no database call: the whole body is
    // process-local, which is what makes this endpoint measure the web service and not Neon.
    region: deploymentRegion(process.env),
  });
}
