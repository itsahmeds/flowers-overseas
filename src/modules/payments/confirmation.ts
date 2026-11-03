/**
 * The confirmation page's `test` and `live` states, as data (spec 013 §5.3 "What the
 * confirmation says" and its projection table; §14 A-founder-2026-10-14b; §14 A-founder-2026-10-22
 * item 8; AC-6, AC-46, AC-47, AC-52; TASK-263).
 *
 * `confirmationProjection(input)` is the projection table, row for row, and the one place an
 * order status becomes a confirmation state. It is pure, so the 26-status fixture runs without a
 * database:
 *
 *  - `placed`                                   → `notCompleted`
 *  - `payment_failed`, `abandoned`              → `cancelledUnpaid` (nothing was charged)
 *  - the paid projection (spec 002 A6.4 as amended by A9.1: buyer projection `confirmed`,
 *    i.e. `authorised`, `paid_unrouted`, `routed`, `no_partner_available`, `manual_reroute`,
 *    `accepted`, `paid`)                        → `paid` ("Thank you. We have your order.")
 *  - `cancelled`, `cancelled_refunded`          → `refund`, keyed on the **actor class** of the
 *    cancelling event (`cancelledByOf`, the same rule as spec 016's B5 and spec 018's AC-42) and
 *    on whether a refund has succeeded; `{amount}` is the order's remaining balance while
 *    refunding and the sum of its succeeded refunds once refunded. The reason is never returned.
 *  - every other status (`in_production` and later) → `progress`, the order's buyer status (spec
 *    018's labels) with the arrival line, plus "Refunded {amount} on {date}" per succeeded refund.
 *
 * **No refund or failure wording on a paid state** (AC-46): the `paid` state carries no amount, no
 * refund and no reason; the only refund words a buyer can read on the page are the `refund`
 * state's notices and the `progress` state's dated refund lines, which exist only when a refund
 * row has succeeded. `getPaymentConfirmations(orderIds)` reads what the projection needs, one row
 * per order, through spec 010's executor; it writes nothing.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { type CurrencyCode, isCurrencyCode } from "@/config/currencies";

import {
  buyerStep,
  cancelledByOf,
  type BuyerStep,
  type CancelledBy,
  type EngineConnection,
  withExecutor,
} from "@/modules/orders";

/** A money amount as the page prints it: integer minor units and the order's currency. */
export interface ConfirmationMoney {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

/** The buyer statuses `progress` prints (spec 018's labels, `tracking.headline.*`). */
export const PROGRESS_STEPS = [
  "being_made",
  "on_its_way",
  "delivered",
  "closed",
] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];

/** One state of §5.3's projection table. */
export type ConfirmationState =
  | { readonly kind: "notCompleted" }
  | { readonly kind: "cancelledUnpaid" }
  | { readonly kind: "paid" }
  | {
      readonly kind: "progress";
      readonly step: ProgressStep;
      /** Each succeeded refund, oldest first (spec 013 `succeededRefunds`, advisor F4). */
      readonly refunds: readonly {
        readonly amount: ConfirmationMoney;
        readonly succeededAt: Date;
      }[];
    }
  | {
      readonly kind: "refund";
      readonly by: CancelledBy;
      readonly refunded: boolean;
      readonly amount: ConfirmationMoney;
    };

/** The message key a state's sentence reads (Appendix A; `progress` reads spec 018's label). */
export function confirmationKey(state: ConfirmationState): string {
  switch (state.kind) {
    case "notCompleted":
      return "payments.confirmation.notCompleted";
    case "cancelledUnpaid":
      return "payments.confirmation.cancelled";
    case "paid":
      return "payments.confirmation.paid";
    case "progress":
      return `tracking.headline.${PROGRESS_LABEL[state.step]}`;
    case "refund":
      return state.by === "buyer"
        ? state.refunded
          ? "payments.confirmation.cancelledByYouRefunded"
          : "payments.confirmation.cancelledByYouRefunding"
        : state.refunded
          ? "payments.confirmation.notDeliveredRefunded"
          : "payments.confirmation.notDeliveredRefunding";
  }
}

const PROGRESS_LABEL: Readonly<Record<ProgressStep, string>> = {
  being_made: "beingMade",
  on_its_way: "onItsWay",
  delivered: "delivered",
  closed: "closed",
};

/** What the projection reads for one order. */
export interface ConfirmationInput {
  readonly status: string;
  /** `order_status.buyer_projection`, stored (`with_florist` folds to `confirmed`). */
  readonly buyerProjection: string;
  /** The actor of the order's `order.cancelled` / `order.cancelled_refunded` event, if any. */
  readonly cancelActor: string | null;
  /** That event's `reason`, used only to class an admin's `buyer_cancel` (spec 020a). */
  readonly cancelReason: string | null;
  readonly total: ConfirmationMoney;
  readonly succeeded: readonly {
    readonly amountMinor: number;
    readonly succeededAt: Date;
  }[];
}

