/**
 * @purpose POST: Resend webhook endpoint, Svix verify, store before process, 200 (spec 016 AC-28)
 *
 * `POST /api/webhooks/resend` (spec 016 §5.2 "Resend webhooks", §5.4; TASK-335). Thin by design
 * (`plan/01` §5): the body is `ingestResendWebhook` in `notifications`, which verifies the Svix
 * signature and timestamp against `RESEND_WEBHOOK_SECRET`, stores the event in `webhook_inbox` and
 * asks for `webhook.resend.process` before the 200. Node runtime (the HMAC and the raw body),
 * never cached. Without the secret it answers 503 and stores nothing.
 */
import { enqueue, ensureQueues, withBoss } from "@/jobs/runtime";
import { env } from "@/lib/env";
import { ingestResendWebhook } from "@/modules/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request): Promise<Response> {
  return ingestResendWebhook(request, {
    secret: env.RESEND_WEBHOOK_SECRET,
    enqueue: (inboxId) =>
      withBoss(async (boss) => {
        await ensureQueues(boss);
        await enqueue(
          boss,
          "webhook.resend.process",
          { inboxId },
          { requestId: "system:notifications.resend_webhook" },
        );
      }),
  });
}
