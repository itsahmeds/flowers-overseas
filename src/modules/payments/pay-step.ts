/**
 * The pay step: `stripeTestPaymentStep` and `stripeLivePaymentStep`, registered in spec 010's
 * `CheckoutPaymentStep` registry (spec 013 §2 A, §5.2 "How a paid order flows", "Payment step and
 * provider"; §14 A-founder-2026-10-22 item 3; AC-1, AC-5, AC-7; TASK-262).
 *
 *  - `authorise` writes **nothing** inside spec 010's placement transaction: a `test` or `live`
 *    order stays `placed` until the money is taken (row 2, `order.captured`, by `reconcile`). No
 *    row 1 is ever written (charge at once, §14).
 *  - `prepare(input)` gives the Payment Element its **deferred-intent** options: the draft's
 *    confirmed total and currency (through `toStripeAmount`, so an unsupported currency throws),
 *    the method types from `paymentMethodTypesFor` (declared buyer country, currency, `available`,
 *    the `payments.method.{id}` flags; never a request header, ADR-0006), `captureMethod:
 *    'automatic'`, the publishable key and the Element's locale. No intent exists yet.
 *  - `confirm(purchaseId)` runs after placement commits: `startPayment(purchaseId)` (the pending
 *    row before the provider call, one intent for `purchase.total_minor`, key
 *    `pi:create:{paymentId}`; a second call returns the same intent) and hands back the client
 *    secret, for the island only: it is never logged, stored or put in a URL.
 *  - `sync(purchaseId)` is `syncFromProvider`, then the page's answer: `paid` once every order
 *    has left `placed`, else `unpaid` with the `declineMessageKey` of the payment's last decline
 *    code (the provider's message never reaches a page or an event, AC-5).
 *
 * **No exported function takes a charge amount** (AC-9): `prepare` echoes the draft's total into
 * the Element's display options only, and every amount sent to the provider is read from the
 * purchase by `startPayment`.
 *
 * **Registration** (`registerStripePaymentSteps`) happens only when the `routing` target has its
 * handler (§5.2: "each registers only when the routing handler of spec 016 is registered"), so a
 * `test` or `live` order can never be placed with nobody to route it, and only when the
 * environment has both Stripe keys. `checkoutMode()` still decides the mode; this file adds no
 * mode logic (spec 010 AC-1).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { isCurrencyCode } from "@/config/currencies";
import { isRegisteredFlagKey } from "@/config/feature-flags";
import {
  type CheckoutPaymentStep,
  type ConfirmOutcome,
  type PaymentPrepareInput,
  type PrepareOutcome,
  registerPaymentStep,
  type SyncOutcome,
} from "@/modules/checkout";
import { isOutboxHandlerRegistered, withExecutor } from "@/modules/orders";

import type { PaymentTransaction } from "./context.ts";
import { declineMessageKey } from "./decline.ts";
import {
  type LifecycleDeps,
  startPayment,
  syncFromProvider,
} from "./lifecycle.ts";
import {
  METHOD_CAPABILITIES,
  methodFlagKey,
  type MethodSources,
  paymentMethodTypesFor,
} from "./methods.ts";
import type { PaymentProvider } from "./provider.ts";
import { toStripeAmount } from "./stripe/amount.ts";
import { stripeLocaleFor } from "./stripe/locale.ts";

/** What a Stripe step needs; production builds it from the environment (`stripeStepDeps`). */
export interface StripeStepDeps {
  /** The provider, built on first use (the adapter, or a test's fake). */
  readonly provider: () => PaymentProvider;
  /** `STRIPE_PUBLISHABLE_KEY`: the Element's key, public by design. */
  readonly publishableKey: string;
  /** The `payments.method.{id}` flags that are on (and, in tests, the method registry). */
  readonly methodSources: () => Promise<MethodSources>;
  /** Spec 013's lifecycle seams (tests: a transaction, a clock, an alert). */
  readonly lifecycle?: Omit<LifecycleDeps, "provider" | "methodSources">;
}

/** `PLACED`: the only status a payable order is in. */
const PLACED = "placed";

const StatusRow = z.object({
  status: z.string(),
  last_decline_code: z.string().nullable(),
});

