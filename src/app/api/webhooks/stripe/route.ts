/**
 * @purpose POST: Stripe webhook endpoint, verify, store before process, 200 (spec 013 AC-21 to AC-23)
 *
 * `POST /api/webhooks/stripe` (spec 013 §5.2 "Webhook inbox"; `plan/01` §9; TASK-260). Thin by
 * design (`plan/01` §5): the body is `ingestStripeWebhook` in `payments`, which verifies the raw
 * body against this environment's one signing secret, stores the event and asks for
 * `webhook.process` before the 200. Node runtime (the HMAC and the raw body), never cached.
 * Without `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` it answers 503 and stores nothing.
 */
import { enqueue, ensureQueues, withBoss } from "@/jobs/runtime";
import { env, environment } from "@/lib/env";
import { ingestStripeWebhook } from "@/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request): Promise<Response> {
  return ingestStripeWebhook(request, {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    livemode: environment === "production",
    enqueue: (inboxId) =>
      withBoss(async (boss) => {
        await ensureQueues(boss);
        await enqueue(
          boss,
          "webhook.process",
          { inboxId },
          { requestId: "system:payments.webhook" },
        );
      }),
  });
}
