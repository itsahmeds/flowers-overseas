/**
 * The handlers the minute tick runs, by registered job name (spec 002 §5.2; TASK-024).
 *
 * TASK-024 registered the queues and the payload schemas; each handler is its own task —
 * `retention.sweep` TASK-025 (here), `db.backup_verify` TASK-028, `neon.usage_probe` TASK-029,
 * `media.derive_variants` spec 006 (TASK-082, here). Each adds one entry here. Until a name has an
 * entry, `runTick` does not fetch from its queue, so a job enqueued early waits (and shows in
 * `/api/internal/db-health`'s `pending_jobs`) rather than being consumed by nothing.
 *
 * **Every handler must be idempotent.** `runTick` settles each fetched job once, but delivery is
 * at least once: a process killed between a handler's work and `complete` leaves the job `active`
 * until it expires, and pg-boss then hands it out again (review N7, PR 224). The retention sweep
 * is: a pseudonymised row carries its marker and is not selected again, a deleted row is gone.
 */
import { z } from "zod";

import { withSystemContext } from "../lib/db";
import { logger } from "../lib/logger";
import {
  createNbpRateProvider,
  getPdfByInvoiceId,
  invoiceFlagOn,
  invoicesOutboxHandler,
  runInvoiceRenderSweep,
  runRenderJob,
  setVatRateProvider,
} from "../modules/invoices";
// Spec 016 §5.3 (TASK-332): the founder's emails read their English copy and the admin order path
// from the admin module's own files, not its barrel, so the worker loads no admin sign-in surface.
import { adminT } from "../modules/admin/messages";
import { orderDetailHref } from "../modules/admin/orders";
import { registerAnalyticsOutbox } from "../modules/analytics";
import { alertDetailHref, alertsListHref } from "../modules/admin/alerts";
import { partnerContractsHref } from "../modules/admin/partners";
import { payoutDetailHref, payoutsListHref } from "../modules/admin/payouts";
import {
  registerNotificationsOutbox,
  runResendNotificationJob,
  runResendWebhookJob,
} from "../modules/notifications";
// The email templates are not in the notifications barrel: no page may reach their copy.
import {
  registerBuyerEmailTemplates,
  registerFloristEmailTemplates,
  registerOpsEmailTemplates,
  payoutStatementPdf,
  registerPayoutStatementTemplate,
  runInvoiceEmailJob,
} from "../modules/notifications/emails";
// Spec 018 §5.2 (TASK-339): the succeeded refunds, outside the `orders` barrel (it reads `payments`).
import { buyerRefundLines } from "../modules/orders/buyer-refund-lines";
import {
  dispatchOutbox,
  orderReference,
  registerOutboxHandler,
  routingDeadline,
} from "../modules/orders";
import { fxSnapshotStatus } from "../modules/catalog";
import {
  dispatchAlert,
  runDailySummary,
  raiseLegacyAlert,
  runEscalation,
  runMonitor,
} from "../modules/ops";
import {
  adminRefundDeps,
  attemptStats,
  cancelOrder,
  disputesFor,
  productionStartAt,
  requestBalanceRefund,
  riskFactsFor,
  submitRefund,
  type EarlyFraudWarningHandler,
  stripeProviderFromEnv,
  balanceFetchKey,
  balanceProviderFromEnv,
  registerPaymentsOutbox,
  runBalanceFetch,
  runBalanceSweep,
  runPaymentsMonitor,
  runProductionStart,
  type BalanceFetchJobInput,
} from "../modules/payments";
// Spec 030a §5.2 (TASK-363): the `payouts` target and F1's job, the worker's entry, not the barrel.
import {
  closeDuePayouts,
  registerPayoutsOutbox,
  runStatementEmailJob,
  sendPrepaidReady,
  watchMissingLines,
} from "../modules/partners/payouts";
// The close is not in the `orders` barrel: importing it registers `OrderClosedV1`, and only the
// processes that close orders need that (spec 022a §5.2, TASK-369).
import { runCloseSweep } from "../modules/orders/close";
// Spec 016's routing jobs: not in the barrel either (they register `assignment.timed_out`).
import {
  expireNoPartner,
  photoRemind,
  registerRoutingOutbox,
  remindAssignment,
  routeOrder,
  timeoutAssignment,
  watchRoutingSla,
} from "../modules/orders/routing/jobs";

