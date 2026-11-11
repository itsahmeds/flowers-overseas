/**
 * Registers spec 013's Stripe payment steps in the web process, once (TASK-262). Every server entry
 * that asks spec 010 for the checkout mode or pays (the start route, the basket and checkout pages,
 * their actions, and the return route) calls `ensureStripePaymentSteps()` at the top of its handler.
 *
 * **Never at import time (TASK-503).** `next build` imports every route module to collect page
 * data, and the container build holds no server secrets, so reading `env` at module load throws
 * `EnvValidationError` and fails the build. The first request registers the steps instead.
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
import { EnvValidationError, env } from "@/lib/env";
import { isEnabled } from "@/lib/flags";
import { logger } from "@/lib/logger";

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
  let secretKey: string;
  let publishableKey: string;
  try {
    secretKey = env.STRIPE_SECRET_KEY ?? "";
    publishableKey = env.STRIPE_PUBLISHABLE_KEY ?? "";
  } catch (error) {
    // An environment that fails validation (`EnvValidationError`) registers nothing: the checkout
    // stays `demo` or `closed`, and the caller (the start route, the basket and checkout pages)
    // answers instead of a bare 500 (TASK-504). The error names keys only, never a value; this
    // line carries its name and the key names.
    logger.error(
      {
        code: "payments_env_invalid",
        error_name: error instanceof Error ? error.name : "unknown",
        keys: error instanceof EnvValidationError ? error.keys : [],
      },
      "payments.wiring",
    );
    return;
  }
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
      // Spec 021 (TASK-493): `risk.pay_pause` for the pay-step pre-check.
      riskFlag: (key) =>
        isRegisteredFlagKey(key) ? isEnabled(key) : Promise.resolve(false),
    },
  });
}
