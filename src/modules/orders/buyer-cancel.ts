/**
 * `cancelOrderAsBuyer({ orderId, step })` (spec 018 §5.2 "Buyer cancellation", server actions;
 * §14 A-founder-2026-10-14b B.1, B.2; AC-28 confirmation half, AC-46; TASK-340).
 *
 * The buyer's free cancellation from the confirmation (the draft cookie's owner, checked by the
 * caller, `src/app/[locale]/(checkout)/checkout/done/actions.ts`). Two steps, both plain posts:
 *
 *  - `review` writes nothing. While the order is in set P (folded projection `confirmed`) it
 *    answers the dialog's amount, the order's own `buyer_total_minor` in its currency.
 *  - `confirm` calls spec 013's `cancelOrder(orderId, 'buyer', 'buyer_cancel')`, **the one
 *    cancellation command** (rows 13, 39, 40 through `orderService.transition`, ADR-0009). This
 *    file writes no status, appends no event and moves no money: the full refund is spec 013's
 *    cancel handler, an outbox subscriber of `order.cancelled`.
 *
 * Outcomes the page draws:
 *
 *  - `cancelled`: applied, or the order is already in a cancelled projection (a double submit, or
 *    two tabs): the page re-renders as spec 013's cancelled state, and nothing is written twice,
 *    so no second refund is requested.
 *  - `refused`: the order is `in_production` or later, or `placed` (a stale page, or a race with
 *    the 06:00 production start that `cancelOrder`'s row lock lost: its `ORDER_TRANSITION_ILLEGAL`
 *    reads the same). Nothing is written; the page shows exactly `postPurchase.cancelRefused`.
 *  - `not_found`: no such order, or a `demo` order (which has no block): the caller answers 404.
 *
 * Deliberately **not** in the `orders` barrel: it imports the `payments` module (as
 * `./buyer-refund-lines.ts` does), which the barrel must not carry. Nothing here logs.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { cancelOrder } from "@/modules/payments";

import { isCancellable } from "./confirmation-block";
import { CurrencyCodeSchema } from "./refund-lines";
import { type EngineConnection, withExecutor } from "./service/executor";
import { buyerStep } from "./tracking-view";

/** The buyer's actor and reason, exactly as §5.2 names them. */
export const BUYER_CANCEL_ACTOR = "buyer";
export const BUYER_CANCEL_REASON = "buyer_cancel";

export const CancelStepSchema = z.enum(["review", "confirm"]);
export type CancelStep = z.infer<typeof CancelStepSchema>;

export const CancelOrderAsBuyerInputSchema = z
  .object({ orderId: z.uuid(), step: CancelStepSchema })
  .strict();
export type CancelOrderAsBuyerInput = z.infer<
  typeof CancelOrderAsBuyerInputSchema
>;

export type BuyerCancelOutcome =
  | {
      readonly kind: "review";
      readonly amount: {
        readonly amountMinor: number;
        readonly currencyCode: string;
      };
    }
  | { readonly kind: "cancelled" }
  | { readonly kind: "refused" }
  | { readonly kind: "not_found" };

const StateRow = z.object({
  mode: z.enum(["demo", "test", "live"]),
  projection: z.string(),
  total_minor: z.coerce.number().int().positive(),
  currency_code: CurrencyCodeSchema,
});

type State = z.infer<typeof StateRow>;

async function readState(
  options: EngineConnection,
  orderId: string,
): Promise<State | null> {
  return withExecutor(options, "orders.buyer_cancel", async (executor) => {
    const [raw] = await executor.execute(sql`
      SELECT o.mode, s.buyer_projection AS projection,
             o.buyer_total_minor AS total_minor,
             o.buyer_currency_code AS currency_code
      FROM "order" o
      JOIN order_status s ON s.key = o.status
      WHERE o.id = ${orderId}`);
    return raw === undefined ? null : StateRow.parse(raw);
  });
}

/** The cancelled projection: the page draws spec 013's cancelled state. */
function isCancelled(state: State): boolean {
  return buyerStep(state.projection) === "cancelled";
}

/** The buyer's cancel from the confirmation (the file header). */
export async function cancelOrderAsBuyer(
  input: CancelOrderAsBuyerInput,
  options: EngineConnection = {},
): Promise<BuyerCancelOutcome> {
  const { orderId, step } = CancelOrderAsBuyerInputSchema.parse(input);
  const before = await readState(options, orderId);
  if (before === null || before.mode === "demo") return { kind: "not_found" };
  if (isCancelled(before)) return { kind: "cancelled" };
  // The pre-check: outside set P nothing is called. `cancelOrder` re-reads the status under the
  // order's row lock, so this check is never the only one.
  if (!isCancellable(buyerStep(before.projection))) return { kind: "refused" };
  if (step === "review") {
    return {
      kind: "review",
      amount: {
        amountMinor: before.total_minor,
        currencyCode: before.currency_code,
      },
    };
  }
  const result = await cancelOrder(
    orderId,
    BUYER_CANCEL_ACTOR,
    BUYER_CANCEL_REASON,
    options,
  );
  if (result.kind === "cancelled") return { kind: "cancelled" };
  if (result.code === "ORDER_NOT_FOUND") return { kind: "not_found" };
  // Refused under the lock: a concurrent confirm that won (the order is now cancelled), or the
  // production start that won (`ORDER_TRANSITION_ILLEGAL`, the same message as the pre-check).
  const after = await readState(options, orderId);
  if (after !== null && isCancelled(after)) return { kind: "cancelled" };
  return { kind: "refused" };
}