import {
  detectCardTesting,
  type GateDeps,
  handleEarlyFraudWarning,
  riskGatedRouting,
  riskOutboxHandler,
  type RiskRefund,
  runReviewDeadlines,
} from "../modules/risk";
import { appEnvironment } from "../lib/env.schema";
import { runRetentionSweep } from "./retention";
import type { JobHandlers } from "./runtime";

/**
 * Spec 025 (TASK-488, TASK-489): what every alert job needs from outside the ops module. The admin
 * catalogue's English copy (only admin code reads it), the order reference rule and spec 016's
 * routing deadline are handed in here, so the ops module imports neither the admin module nor
 * the orders barrel.
 */
const opsAlertDeps = {
  t: adminT as unknown as (
    key: string,
    values?: Readonly<Record<string, string>>,
  ) => string,
  reference: orderReference,
  alertPath: (alertId?: string) =>
    alertId === undefined ? alertsListHref() : alertDetailHref(alertId),
};

/**
 * Spec 030b §5.2 (TASK-439): one `payments.balance_fetch`, keyed `{kind}:{ref}` (the `short`
 * queue keeps at most one waiting job per key), not before `startAfter` when given. The pg-boss
 * runtime and the flag reader load on first use, so loading the job table connects to nothing.
 */
export async function enqueueBalanceFetch(
  job: BalanceFetchJobInput,
  startAfter?: Date,
): Promise<void> {
  const { enqueue, ensureQueue, withBoss } = await import("./runtime");
  await withBoss(async (boss) => {
    await ensureQueue(boss, "payments.balance_fetch");
    await enqueue(boss, "payments.balance_fetch", job, {
      requestId: "system:payments.balance_fetch",
      singletonKey: balanceFetchKey(job.source),
      ...(startAfter === undefined ? {} : { startAfter }),
    });
  });
}

async function balanceFlagOn(): Promise<boolean> {
  const { isEnabled } = await import("../lib/flags");
  return isEnabled("payments.balance_fetch");
}

/** One read of an original by the derive worker: a large original on a slow link, not a hang. */
const DERIVE_READ_TIMEOUT_MS = 60_000;

// Spec 023 §5.2 (TASK-491): the `analytics.ga4` target, GA4 `purchase` and `refund` by Measurement
// Protocol. Every reason not to send (no id or secret, `analytics.mp_send` off, no consent) is a
// recorded skip, so the target is never held.
registerAnalyticsOutbox();

// Spec 018 §5.2 (TASK-341): the `invoices` outbox target issues invoices and credit notes in the
// delivery's transaction. Registered once, where the dispatcher's job is defined.
registerOutboxHandler("invoices", invoicesOutboxHandler());

// Spec 013 §5.2 (TASK-259): the `payments` target. `assignment.accepted` writes row 14 (and row 16
// past the production-start instant) with no provider call; a cancel refunds through the Stripe
// adapter built from the environment at the first refund, and is retried while no key is set.
registerPaymentsOutbox();

// Spec 018 §5.2 (TASK-342): the PLN VAT line's rate, NBP table A of the last business day before
// the tax point, for every profile whose `vat_currency_code` differs from the invoice currency.
setVatRateProvider(createNbpRateProvider());

/**
 * Spec 021 §5.2 (TASK-494): what the risk gate and its deadline default need from payments. The
 * Stripe provider is built from the environment at the first assessment (never at load); without
 * keys `riskFactsFor` fails, the gate retries once and then holds the order (S16).
 */
const riskGateDeps: GateDeps = {
  riskFactsFor: (orderId, executor) =>
    riskFactsFor(orderId, {
      provider: stripeProviderFromEnv(),
      transaction: (fn) => fn(executor),
    }),
  cancelOrder: (orderId, actor, reason, options) =>
    cancelOrder(orderId, actor, reason, options),
  alert: raiseLegacyAlert,
};

/** Spec 021 §5.2 (TASK-495): the order's remaining balance as one refund, on the caller's transaction. */
const riskRefundBalance: RiskRefund = (orderId, actor, reason, executor) =>
  requestBalanceRefund(orderId, actor, reason, executor);

/**
 * Sends a risk refund after its transaction committed. Without Stripe keys it stays `requested`
 * and `payments.sweep` (d) sends it once they exist.
 */
async function submitRiskRefund(refundId: string): Promise<void> {
  const deps = adminRefundDeps();
  if (deps !== null) await submitRefund(refundId, deps);
}

