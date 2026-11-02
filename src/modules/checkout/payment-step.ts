/**
 * The checkout's payment seam (spec 010 §5.2 "The payment seam", §2 "The demo guard", AC-2;
 * TASK-205). Spec 013 registers its Stripe test and live steps here; this spec ships the interface,
 * the registry and the one step Phase 0 uses, `demoPaymentStep`.
 *
 * A step is what happens to each placed order between `order.placed` and routing:
 *
 *  - `demo` authorises every order with `transition('order.authorised', 'system:demo_guard',
 *    { mode: 'demo' })` and **calls no provider**: no outbound request, no `payment` row (AC-2);
 *  - `test` and `live` are spec 013's (one charge per purchase, §14 A-founder-2026-10-22 item 13).
 *
 * `paymentStepFor(mode)` answers `null` for a mode with no registered step, and placement then
 * refuses as `closed` (fail closed: no order is ever placed in a mode nothing can pay for).
 */
import {
  DEMO_GUARD_ACTOR,
  type OrderExecutor,
  orderService,
} from "@/modules/orders";

import type { DraftMode } from "./draft";

/** What a payment step is handed: the open placement transaction and the orders it placed. */
export interface PaymentStepContext {
  readonly executor: OrderExecutor;
  readonly purchaseId: string;
  readonly orderIds: readonly string[];
}

/** One mode's payment step (spec 013 adds `test` and `live`). */
export interface CheckoutPaymentStep {
  readonly mode: DraftMode;
  /** Authorises every order of the purchase, inside the placement transaction. */
  authorise(context: PaymentStepContext): Promise<void>;
}

/** The demo: no provider, no payment row; the guard authorises (§2, AC-2, AC-20). */
export const demoPaymentStep: CheckoutPaymentStep = {
  mode: "demo",
  async authorise({ executor, orderIds }) {
    for (const orderId of orderIds) {
      await orderService.transition(
        orderId,
        "order.authorised",
        DEMO_GUARD_ACTOR,
        { mode: "demo" },
        { executor },
      );
    }
  },
};

const registry = new Map<DraftMode, CheckoutPaymentStep>([
  ["demo", demoPaymentStep],
]);

/** Spec 013's seam: registers (or replaces) the step of `step.mode`. `demo` cannot be replaced. */
export function registerPaymentStep(step: CheckoutPaymentStep): void {
  if (step.mode === "demo") {
    throw new Error(
      "the demo payment step is spec 010's and calls no provider",
    );
  }
  registry.set(step.mode, step);
}

/** The registered step for `mode`, or `null` (placement then refuses as closed). */
export function paymentStepFor(mode: DraftMode): CheckoutPaymentStep | null {
  return registry.get(mode) ?? null;
}
