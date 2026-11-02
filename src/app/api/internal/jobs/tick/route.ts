/**
 * @purpose POST: secret-gated minute pg-boss tick, counts only (spec 002 AC-21)
 *
 * `POST /api/internal/jobs/tick` — the minute-cron pg-boss tick of `plan/08` §5 (spec 002 §5.2,
 * AC-21; TASK-024). Returns counts only.
 *
 * Thin by design (`plan/01` §5): the secret gate and the response are `@/jobs/internal`; the tick
 * is `@/jobs/runtime` (`ensureQueues`, then `runTick` with the handlers of `@/jobs/handlers`) over
 * `DATABASE_URL_UNPOOLED`, on a pg-boss instance that lives for this request only. Every tick
 * first enqueues one `outbox.dispatch` (spec 013 §5.2, TASK-254), one `payments.production_start`
 * (TASK-258) and one `order.close_sweep` (spec 022a §5.2, TASK-369, under a `singletonKey`), which
 * the same tick consumes.
 */
import { JOB_HANDLERS } from "@/jobs/handlers";
import { tickResponse } from "@/jobs/internal";
import { enqueue, ensureQueues, runTick, withBoss } from "@/jobs/runtime";
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
        await enqueue(
          boss,
          "outbox.dispatch",
          {},
          {
            requestId: "system:jobs.tick",
          },
        );
        // Spec 013 §5.2 (TASK-258): row 16 on the delivery morning, checked every minute.
        await enqueue(
          boss,
          "payments.production_start",
          {},
          { requestId: "system:jobs.tick" },
        );
        // Spec 022a §5.2 (TASK-369): one close sweep per minute, one at a time.
        await enqueue(
          boss,
          "order.close_sweep",
          {},
          {
            requestId: "system:jobs.tick",
            singletonKey: "order.close_sweep",
          },
        );
        return runTick(boss, JOB_HANDLERS);
      }),
  });
}
