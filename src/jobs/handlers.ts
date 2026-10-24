/**
 * The handlers the minute tick runs, by registered job name (spec 002 §5.2; TASK-024).
 *
 * TASK-024 registered the queues and the payload schemas; each handler is its own task —
 * `retention.sweep` TASK-025 (here), `db.backup_verify` TASK-028, `neon.usage_probe` TASK-029,
 * `media.derive_variants` spec 006 (TASK-082). Each adds one entry here. Until a name has an
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
import { dispatchOutbox } from "../modules/orders";
import { runProductionStart } from "../modules/payments";
// The close is not in the `orders` barrel: importing it registers `OrderClosedV1`, and only the
// processes that close orders need that (spec 022a §5.2, TASK-369).
import { runCloseSweep } from "../modules/orders/close";

import { runRetentionSweep } from "./retention";
import type { JobHandlers } from "./runtime";

export const JOB_HANDLERS: JobHandlers = {
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
