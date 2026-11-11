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
 * (TASK-258), one `payments.monitor` (TASK-264, under a `singletonKey`), one `order.close_sweep` (spec 022a §5.2, TASK-369, under a `singletonKey`) and one
 * `routing.sla_watch` (spec 016 §5.2, TASK-328, likewise), which the same tick consumes; and,
 * once an hour (a `singletonKey` unique for 3600 seconds), `payouts.close` and `payouts.watch`
 * (spec 030a §5.2, TASK-364); `payments.balance_sweep` (spec 030b §5.2, TASK-439) and
 * `partners.contract_reminders` (spec 030b §14.5, TASK-442); and one
 * `alerts.monitor` and one `alerts.escalate` (spec 025 §5.2, TASK-489), and, once per UTC day
 * not before 07:00, `reminders.daily` (spec 018 §14 C.7.4, TASK-353), after which a tick that
 * reached the database pings the heartbeat (AC-27).
 */
import { SCAN_EVERY_MINUTES } from "@/config/basket-reminders";
import { JOB_HANDLERS } from "@/jobs/handlers";
import { tickResponse } from "@/jobs/internal";
import { enqueue, ensureQueues, runTick, withBoss } from "@/jobs/runtime";
import { env } from "@/lib/env";
import { type QueueReader, tickHeartbeat } from "@/modules/ops";

/** Never cached, never prerendered: a write path. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** spec 030a's hourly jobs: one run per clock hour. */
const HOURLY_SECONDS = 3600;
/** Spec 034 §5.2: the basket reminder scan's period, `SCAN_EVERY_MINUTES` in seconds. */
const BASKET_REMINDER_SCAN_SECONDS = SCAN_EVERY_MINUTES * 60;

/** Spec 018 C.7.4: `reminders.daily` runs once per UTC day (pg-boss's slot is the UTC day). */
const DAILY_SECONDS = 86_400;
/** Spec 018 C.7.4: the hour, UTC, the occasion reminders go out. */
const REMINDERS_HOUR_UTC = 7;

/** 07:00 UTC of `now`'s UTC day: the day's job waits for it when enqueued earlier. */
function remindersDailyStartAfter(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      REMINDERS_HOUR_UTC,
    ),
  );
}

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
        // Spec 013 §5.2, §11 (TASK-264): the payment monitors, once a minute.
        await enqueue(
          boss,
          "payments.monitor",
          {},
          {
            requestId: "system:jobs.tick",
            singletonKey: "payments.monitor",
          },
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
        // Spec 016 §5.2 (TASK-328): the overdue-offer watch, once a minute.
        await enqueue(
          boss,
          "routing.sla_watch",
          {},
          {
            requestId: "system:jobs.tick",
            singletonKey: "routing.sla_watch",
          },
        );
        // Spec 018 §11 (TASK-342): the unrendered-invoice sweep, once a minute.
        await enqueue(
          boss,
          "invoice.render_sweep",
          {},
          {
            requestId: "system:jobs.tick",
            singletonKey: "invoice.render_sweep",
          },
        );
        // Spec 030a §5.2 (TASK-364): the weekly close and the missing-line watch, hourly.
        for (const name of [
          "payouts.close",
          "payouts.watch",
          // Spec 030b §5.2 (TASK-439): the balance-fact sweep, hourly.
          "payments.balance_sweep",
          // Spec 030b §14.5 (TASK-442): the contract review reminders, hourly.
          "partners.contract_reminders",
        ] as const) {
          await enqueue(
            boss,
            name,
            {},
            {
              requestId: "system:jobs.tick",
              singletonKey: name,
              singletonSeconds: HOURLY_SECONDS,
            },
          );
        }
        // Spec 025 §5.2 (TASK-489): the alert monitors and the escalation pass, once a minute.
        // Spec 021 §5.2 (TASK-493): `risk.monitor`, the card-testing check, once a minute too.
        for (const name of [
          "alerts.monitor",
          "alerts.escalate",
          "risk.monitor",
        ] as const) {
          await enqueue(
            boss,
            name,
            {},
            { requestId: "system:jobs.tick", singletonKey: name },
          );
        }
        // Spec 034 §5.2 (TASK-450): the basket reminder scan, every 10 minutes.
        await enqueue(
          boss,
          "basket-reminders.scan",
          {},
          {
            requestId: "system:jobs.tick",
            singletonKey: "basket-reminders.scan",
            singletonSeconds: BASKET_REMINDER_SCAN_SECONDS,
          },
        );
        // Spec 018 §14 C.7.4 (TASK-353): the occasion reminders, once per UTC day from 07:00.
        await enqueue(
          boss,
          "reminders.daily",
          {},
          {
            requestId: "system:jobs.tick",
            singletonKey: "reminders.daily",
            singletonSeconds: DAILY_SECONDS,
            startAfter: remindersDailyStartAfter(new Date()),
          },
        );
        const counts = await runTick(boss, JOB_HANDLERS);
        // Spec 025 AC-27: the dead man's switch, only after a tick that reached the database.
        await tickHeartbeat(boss.getDb() as QueueReader);
        return counts;
      }),
  });
}
