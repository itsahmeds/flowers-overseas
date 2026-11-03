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
import { withSystemContext } from "../lib/db";
import { logger } from "../lib/logger";
import {
  createNbpRateProvider,
  invoicesOutboxHandler,
  runInvoiceRenderSweep,
  runRenderJob,
  setVatRateProvider,
} from "../modules/invoices";
// Spec 016 §5.3 (TASK-332): the founder's emails read their English copy and the admin order path
// from the admin module's own files, not its barrel, so the worker loads no admin sign-in surface.
import { adminT } from "../modules/admin/messages";
import { orderDetailHref } from "../modules/admin/orders";
import { payoutDetailHref } from "../modules/admin/payouts";
import { registerNotificationsOutbox } from "../modules/notifications";
// The email templates are not in the notifications barrel: no page may reach their copy.
import {
  registerFloristEmailTemplates,
  registerOpsEmailTemplates,
} from "../modules/notifications/emails";
import { dispatchOutbox, registerOutboxHandler } from "../modules/orders";
import { runProductionStart } from "../modules/payments";
// Spec 030a §5.2 (TASK-363): the `payouts` target and F1's job, the worker's entry, not the barrel.
import {
  registerPayoutsOutbox,
  sendPrepaidReady,
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

import { runRetentionSweep } from "./retention";
import type { JobHandlers } from "./runtime";

/** One read of an original by the derive worker: a large original on a slow link, not a hang. */
const DERIVE_READ_TIMEOUT_MS = 60_000;

// Spec 018 §5.2 (TASK-341): the `invoices` outbox target issues invoices and credit notes in the
// delivery's transaction. Registered once, where the dispatcher's job is defined.
registerOutboxHandler("invoices", invoicesOutboxHandler());

// Spec 018 §5.2 (TASK-342): the PLN VAT line's rate, NBP table A of the last business day before
// the tax point, for every profile whose `vat_currency_code` differs from the invoice currency.
setVatRateProvider(createNbpRateProvider());

// Spec 016 §5.2 (TASK-328): the `routing` target, for `test` and `live` orders: a secured
// payment enqueues `order.route`, a delivery the photo reminder. Replaces the stand-in that made
// every routing delivery end `dead`.
registerRoutingOutbox();

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
registerOpsEmailTemplates({
  t: adminT as unknown as (
    key: string,
    values?: Readonly<Record<string, string>>,
  ) => string,
  orderHref: orderDetailHref,
  // Spec 030a §2.8: F1's link to the payout's admin page (TASK-367 builds the page).
  payoutHref: payoutDetailHref,
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
  // Spec 018 §11 (TASK-342): every unrendered document gets a render job for its first 15
  // minutes, then an `invoice.render_overdue` alert each minute. Reads only; idempotent.
  "invoice.render_sweep": async () => {
    await runInvoiceRenderSweep();
  },
  // No storage yet: the R2 adapter is spec 006's (TASK-082), so delivery photos are reported
  // `storage_unavailable` and kept rather than losing their rows while the objects stay.
  "retention.sweep": async (payload) => {
    await withSystemContext("retention.sweep", (db) =>
      runRetentionSweep(db, {
        now: new Date(),
        dryRun: payload.dryRun,
        log: logger,
      }),
    );
  },
};
