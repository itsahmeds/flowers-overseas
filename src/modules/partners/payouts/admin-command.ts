/**
 * The admin pages' one way into a payouts command (spec 030a §5.2 "Module": `app/admin/**` calls
 * the module through thin server actions whose first statement is `requirePermission(…)`, then
 * `withAdminContext`; TASK-367).
 *
 * `runPayoutCommand(actor, action, fn)` opens one admin transaction carrying `action` (and a
 * typed reason, through `app.audit_reason`'s bind parameter), hands the command a Drizzle
 * executor, and turns a refusal into its code: a `PayoutError`'s own code, or the code a database
 * trigger raised (`PAYOUT_NOT_DRAFT`, `PAYOUT_STATUS_ILLEGAL` are the triggers' first words). A
 * refusal rolls the transaction back, so it writes nothing. Anything else is thrown on: an
 * unexpected failure is the error boundary's, never a silent "done".
 *
 * `WiseRecipientMissing` keeps its florist codes (never a name), so the page can name them.
 */
import { z } from "zod";

import type { OrderExecutor } from "@/modules/orders";

import {
  PAYOUT_ERROR_CODES,
  PayoutError,
  type PayoutErrorCode,
} from "./amount";
import { WiseRecipientMissing } from "./export";

export interface PayoutCommandActor {
  readonly userId: string;
  readonly requestId: string;
}

export type PayoutCommandResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: PayoutErrorCode;
      /** Florist codes, for `PAYOUT_WISE_RECIPIENT_MISSING` only. */
      readonly partnerCodes?: readonly string[];
    };

const CODE_PATTERN = new RegExp(`^(${PAYOUT_ERROR_CODES.join("|")}):`, "u");

/** The refusal code of an error, or `undefined` when it is not a refusal. */
export function payoutRefusalCode(error: unknown): PayoutErrorCode | undefined {
  if (error instanceof PayoutError) return error.code;
  // A trigger's RAISE arrives as a driver error whose message (or its cause's) starts with the code.
  for (let current: unknown = error, depth = 0; depth < 3; depth += 1) {
    if (!(current instanceof Error)) break;
    const match = CODE_PATTERN.exec(current.message);
    if (match?.[1] !== undefined) return match[1] as PayoutErrorCode;
    current = current.cause;
  }
  return undefined;
}

/** The audit action a payouts page transaction carries (`audit_log_action_check`'s shape). */
export const PayoutAdminActionSchema = z
  .string()
  .regex(/^payouts?(?:_export)?\.[a-z_]+(?:\.[a-z_]+)*$/u);

export type PayoutAdminRunner = <T>(
  input: PayoutCommandActor & {
    readonly action: string;
    readonly reason?: string;
  },
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

/** Production: one admin transaction, a Drizzle executor over it. */
export const payoutAdminRunner: PayoutAdminRunner = async (input, fn) => {
  const [{ withAdminContext }, { withExecutor }] = await Promise.all([
    import("@/lib/db"),
    import("@/modules/orders"),
  ]);
  return withAdminContext(
    {
      userId: input.userId,
      requestId: input.requestId,
      action: PayoutAdminActionSchema.parse(input.action),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    },
    (db) => withExecutor({ db }, "payouts.admin", fn),
  );
};

/** Runs one payouts command; a refusal is its code and no write. */
export async function runPayoutCommand<T>(
  actor: PayoutCommandActor,
  action: string,
  fn: (executor: OrderExecutor) => Promise<T>,
  options: { readonly reason?: string; readonly run?: PayoutAdminRunner } = {},
): Promise<PayoutCommandResult<T>> {
  const run = options.run ?? payoutAdminRunner;
  try {
    const value = await run(
      {
        ...actor,
        action,
        ...(options.reason === undefined ? {} : { reason: options.reason }),
      },
      fn,
    );
    return { ok: true, value };
  } catch (error) {
    if (error instanceof WiseRecipientMissing) {
      return { ok: false, code: error.code, partnerCodes: error.partnerCodes };
    }
    const code = payoutRefusalCode(error);
    if (code !== undefined) return { ok: false, code };
    throw error;
  }
}
