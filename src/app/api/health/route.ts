/**
 * `GET /api/health` (spec 001 §5.2, §5.4, AC-14, TASK-006).
 *
 * Thin by design (plan/01 §5): read the environment, delegate to `@/lib/health`. No database
 * access in 001. Used by Vercel checks and, later, the uptime monitor (spec 001 §11).
 */
import { env, environment } from "@/lib/env";
import { healthResponse } from "@/lib/health";

/** Never cached, never prerendered: the body reports the running deployment (spec 001 §5.4). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request): Response {
  return healthResponse(request, {
    environment,
    version: env.VERCEL_GIT_COMMIT_SHA,
  });
}
