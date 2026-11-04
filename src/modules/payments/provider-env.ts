/**
 * The production `PaymentProvider`, built from the environment (spec 013 §5.2 "Keys and
 * environments"; TASK-259).
 *
 * `stripeProviderFromEnv()` reads `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` and returns the
 * Stripe adapter over them. Without either it throws `PAYMENTS_NOT_CONFIGURED` (the founder opens
 * the Stripe account after the domain is live, spec 013 §12 action 1), so a caller that needs the
 * provider fails and is retried, exactly as the unregistered stand-in did. A live key outside
 * `production` is refused again here (spec 013 AC-10), whatever the boot check said. The message
 * names the missing key, never a value.
 */
import { appEnvironment, LIVE_STRIPE_KEY_PREFIXES } from "@/lib/env.schema";

import type { PaymentProvider } from "./provider.ts";
import type { RefundDeps } from "./refunds.ts";
import { createStripeProvider } from "./stripe/adapter.ts";

/** Thrown when the environment holds no usable Stripe keys. */
export class PaymentsNotConfigured extends Error {
  readonly code = "PAYMENTS_NOT_CONFIGURED";

  constructor(detail: string) {
    super(`PAYMENTS_NOT_CONFIGURED: ${detail}`);
    this.name = "PaymentsNotConfigured";
  }
}

type EnvSource = Readonly<Record<string, string | undefined>>;

function present(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** The Stripe adapter over the environment's keys, or `PaymentsNotConfigured`. */
export function stripeProviderFromEnv(
  source: EnvSource = process.env,
): PaymentProvider {
  const secretKey = present(source["STRIPE_SECRET_KEY"]);
  const webhookSecret = present(source["STRIPE_WEBHOOK_SECRET"]);
  if (secretKey === null) {
    throw new PaymentsNotConfigured("STRIPE_SECRET_KEY is not set");
  }
  if (webhookSecret === null) {
    throw new PaymentsNotConfigured("STRIPE_WEBHOOK_SECRET is not set");
  }
  if (
    appEnvironment(source) !== "production" &&
    LIVE_STRIPE_KEY_PREFIXES.some((prefix) => secretKey.startsWith(prefix))
  ) {
    throw new PaymentsNotConfigured(
      "a live STRIPE_SECRET_KEY outside production",
    );
  }
  return createStripeProvider({ secretKey, webhookSecret });
}

/**
 * The refund dependencies of spec 020a's admin refund dialog (TASK-361, the one barrel export
 * TASK-259's hand-off asked for): the Stripe adapter over the environment's keys, or `null` when
 * the keys are missing or refused. The admin page renders its refund controls only when this is
 * not `null`, and the refund action refuses without writing anything when it is, so no refund row
 * waits on a provider that does not exist. Any other failure is a bug and is thrown.
 */
export function adminRefundDeps(
  source: EnvSource = process.env,
): RefundDeps | null {
  try {
    return { provider: stripeProviderFromEnv(source) };
  } catch (error) {
    if (error instanceof PaymentsNotConfigured) return null;
    throw error;
  }
}
