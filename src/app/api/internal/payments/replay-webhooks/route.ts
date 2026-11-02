/**
 * @purpose POST: secret-gated replay of missed Stripe webhooks, counts only (spec 013 AC-26)
 *
 * `POST /api/internal/payments/replay-webhooks` (spec 013 §5.2 "Webhook inbox", AC-26; TASK-260),
 * what `pnpm jobs:replay-webhooks` calls. Gated like the other internal routes by
 * `INTERNAL_CRON_SECRET` in `x-internal-cron-secret`, compared in constant time. Body
 * `{ since?: ISO, inboxId?: uuid, dryRun?: boolean }`, exactly one of `since` and `inboxId`. The
 * work is `replayStripeWebhooks` in `payments`; the answer is counts, never an event.
 */
import { hasInternalSecret, INTERNAL_HEADERS } from "@/jobs/internal";
import { enqueue, ensureQueues, withBoss } from "@/jobs/runtime";
import { env, environment } from "@/lib/env";
import { replayStripeWebhooks } from "@/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function answer(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...INTERNAL_HEADERS },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!hasInternalSecret(request, env.INTERNAL_CRON_SECRET)) {
    return answer(401, { ok: false, error: "unauthorized" });
  }
  const result = await replayStripeWebhooks(request, {
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
          { requestId: "system:payments.replay" },
        );
      }),
  });
  return answer(result.status, result.body);
}
