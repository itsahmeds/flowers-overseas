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

/**
 * What step 3 hands the Payment Element before any order exists (spec 013 §5.2 "Payment step",
 * deferred intent): the amount and currency of the draft's confirmed total, the method types,
 * automatic capture, the publishable key and the Element's locale. No intent exists yet.
 */
export interface PaymentPreparation {
  readonly elementOptions: {
    readonly mode: "payment";
    readonly amountMinor: number;
    readonly currency: string;
    readonly methodTypes: readonly string[];
    readonly captureMethod: "automatic";
  };
  readonly publishableKey: string;
  readonly stripeLocale: string;
}

/** What a step asks the provider for at step 3: the draft's total and the declared country. */
export interface PaymentPrepareInput {
  readonly amountMinor: number;
  readonly currency: string;
  readonly buyerCountryDeclared: string;
  readonly locale: string;
}

export type PrepareOutcome =
  | { readonly kind: "ready"; readonly preparation: PaymentPreparation }
  | { readonly kind: "payments_unavailable" };

/** `confirm`'s answer: the intent's client secret for the island only, or why not. */
export type ConfirmOutcome =
  | { readonly kind: "confirm"; readonly clientSecret: string }
  | { readonly kind: "payments_unavailable" }
  | { readonly kind: "not_payable" };

/** `sync`'s answer: whether the purchase is now paid, still unpaid, or what the decline was. */
export type SyncOutcome =
  | { readonly kind: "paid" }
  | { readonly kind: "unpaid"; readonly messageKey: string | null };

/**
 * One mode's payment step (spec 013 adds `test` and `live`). `prepare`, `confirm` and `sync` are
 * spec 013's (§5.2 "Payment step"): optional, so the demo step needs none of them.
 */
export interface CheckoutPaymentStep {
  readonly mode: DraftMode;
  /** Authorises every order of the purchase, inside the placement transaction. */
  authorise(context: PaymentStepContext): Promise<void>;
  /** Step 3's Element options from the draft's total (no intent yet). */
  prepare?(input: PaymentPrepareInput): Promise<PrepareOutcome>;
  /** After placement commits: the purchase's one intent (a second call returns the same one). */
  confirm?(purchaseId: string): Promise<ConfirmOutcome>;
  /** Reads the provider and reconciles the purchase (the return route, a decline). */
  sync?(purchaseId: string): Promise<SyncOutcome>;
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
