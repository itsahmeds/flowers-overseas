/**
 * Registers spec 013's Stripe payment steps in the web process, once (TASK-262). Imported for its
 * side effect by every server entry that asks spec 010 for the checkout mode or pays: the start
 * route, the checkout page and its actions, and the return route.
 *
 * **Why `routingReady` is true here.** The steps register only when spec 016's `routing` handler
 * exists (§5.2). The handler runs where the outbox is dispatched, the worker's job table
 * (`src/jobs/handlers.ts`), which registers it unconditionally at load (`registerRoutingOutbox()`,
 * TASK-328); the web process places orders and never dispatches. So the web's answer is a fact
 * about the deployment, proved by `tests/unit/pay-step.test.ts` reading the job table, not by
 * this process's own registry. Without both Stripe keys nothing registers, and the checkout stays
 * `demo` or `closed` exactly as before.
 */
import "server-only";

import { isRegisteredFlagKey } from "@/config/feature-flags";
import { env } from "@/lib/env";
import { isEnabled } from "@/lib/flags";

import {
  methodSourcesFromFlags,
  registerStripePaymentSteps,
} from "./pay-step.ts";
import { createStripeProvider } from "./stripe/adapter.ts";

let registered = false;

/** Registers both steps once per process when the environment holds the Stripe keys. */
export function ensureStripePaymentSteps(): void {
  if (registered) return;
  registered = true;
  const secretKey = env.STRIPE_SECRET_KEY ?? "";
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY ?? "";
  if (secretKey === "" || publishableKey === "") return;
  registerStripePaymentSteps({
    routingReady: () => true,
    deps: {
      provider: () =>
        createStripeProvider({
          secretKey,
          webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
        }),
      publishableKey,
      methodSources: methodSourcesFromFlags((key) =>
        isRegisteredFlagKey(key) ? isEnabled(key) : Promise.resolve(false),
      ),
    },
  });
}

ensureStripePaymentSteps();
