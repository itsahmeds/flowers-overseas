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
import { invalidate } from "../lib/cache";
import { withSystemContext } from "../lib/db";
import { PUBLISH_POLL_SECONDS, runPublishJob } from "../lib/publish-runtime";
import { logger } from "../lib/logger";
import { invoicesOutboxHandler } from "../modules/invoices";
import { dispatchOutbox, registerOutboxHandler } from "../modules/orders";
import { runProductionStart } from "../modules/payments";
// The close is not in the `orders` barrel: importing it registers `OrderClosedV1`, and only the
// processes that close orders need that (spec 022a §5.2, TASK-369).
import { runCloseSweep } from "../modules/orders/close";

import { runRetentionSweep } from "./retention";
import type { JobHandlers } from "./runtime";

/** One read of an original by the derive worker: a large original on a slow link, not a hang. */
const DERIVE_READ_TIMEOUT_MS = 60_000;

// Spec 018 §5.2 (TASK-341): the `invoices` outbox target issues invoices and credit notes in the
// delivery's transaction. Registered once, where the dispatcher's job is defined.
registerOutboxHandler("invoices", invoicesOutboxHandler());

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
  // No storage yet: the R2 adapter is spec 006's (TASK-082), so delivery photos are reported
  // `storage_unavailable` and kept rather than losing their rows while the objects stay.
  // Spec 012b §2.3 (TASK-295): one step of a publish run; while it is open, the next step is
  // enqueued a minute later. Idempotent by run id (`advancePublishRun()`).
  "catalogue.publish": async (payload) => {
    const done = await runPublishJob(payload);
    if (done) return;
    const { enqueue, withBoss } = await import("./runtime");
    await withBoss((boss) =>
      enqueue(boss, "catalogue.publish", payload, {
        requestId: "system:catalogue.publish",
        startAfterSeconds: PUBLISH_POLL_SECONDS,
      }),
    );
  },
  // Spec 012b §2.3 F1 (TASK-295): a deployment's `dataAsOf` tags, purged inside the tick.
  "cache.invalidate": async (payload) => {
    await invalidate(payload.tags);
  },
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
