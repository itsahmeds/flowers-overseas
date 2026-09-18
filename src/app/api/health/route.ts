/**
 * `GET /api/health` (spec 001 §5.2, §5.4, AC-14, TASK-006).
 *
 * Thin by design (plan/01 §5): read the environment, delegate to `@/lib/health`. No database
 * access in 001. Used by Vercel checks and, later, the uptime monitor (spec 001 §11).
 */
import { commitSha, deploymentRegion, environment } from "@/lib/env";
import { healthResponse } from "@/lib/health";

/** Never cached, never prerendered: the body reports the running deployment (spec 001 §5.4). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request): Response {
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
