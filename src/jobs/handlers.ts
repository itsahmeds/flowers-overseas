/**
 * The handlers the minute tick runs, by registered job name (spec 002 §5.2; TASK-024).
 *
 * Empty on purpose: TASK-024 registers the queues and the payload schemas, and each handler is its
 * own task — `retention.sweep` TASK-025, `db.backup_verify` TASK-028, `neon.usage_probe` TASK-029,
 * `media.derive_variants` spec 006 (TASK-082). Each adds one entry here. Until a name has an
 * entry, `runTick` does not fetch from its queue, so a job enqueued early waits (and shows in
 * `/api/internal/db-health`'s `pending_jobs`) rather than being consumed by nothing.
 */
import type { JobHandlers } from "./runtime";

export const JOB_HANDLERS: JobHandlers = {};