const UNPAID_CLOSED = new Set(["payment_failed", "abandoned"]);
const CANCELLED = new Set(["cancelled", "cancelled_refunded"]);

/** §5.3's projection table for one order (the file header). Throws on an unknown projection. */
export function confirmationProjection(
  input: ConfirmationInput,
): ConfirmationState {
  if (input.status === "placed") return { kind: "notCompleted" };
  if (UNPAID_CLOSED.has(input.status)) return { kind: "cancelledUnpaid" };
  const currency = input.total.currency;
  const refundedMinor = input.succeeded.reduce(
    (sum, refund) => sum + refund.amountMinor,
    0,
  );
  if (CANCELLED.has(input.status)) {
    const refunded = input.succeeded.length > 0;
    return {
      kind: "refund",
      by: cancelledByOf(input.cancelActor ?? "", input.cancelReason),
      refunded,
      amount: {
        amountMinor: refunded
          ? refundedMinor
          : Math.max(input.total.amountMinor - refundedMinor, 0),
        currency,
      },
    };
  }
  const step: BuyerStep = buyerStep(input.buyerProjection);
  if (step === "confirmed") return { kind: "paid" };
  if (step === "placed" || step === "cancelled") {
    // A6.4 maps only `placed` and the four closed statuses above to these; anything else is a
    // machine the table does not know.
    throw new Error(`confirmation: no state for status ${input.status}`);
  }
  return {
    kind: "progress",
    step,
    refunds: input.succeeded.map((refund) => ({
      amount: { amountMinor: refund.amountMinor, currency },
      succeededAt: refund.succeededAt,
    })),
  };
}

const Minor = z.coerce.number().int().nonnegative();

const OrderRow = z.object({
  id: z.uuid(),
  status: z.string().min(1),
  buyer_projection: z.string().min(1),
  buyer_total_minor: Minor,
  buyer_currency_code: z.string().refine(isCurrencyCode),
  cancel_actor: z.string().nullable(),
  cancel_reason: z.string().nullable(),
});

const RefundRow = z.object({
  order_id: z.uuid(),
  amount_minor: Minor,
  succeeded_at: z.coerce.date(),
});

/**
 * The confirmation state of each order (the page's one read for spec 013's states). Orders not
 * found are absent from the map; the page then draws spec 010's "no longer available".
 */
export async function getPaymentConfirmations(
  orderIds: readonly string[],
  options: EngineConnection = {},
): Promise<Map<string, ConfirmationState>> {
  const ids = z.array(z.uuid()).max(5).parse(orderIds);
  const states = new Map<string, ConfirmationState>();
  if (ids.length === 0) return states;
  await withExecutor(options, "payments.confirmation", async (executor) => {
    const idList = sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const orders = (
      await executor.execute(sql`
        SELECT o.id, o.status, s.buyer_projection, o.buyer_total_minor::text AS buyer_total_minor,
               o.buyer_currency_code,
               c.actor AS cancel_actor, c.payload ->> 'reason' AS cancel_reason
          FROM "order" o
          JOIN order_status s ON s.key = o.status
          LEFT JOIN LATERAL (
            SELECT e.actor, e.payload FROM order_event e
             WHERE e.order_id = o.id
               AND e.type IN ('order.cancelled', 'order.cancelled_refunded')
             ORDER BY e.seq DESC LIMIT 1
          ) c ON true
         WHERE o.id IN (${idList})`)
    ).map((raw) => OrderRow.parse(raw));
    const refunds = (
      await executor.execute(sql`
        SELECT order_id, amount_minor::text AS amount_minor, succeeded_at FROM refund
         WHERE order_id IN (${idList}) AND status = 'succeeded'
         ORDER BY succeeded_at, id`)
    ).map((raw) => RefundRow.parse(raw));
    for (const order of orders) {
      states.set(
        order.id,
        confirmationProjection({
          status: order.status,
          buyerProjection: order.buyer_projection,
          cancelActor: order.cancel_actor,
          cancelReason: order.cancel_reason,
          total: {
            amountMinor: order.buyer_total_minor,
            currency: order.buyer_currency_code,
          },
          succeeded: refunds
            .filter((refund) => refund.order_id === order.id)
            .map((refund) => ({
              amountMinor: refund.amount_minor,
              succeededAt: refund.succeeded_at,
            })),
        }),
      );
    }
  });
  return states;
}
