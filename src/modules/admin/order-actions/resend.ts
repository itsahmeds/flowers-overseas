/**
 * Resend an email from the admin order page (spec 020a §2.5, §5.2 "Resend", AC-24 to AC-26;
 * TASK-360).
 *
 * `adminResendNotification(input, deps)` is the server action's body: `requirePermission(
 * 'orders.resend')` is its first statement (admin and ops, §13 Q2), then the input is parsed with
 * `AdminResendSchema`, then the action runs through `runOrderAction` (lock, replay, `expectedSeq`,
 * the `admin_order_action` row with `notification_delivery_id` = the row resent and its audit
 * row). The effect is spec 016's `resendNotification` on the action's transaction: it refuses a
 * row the resend table does not allow now (`RESEND_NOT_ALLOWED`, a buyer row of a `test` order
 * among them) and a fourth resend in 24 hours (`RESEND_RATE_LIMITED`), writing nothing; otherwise
 * it inserts the `queued` resend row, whose id is the action's `result_ref`. After the commit the
 * `notifications.resend` job is enqueued, keyed by that row; the job sends it (or holds it while
 * `notifications.email` is off).
 *
 * `orderEmails(orderId, viewer, deps)` is the emails list of the order page (TASK-361 draws it):
 * `resendableDeliveries` in an admin read transaction, with a viewer who lacks `orders.resend`
 * shown no "Resend" (cause `permission`).
 *
 * Not re-exported from `./index.ts`, like `./cancel.ts`: this file reaches the notifications
 * barrel (the pipeline), which no page that only reads the admin barrel should load. Import it by
 * path.
 */
import { z } from "zod";

import type { AdminSession } from "@/lib/auth/admin";
import type { AdminContextInput } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isEnabled } from "@/lib/flags";
import {
  NOTIFICATIONS_FLAG,
  pgBossResendScheduler,
  type ResendableDelivery,
  type ResendCause,
  type ResendNotificationDeps,
  type ResendScheduler,
  resendableDeliveries,
  resendNotification,
} from "@/modules/notifications";

import { type AdminPermission, can } from "../permissions.ts";
import {
  adminOrderActionTransaction,
  type EffectContext,
  type EffectOutcome,
  type OrderActionTransaction,
  type RunOrderActionDeps,
  runOrderAction,
} from "./run.ts";
import {
  type AdminOrderActionResult,
  type AdminResendInput,
  AdminResendSchema,
} from "./schemas.ts";

export interface AdminResendDeps extends RunOrderActionDeps {
  /** Spec 012's `requirePermission`; tests pass their own. */
  readonly guard?: (permission: AdminPermission) => Promise<AdminSession>;
  readonly requestId?: string;
  /** Enqueues `notifications.resend` after the commit; pg-boss by default. */
  readonly schedule?: ResendScheduler;
  /** The pipeline's seams (the clock, the provider name); production defaults. */
  readonly notifications?: ResendNotificationDeps;
}

function resendEffect(
  input: AdminResendInput,
  deps: AdminResendDeps,
): (context: EffectContext) => Promise<EffectOutcome> {
  return async ({ executor, order }) => {
    const result = await resendNotification(
      executor,
      {
        orderId: order.id,
        deliveryId: input.deliveryId,
        actionId: input.actionId,
      },
      deps.notifications,
    );
    if (!result.ok) return { ok: false, code: result.code };
    const schedule = deps.schedule ?? pgBossResendScheduler;
    const requestId = deps.requestId ?? "system:notifications.resend";
    return {
      ok: true,
      resultRef: result.deliveryId,
      record: { notificationDeliveryId: input.deliveryId },
      // The row is committed `queued` either way; a failed enqueue is logged, never thrown, so the
      // admin's page shows the row and they can resend the original again.
      afterCommit: async () => {
        try {
          await schedule(result.deliveryId, requestId);
        } catch (error) {
          logger.error(
            {
              alert: "notifications.resend_enqueue_failed",
              order_id: order.id,
              delivery_id: result.deliveryId,
              error_class: error instanceof Error ? error.name : "Error",
            },
            "notification.resend_enqueue_failed",
          );
        }
      },
    };
  };
}

/**
 * Resends one delivery row of the order (spec 020a §2.5). Returns `ok` with the new row's id as
 * `resultRef`, or a refusal code.
 */
export async function adminResendNotification(
  input: unknown,
  deps: AdminResendDeps = {},
): Promise<AdminOrderActionResult> {
  const session = await (deps.guard ?? defaultGuard)("orders.resend");
  const parsed = AdminResendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INPUT_INVALID" };
  return runOrderAction(
    {
      kind: "resend",
      input: parsed.data,
      userId: session.userId,
      ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
    },
    resendEffect(parsed.data, deps),
    deps,
  );
}

async function defaultGuard(
  permission: AdminPermission,
): Promise<AdminSession> {
  const { requirePermission } = await import("../guard.ts");
  return requirePermission(permission);
}

/* -------------------------------------------------------------------------- */
/* The emails list                                                            */
/* -------------------------------------------------------------------------- */

/** The audit action of the list's read (no trigger records a read). */
export const ORDER_EMAILS_READ_ACTION = "order.emails.read";

/** A row's "Resend" cause on the page: the pipeline's, or the viewer's missing permission. */
export type OrderEmailCause = ResendCause | "permission";

export type OrderEmail = Omit<ResendableDelivery, "resend"> & {
  readonly resend:
    | { readonly allowed: true }
    | { readonly allowed: false; readonly cause: OrderEmailCause };
};

export interface OrderEmailsDeps {
  readonly transaction?: OrderActionTransaction;
  readonly now?: () => Date;
  readonly emailEnabled?: () => Promise<boolean>;
}

/**
 * The emails list of one order, oldest first (AC-24), or `null` when no such order exists. Runs in
 * an admin-context read transaction as `viewer`; a viewer without `orders.resend` sees every row's
 * "Resend" replaced by the `permission` cause.
 */
export async function orderEmails(
  orderId: string,
  viewer: {
    readonly userId: string;
    readonly roles: readonly string[];
    readonly requestId?: string;
  },
  deps: OrderEmailsDeps = {},
): Promise<OrderEmail[] | null> {
  const id = z.uuid().parse(orderId);
  const transaction = deps.transaction ?? adminOrderActionTransaction;
  const context: AdminContextInput = {
    userId: viewer.userId,
    action: ORDER_EMAILS_READ_ACTION,
    ...(viewer.requestId === undefined ? {} : { requestId: viewer.requestId }),
  };
  const emailEnabled = await (
    deps.emailEnabled ?? (() => isEnabled(NOTIFICATIONS_FLAG))
  )();
  const now = (deps.now ?? (() => new Date()))();
  const rows = await transaction(context, (executor) =>
    resendableDeliveries(executor, id, { now, emailEnabled }),
  );
  if (rows === null) return null;
  const permitted = can(viewer.roles, "orders.resend");
  return rows.map((row): OrderEmail =>
    permitted || !row.resend.allowed
      ? row
      : { ...row, resend: { allowed: false, cause: "permission" } },
  );
}
