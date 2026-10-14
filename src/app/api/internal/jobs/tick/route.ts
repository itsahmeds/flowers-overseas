/**
 * @purpose POST: secret-gated minute pg-boss tick, counts only (spec 002 AC-21)
 *
 * `POST /api/internal/jobs/tick` — the minute-cron pg-boss tick of `plan/08` §5 (spec 002 §5.2,
 * AC-21; TASK-024). Returns counts only.
 *
 * Thin by design (`plan/01` §5): the secret gate and the response are `@/jobs/internal`; the tick
 * is `@/jobs/runtime` (`ensureQueues`, then `runTick` with the handlers of `@/jobs/handlers`) over
 * `DATABASE_URL_UNPOOLED`, on a pg-boss instance that lives for this request only.
 */
import { JOB_HANDLERS } from "@/jobs/handlers";
import { tickResponse } from "@/jobs/internal";
import { ensureQueues, runTick, withBoss } from "@/jobs/runtime";
import { env } from "@/lib/env";

/** Never cached, never prerendered: a write path. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request): Promise<Response> {
  return tickResponse(request, {
    secret: env.INTERNAL_CRON_SECRET,
    tick: () =>
      withBoss(async (boss) => {
        await ensureQueues(boss);
        return runTick(boss, JOB_HANDLERS);
      }),
  });
}
