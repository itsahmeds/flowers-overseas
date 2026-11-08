/**
 * @purpose POST: secret-gated backfill of Stripe balance facts, counts only (spec 030b §5.2, §12)
 *
 * `POST /api/internal/payments/backfill-balance` (spec 030b §5.2 `scripts/`, §12 "Before the founder
 * relies on the figures"; TASK-439), what `pnpm payments:backfill-balance` calls. Gated like the
 * other internal routes by `INTERNAL_CRON_SECRET` in `x-internal-cron-secret`, compared in constant
 * time. Body `{ since: ISO, dryRun?: boolean }`. The work is `runBalanceBackfill` in `payments`:
 * one `payments.balance_fetch` per payment captured, refund succeeded and dispute opened since the
 * instant, keyed `{kind}:{ref}`; the answer is counts, never a payment.
 */
import { hasInternalSecret, INTERNAL_HEADERS } from "@/jobs/internal";
import { enqueue, ensureQueue, withBoss } from "@/jobs/runtime";
import { env } from "@/lib/env";
import { balanceFetchKey, runBalanceBackfill } from "@/modules/payments";

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return answer(400, { ok: false, error: "invalid_request" });
  }
  const result = await withBoss(async (boss) => {
    await ensureQueue(boss, "payments.balance_fetch");
    return runBalanceBackfill(body, {
      enqueue: async (job) => {
        await enqueue(boss, "payments.balance_fetch", job, {
          requestId: "system:payments.backfill_balance",
          singletonKey: balanceFetchKey(job.source),
        });
      },
    });
  });
  return answer(result.status, result.body);
}
