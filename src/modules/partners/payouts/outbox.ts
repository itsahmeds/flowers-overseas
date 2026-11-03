/**
 * The `payouts` outbox target and founder email F1's job (spec 030a §5.2 "Outbox", "Founder
 * emails", §12; AC-4, AC-7; TASK-363).
 *
 * **The handler.** One per process, registered by the worker (`src/jobs/handlers.ts`):
 * `assignment.accepted` → `fixPayoutAtAcceptance` with the assignment its event payload names;
 * `order.photo_uploaded` → `accrueOrder(orderId, 'photo')` (TASK-364). Any other event reaching
 * the target is refused loudly rather than marked sent.
 *
 * **The hold.** While `payouts.accrue` is off the dispatcher claims no `payouts` delivery: each
 * stays `pending`, held and never dropped, and the first run after the flag is on delivers it
 * (as spec 016's `notifications.email` does).
 *
 * **F1.** `payouts.prepaid_ready { payoutId }` sends `payout-prepaid-ready` to the founder through
 * spec 016's pipeline (`sendJobNotifications`, source key `job:payouts.prepaid_ready:{payoutId}`),
 * so the email goes once per payout however often the job or the handler runs, and waits (the job
 * retries) while `notifications.email` is off. A payout that no longer exists sends nothing.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { isEnabled } from "@/lib/flags";
import {
  type OrderExecutor,
  type OutboxHandler,
  registerOutboxHandler,
  registerOutboxHold,
  withExecutor,
} from "@/modules/orders";

import { type AcceptanceDeps, fixPayoutAtAcceptance } from "./acceptance";
import { type AccrualDeps, accrueOrder } from "./accrual";

/** The flag that holds every `payouts` delivery (spec 030a §12). */
export const PAYOUTS_FLAG = "payouts.accrue" as const;

/** Thrown for an event the `payouts` target has no step for yet. Retried, then `dead`. */
export class PayoutsEventUnhandled extends Error {
  readonly code = "PAYOUTS_EVENT_UNHANDLED";

  constructor(type: string) {
    super(`PAYOUTS_EVENT_UNHANDLED: no payouts step for ${type}`);
    this.name = "PayoutsEventUnhandled";
  }
}

const AcceptedPayload = z.object({ assignment_id: z.uuid() });
const EventPayloadRow = z.object({ payload: z.unknown() });

/** The `payouts` handler. Every step is idempotent (a delivery is at least once). */
export function payoutsOutboxHandler(
  deps: AcceptanceDeps & AccrualDeps = {},
): OutboxHandler {
  return async (event, context) => {
    if (event.type === "order.photo_uploaded") {
      await accrueOrder(
        context.executor,
        { orderId: event.orderId, source: "photo" },
        deps,
      );
      return;
    }
    if (event.type !== "assignment.accepted") {
      throw new PayoutsEventUnhandled(event.type);
    }
    const [row] = await context.executor.execute(sql`
      SELECT payload FROM order_event WHERE id = ${event.eventId}`);
    const { assignment_id: assignmentId } = AcceptedPayload.parse(
      EventPayloadRow.parse(row).payload,
    );
    await fixPayoutAtAcceptance(
      context.executor,
      { orderId: event.orderId, assignmentId },
      deps,
    );
  };
}

/**
 * Registers the handler and its hold with the dispatcher, once per process: while
 * `payouts.accrue` is off every `payouts` delivery stays `pending`.
 */
export function registerPayoutsOutbox(
  deps: AcceptanceDeps &
    AccrualDeps & {
      readonly accrueEnabled?: () => Promise<boolean>;
    } = {},
): void {
  const enabled = deps.accrueEnabled ?? (() => isEnabled(PAYOUTS_FLAG));
  registerOutboxHandler("payouts", payoutsOutboxHandler(deps));
  registerOutboxHold("payouts", async () => !(await enabled()));
}

/** The job's seam into spec 016's pipeline (the default loads it on first use). */
export type PrepaidReadySender = (
  executor: OrderExecutor,
  input: {
    readonly job: "payouts.prepaid_ready";
    readonly jobId: string;
    readonly orderId: string;
  },
) => Promise<unknown>;

const defaultSender: PrepaidReadySender = async (executor, input) => {
  const { sendJobNotifications } = await import("@/modules/notifications");
  return sendJobNotifications(executor, input);
};

const OrderOfPayout = z.object({ order_id: z.uuid() });

/**
 * The `payouts.prepaid_ready` job: F1 for one prepaid payout, in a `system` transaction (or the
 * caller's executor). Returns false when the payout or its order line is gone (nothing sent).
 */
export async function sendPrepaidReady(
  payoutId: string,
  options: {
    readonly executor?: OrderExecutor;
    readonly send?: PrepaidReadySender;
  } = {},
): Promise<boolean> {
  const id = z.uuid().parse(payoutId);
  const send = options.send ?? defaultSender;
  return withExecutor(
    options.executor === undefined ? undefined : { executor: options.executor },
    "payouts.prepaid_ready",
    async (executor) => {
      const [row] = await executor.execute(sql`
        SELECT l.order_id FROM payout_line l JOIN payout p ON p.id = l.payout_id
        WHERE p.id = ${id} AND p.kind = 'prepaid' AND l.kind = 'order'`);
      if (row === undefined) return false;
      await send(executor, {
        job: "payouts.prepaid_ready",
        jobId: id,
        orderId: OrderOfPayout.parse(row).order_id,
      });
      return true;
    },
  );
}