/**
 * Spec 021 §5.2 (TASK-495): `risk.handleEarlyFraudWarning`, for `webhook.process` to hand to spec
 * 013's `processWebhook` as `earlyFraudWarning` when TASK-266 wires that job with the production
 * provider. A `decide_now` refund it requests is sent by `payments.sweep` (d).
 */
export const earlyFraudWarningHandler: EarlyFraudWarningHandler = async (
  input,
  executor,
) => {
  await handleEarlyFraudWarning(input, executor, {
    cancelOrder: riskGateDeps.cancelOrder,
    refundBalance: riskRefundBalance,
    productionStartAt: (timing) => productionStartAt(timing),
    alert: raiseLegacyAlert,
  });
};

// Spec 021 §5.2 "Chargebacks" (TASK-495): the `risk` target. A `fraudulent` dispute puts the
// order's email and card hashes on the blocklist (`source = 'dispute'`) and supersedes open reviews.
registerOutboxHandler(
  "risk",
  riskOutboxHandler({
    disputesFor: (executor, orderId) => disputesFor(executor, orderId),
  }),
);

// Spec 016 §5.2 (TASK-328): the `routing` target, for `test` and `live` orders: a secured
// payment enqueues `order.route`, a delivery the photo reminder. Replaces the stand-in that made
// every routing delivery end `dead`. Spec 021 §5.2 (TASK-494): composed as
// `routing: riskGatedRouting(routingHandler)`, so a paid order is assessed before any offer.
registerRoutingOutbox({}, (inner) => riskGatedRouting(inner, riskGateDeps));

// Spec 016 §5.2 (TASK-331): the `notifications` target and its hold. While `notifications.email`
// is off, every notifications delivery stays `pending` and is sent once when it is turned on.
registerNotificationsOutbox({
  // Spec 016 §5.2, AC-23: each florist email's one-tap link, its callback the order's inbox page.
  // Loaded at the first florist email, so loading the job table builds no sign-in surface.
  signInLink: async (userId, callbackPath) => {
    const [{ floristAuth }, { createSignInLink }] = await Promise.all([
      import("../lib/auth/florist"),
      import("../lib/auth/surface"),
    ]);
    return createSignInLink(floristAuth, userId, { callbackPath });
  },
});

// Spec 016 §5.3 (TASK-332): the florist emails V1 to V5 and the founder's A1 and W. Until a
// template is registered, a delivery that needs it throws `TEMPLATE_NOT_BUILT` and is retried.
registerFloristEmailTemplates();
// Spec 030a §5.2 (TASK-365): the florist's payout statement, its PDF attached.
registerPayoutStatementTemplate();
registerOpsEmailTemplates({
  t: adminT as unknown as (
    key: string,
    values?: Readonly<Record<string, string>>,
  ) => string,
  orderHref: orderDetailHref,
  // Spec 030a §2.8: F1's link to the payout's admin page (TASK-367 builds the page).
  payoutHref: payoutDetailHref,
  // Spec 030a §2.7: F2's link to the payouts list (TASK-364; TASK-367 builds the page).
  payoutsHref: payoutsListHref,
  // Spec 030b §14.4: C1 and C2's link to the florist's Contracts tab (TASK-442).
  contractsHref: partnerContractsHref,
});

// Spec 016 §5.2 (TASK-333): the buyer emails B1 to B6 and B8. The refunds come through spec 013's
// `succeededRefunds`, and B4's photo is read from the private bucket through a short signed URL and
// attached as bytes (§13 16-8: attached, never linked). Loaded at the first B4, so loading the job
// table loads no storage client.
/** Spec 030b's private contract store, or `undefined` when no private bucket is configured. */
async function optionalContractStorage() {
  try {
    const { privateContractStore } =
      await import("../modules/partners/contracts");
    return (await privateContractStore()).storage;
  } catch {
    return undefined;
  }
}

/** The stored delivery photo (a 1,200 px JPEG, spec 011): some bytes, and well under Resend's 40 MB. */
const DeliveryPhotoBytesSchema = z
  .instanceof(ArrayBuffer)
  .refine(
    (buffer) => buffer.byteLength > 0 && buffer.byteLength <= 15 * 1024 * 1024,
  );