/** One Stripe step for `mode` (the file header). */
export function stripePaymentStep(
  mode: "test" | "live",
  deps: StripeStepDeps,
): CheckoutPaymentStep {
  const lifecycle = (): LifecycleDeps => ({
    ...deps.lifecycle,
    provider: deps.provider(),
    methodSources: deps.methodSources,
  });
  return {
    mode,
    // Nothing is written in the placement transaction: the orders stay `placed` until row 2.
    authorise: () => Promise.resolve(),
    async prepare(input: PaymentPrepareInput): Promise<PrepareOutcome> {
      if (!isCurrencyCode(input.currency)) {
        return { kind: "payments_unavailable" };
      }
      const amountMinor = toStripeAmount({
        amountMinor: input.amountMinor,
        currency: input.currency,
      });
      const types = paymentMethodTypesFor(
        {
          buyerCountryDeclared: input.buyerCountryDeclared,
          currency: input.currency,
        },
        await deps.methodSources(),
      ).providerTypes;
      if (types.length === 0 || deps.publishableKey === "") {
        return { kind: "payments_unavailable" };
      }
      return {
        kind: "ready",
        preparation: {
          elementOptions: {
            mode: "payment",
            amountMinor,
            currency: input.currency.toLowerCase(),
            methodTypes: [...types],
            captureMethod: "automatic",
          },
          publishableKey: deps.publishableKey,
          stripeLocale: stripeLocaleFor(input.locale),
        },
      };
    },
    async confirm(purchaseId: string): Promise<ConfirmOutcome> {
      const started = await startPayment(purchaseId, lifecycle());
      switch (started.kind) {
        case "started":
          return { kind: "confirm", clientSecret: started.clientSecret };
        case "payments_unavailable":
          return { kind: "payments_unavailable" };
        case "not_payable":
          return { kind: "not_payable" };
      }
    },
    async sync(purchaseId: string): Promise<SyncOutcome> {
      const id = z.uuid().parse(purchaseId);
      const resolved = lifecycle();
      await syncFromProvider(id, resolved);
      const run: PaymentTransaction =
        resolved.transaction ??
        ((fn) => withExecutor(undefined, "payments.pay_step", fn));
      const rows = await run(async (executor) =>
        executor.execute(sql`
          SELECT o.status, p.last_decline_code
            FROM "order" o
            LEFT JOIN payment p ON p.purchase_id = o.purchase_id
                               AND p.status NOT IN ('cancelled', 'failed')
           WHERE o.purchase_id = ${id}`),
      );
      const parsed = rows.map((raw) => StatusRow.parse(raw));
      if (parsed.length > 0 && parsed.every((row) => row.status !== PLACED)) {
        return { kind: "paid" };
      }
      const code = parsed.find(
        (row) => row.last_decline_code !== null,
      )?.last_decline_code;
      return {
        kind: "unpaid",
        messageKey: code === undefined ? null : declineMessageKey(code),
      };
    },
  };
}

/**
 * The method flags as `MethodSources`, read through `reader` (`isEnabled` in production). A key
 * the flag registry does not know yet reads as off (TASK-421 seeds `payments.method.*`): fail
 * closed, never a throw on a buyer's request. No request header is an input (AC-7, ADR-0006).
 */
export function methodSourcesFromFlags(
  reader: (key: string) => Promise<boolean>,
): () => Promise<MethodSources> {
  return async () => {
    const enabledFlags = new Set<string>();
    for (const capability of METHOD_CAPABILITIES) {
      const key = methodFlagKey(capability.id);
      if (!isRegisteredFlagKey(key)) continue;
      if (await reader(key)) enabledFlags.add(key);
    }
    return { enabledFlags };
  };
}

export interface RegisterStripeStepsOptions {
  readonly deps: StripeStepDeps;
  /** Whether the `routing` target has its handler (spec 016); the dispatcher's own answer by default. */
  readonly routingReady?: () => boolean;
}

/**
 * Registers both steps when the router exists and the keys are present (the file header).
 * Returns the modes registered, for the caller's log.
 */
export function registerStripePaymentSteps(
  options: RegisterStripeStepsOptions,
): readonly ("test" | "live")[] {
  const routingReady =
    options.routingReady ?? (() => isOutboxHandlerRegistered("routing"));
  if (!routingReady() || options.deps.publishableKey === "") return [];
  const modes = ["test", "live"] as const;
  for (const mode of modes) {
    registerPaymentStep(stripePaymentStep(mode, options.deps));
  }
  return modes;
}