registerBuyerEmailTemplates({
  refundLines: (orderId, options) => buyerRefundLines(orderId, options),
  photoContent: async (location) => {
    const { deliveryPhotoSignedUrl, privatePhotoStoreFrom } =
      await import("../modules/orders/photo");
    const url = await deliveryPhotoSignedUrl(privatePhotoStoreFrom(), location);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `delivery photo read failed: HTTP ${String(response.status)}`,
      );
    }
    return Buffer.from(
      DeliveryPhotoBytesSchema.parse(await response.arrayBuffer()),
    ).toString("base64");
  },
  // Spec 016 §5.2 (TASK-334): B1 waits up to `B1_INVOICE_WAIT` for the purchase's invoice PDFs
  // where `invoice.issue` is on, and B1 and B8 attach spec 018's stored bytes (hash checked).
  invoices: {
    read: (invoiceId, executor) => getPdfByInvoiceId(invoiceId, { executor }),
    issueOn: invoiceFlagOn,
  },
});

// Spec 030a §5.2 (TASK-363): the `payouts` target for `live` acceptances, held while
// `payouts.accrue` is off; a prepaid payout enqueues F1.
registerPayoutsOutbox();

export const JOB_HANDLERS: JobHandlers = {
  // Spec 006 §2.6, AC-25 (TASK-082): the variant ladder of one asset, written once per (asset,
  // variant, format). Loaded on first use, so `sharp` and the seed manifest load only in a tick
  // that has such a job. A refusal (missing, unapproved or unknown asset) completes the job and is
  // logged by its closed-set reason; a storage or network failure throws and pg-boss retries it.
  // The log line carries counts and the reason, never the asset id or an object key.
  "media.derive_variants": async (payload) => {
    const { deriveAssetVariants } = await import("./media-derive-variants");
    const { R2Storage, r2EnvironmentFrom } = await import("../lib/storage-r2");
    const r2 = r2EnvironmentFrom(process.env);
    const outcome = await deriveAssetVariants(
      {
        transaction: (fn) => withSystemContext("media.derive_variants", fn),
        storage: new R2Storage(r2.config),
        fetch: (url) =>
          fetch(url, { signal: AbortSignal.timeout(DERIVE_READ_TIMEOUT_MS) }),
        publicBucket: r2.publicBucket,
        privateBucket: r2.privateBucket,
      },
      payload,
    );
    if (outcome.status === "refused") {
      logger.warn(
        { job: "media.derive_variants", reason: outcome.reason },
        "media.derive_variants.refused",
      );
      return;
    }
    logger.info(
      {
        job: "media.derive_variants",
        outcome: outcome.status,
        inserted: outcome.inserted,
        uploaded: outcome.uploaded,
        encoded: outcome.encoded,
      },
      "media.derive_variants.done",
    );
  },
  // Spec 013 §5.2 (TASK-254): each due outbox delivery in its own `system` transaction. Idempotent
  // by construction: a delivery is claimed `FOR UPDATE SKIP LOCKED` and settled once; a re-run
  // finds it `sent` or waiting out its backoff.
  "outbox.dispatch": async (payload) => {
    await dispatchOutbox(
      payload.orderId === undefined ? {} : { orderId: payload.orderId },
    );
  },
  // Spec 013 §5.2 (TASK-258): row 16 at 06:00 destination-local on the delivery date. Idempotent:
  // each due order is locked `SKIP LOCKED` and re-read; a second run finds it `in_production`.
  "payments.production_start": async () => {
    await runProductionStart();
  },
  // Spec 013 §5.2, §11 (TASK-264): the two monitors, AC-39 and AC-40. Read-only: it writes no
  // table and calls no provider, so a re-run raises the same alerts, which Sentry groups by their
  // fingerprint (`[alert, order_id]`) into the issue already open.
  "payments.monitor": async () => {
    await runPaymentsMonitor();
  },
  // Spec 016 §5.2 (TASK-335): one stored Resend webhook. Idempotent: the inbox row is locked
  // `SKIP LOCKED` and a settled one is skipped; a `failed` run throws so pg-boss retries it, and
  // the eighth attempt marks the row `dead` with one `webhook.dead`.
  "webhook.resend.process": async (payload) => {
    await runResendWebhookJob(payload.inboxId);
  },
  // Spec 020a §5.2 (TASK-360): one admin resend row. Idempotent: the row is locked and a row no
  // longer `queued` is skipped; the send's idempotency key is the row's own. Held (throws, retried)
  // while `notifications.email` is off.
  "notifications.resend": async (payload) => {
    await runResendNotificationJob(payload.deliveryId);
  },
  // Spec 022a §5.2 (TASK-369): every due order closed in its own `system` transaction. Idempotent:
  // each order is locked and re-read before it is closed, so a re-run or a second sweep finds it
  // `closed` and skips it.
  "order.close_sweep": async () => {
    await runCloseSweep();
  },
  // Spec 030a §5.2 (TASK-363): F1 for one prepaid payout. Idempotent: the pipeline's
  // `notification_delivery` key sends it once per payout; a gone payout sends nothing.
  "payouts.prepaid_ready": async (payload) => {
    await sendPrepaidReady(payload.payoutId);
  },
  // Spec 030a §5.2 (TASK-364): the weekly close, hourly. Idempotent: a closed payout is not open
  // any more and a rolled one is not due; F2 is keyed by the run's instant and rolls back with it.
  "payouts.close": async () => {
    await closeDuePayouts(new Date());
  },
  // Spec 030a §5.2 (TASK-364): F3 and `alert=payouts.line_missing`, once per order (its
  // `notification_delivery` key); an order already told is not selected again.
  "payouts.watch": async () => {
    await watchMissingLines();
  },
  // Spec 030a §5.2 (TASK-365): one sent payout's statement PDF, stored, and its email. Idempotent:
  // a payout whose `statement_media_asset_id` is set is done, and the delivery is keyed by payout.
  "payouts.statement_email": async (payload) => {
    await runStatementEmailJob(payload.payoutId, {
      renderPdf: payoutStatementPdf,
    });
  },
  // Spec 016 §5.2 (TASK-328): the cascade. Each is idempotent: it locks and re-reads what it
  // acts on, and a state it does not expect (an answered or withdrawn offer, an order that has
  // moved on, an offer already open) makes it a no-op, so a re-run writes nothing twice.
  "order.route": async (payload) => {
    await routeOrder(payload.orderId);
  },
  "assignment.remind": async (payload) => {
    await remindAssignment(payload.assignmentId);
  },
  "assignment.timeout": async (payload) => {
    await timeoutAssignment(payload.assignmentId);
  },
  "assignment.photo_remind": async (payload) => {
    await photoRemind(payload.orderId);
  },
  "routing.sla_watch": async () => {
    await watchRoutingSla();
  },
  // Spec 016 §5.2 (TASK-329): the end of the grace window. Idempotent: it locks and re-reads the
  // order; one that has moved on (rerouted, cancelled) or is not yet due writes nothing.
  "order.no_partner_expire": async (payload) => {
    await expireNoPartner(payload.orderId);
  },
  // Spec 018 §5.2, §11 (TASK-342): one document's PDF, rendered and stored once. Idempotent: the
  // row is locked and a rendered one is left alone, so a re-run enqueues no second email. The
  // fifth failed attempt raises `invoice.render_dead`.
  "invoice.render": async (payload, context) => {
    await runRenderJob(payload.invoiceId, {
      retryCount: context.retryCount ?? 0,
    });
  },
  // Spec 018 §11 (TASK-342): every unrendered document is asked a render job (one per document
  // on its queue), and one 15 minutes old raises `invoice.render_overdue`. Reads only; idempotent.
  "invoice.render_sweep": async () => {
    await runInvoiceRenderSweep();
  },
  // Spec 016 §5.2 (TASK-334): B8 for one stored document. A credit note always; an invoice only
  // when its purchase's B1 went without it (retried while that B1 is absent or `queued`). Idempotent:
  // the delivery is keyed `job:invoice.email:{invoiceId}`, so a re-run finds it `sent`.
  "invoice.email": async (payload) => {
    await runInvoiceEmailJob(payload.invoiceId);
  },
  // Spec 025 §5.2 (TASK-488): one alert's push and email. Keyed `alertId:kind`; a re-run may
  // repeat a push (at least once), and the email carries a Resend idempotency key.
  "alerts.dispatch": async (payload) => {
    await dispatchAlert(payload, opsAlertDeps);
  },
  // Spec 025 §5.2 (TASK-489): the minute's checks. Writes only `ops_alert`; a re-run raises the
  // same fingerprints, which deduplicate into the rows already open.
  // Spec 021 §5.2 (TASK-493): the card-testing detector. A re-run in the same window finds the
  // pause it wrote (live) and raises nothing new; in test the alert log deduplicates.
  "risk.monitor": async () => {
    const live = appEnvironment(process.env) === "production";
    await detectCardTesting({
      mode: live ? "live" : "test",
      attemptStats: (since, until) =>
        attemptStats(since, until, { livemode: live }),
      alert: raiseLegacyAlert,
    });
    // Spec 021 §5.2 (TASK-494): deadline defaults and due-soon alerts. Each review is decided in
    // its own transaction under the order's lock, so a re-run finds it decided.
    // Spec 021 §5.2 (TASK-495): a post-routing review's deadline refunds in full, sent after commit.
    await runReviewDeadlines({
      cancelOrder: riskGateDeps.cancelOrder,
      refundBalance: riskRefundBalance,
      submitRefund: submitRiskRefund,
      alert: raiseLegacyAlert,
    });
  },
  "alerts.monitor": async (_payload, context) => {
    await runMonitor({
      ...(context.queue === undefined ? {} : { queue: context.queue }),
      routingDeadline: (deliveryDate, destination) =>
        routingDeadline(
          deliveryDate as Parameters<typeof routingDeadline>[0],
          destination,
        ),
    });
  },
  // Spec 025 §5.5 (TASK-489): receipts, escalation, bumps, reminders, the morning digest and the
  // daily summary's enqueue. Each step selects only what it has not done yet, so a re-run is a
  // no-op.
  "alerts.escalate": async () => {
    await runEscalation({
      ...opsAlertDeps,
      enqueueSummary: async (date) => {
        const { enqueue, withBoss } = await import("./runtime");
        await withBoss(async (boss) => {
          await enqueue(
            boss,
            "alerts.daily_summary",
            { date },
            { requestId: "system:alerts.escalate", singletonKey: date },
          );
        });
      },
    });
  },
  // Spec 025 §5.2 (TASK-489): one date's summary, once (`summary_sent_for`).
  "alerts.daily_summary": async (payload, context) => {
    await runDailySummary(payload.date, {
      ...opsAlertDeps,
      ...(context.queue === undefined ? {} : { queue: context.queue }),
      fxAsOf: () => fxSnapshotStatus().fxAsOf,
    });
  },
  // Spec 030b §5.2 (TASK-439): one source's balance facts. Idempotent: facts are stored
  // `ON CONFLICT (provider_txn_ref) DO NOTHING`. Without Stripe keys the provider throws
  // `PAYMENTS_NOT_CONFIGURED` and pg-boss retries; with the flag off nothing is asked and the job
  // re-enqueues itself for later; an empty list re-enqueues on the backoff ladder for 72 hours.
  "payments.balance_fetch": async (payload) => {
    await runBalanceFetch(payload, {
      provider: () => balanceProviderFromEnv(),
      flagOn: balanceFlagOn,
      reschedule: (job, startAfter) => enqueueBalanceFetch(job, startAfter),
    });
  },
  // Spec 030b §5.2 (TASK-439): hourly. Read-only but for the enqueues, which the fetch queue's
  // singleton key makes idempotent; `fees_missing` is raised in the one run past its line.
  "payments.balance_sweep": async () => {
    await runBalanceSweep({ enqueue: (job) => enqueueBalanceFetch(job) });
  },
  // Spec 030b §14.5 (TASK-442): hourly. Idempotent: each email is keyed by contract, review date
  // and state in `notification_delivery`, so a retry or the next hour sends nothing twice.
  "partners.contract_reminders": async () => {
    const { runContractReminders } =
      await import("../modules/partners/contracts/reminders");
    await runContractReminders();
  },
  // Spec 034 §5.2 (TASK-450): the basket reminder's scan and one reminder's send.
  "basket-reminders.scan": async () => {
    const { runBasketReminderScan } = await import("./basket-reminders");
    await runBasketReminderScan();
  },
  "basket-reminders.send": async (payload, context) => {
    const { runBasketReminderSend } = await import("./basket-reminders");
    await runBasketReminderSend(payload.reminderId, context.retryCount ?? 0);
  },
  // No storage yet: the R2 adapter is spec 006's (TASK-082), so delivery photos are reported
  // `storage_unavailable` and kept rather than losing their rows while the objects stay. Spec
  // 030b's contracts (TASK-442) use the private contract store when it is configured, read here at
  // run time; without it they are reported `storage_unavailable` likewise.
  "retention.sweep": async (payload) => {
    const contractStorage = await optionalContractStorage();
    const { captureAlert } = await import("../lib/sentry");
    await withSystemContext("retention.sweep", (db) =>
      runRetentionSweep(db, {
        now: new Date(),
        dryRun: payload.dryRun,
        log: logger,
        ...(contractStorage === undefined ? {} : { contractStorage }),
        alert: (alert, fields) => {
          captureAlert(alert, fields);
        },
      }),
    );
  },
};
