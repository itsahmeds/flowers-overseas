/**
 * The job registry (spec 002 §2 "Jobs, storage seam, probes", §5.2, AC-21; `plan/01` §8;
 * TASK-024).
 *
 * Every pg-boss queue name the application knows, each with a **versioned** zod payload schema,
 * split exactly as spec 002 §5.2 splits them:
 *
 *  - **registered** — a queue exists for it (`ensureQueues` in `./runtime.ts`), a job may be
 *    enqueued, and the minute tick consumes it once a handler is supplied:
 *    `media.derive_variants` (payload from spec 006 §5.2, worker in spec 006), `retention.sweep`
 *    (TASK-025), `neon.usage_probe` (TASK-029), `db.backup_verify` (TASK-028), `outbox.dispatch`
 *    (spec 013 §5.2, TASK-254: one run of the outbox dispatcher, enqueued by every minute tick),
 *    `payments.production_start` (spec 013 §5.2, TASK-258: row 16 on the delivery morning),
 *    `webhook.process` (spec 013 §5.2, TASK-260: one stored webhook), `order.close_sweep`
 *    (spec 022a §5.2, TASK-369: one run of the close sweep, enqueued by every minute tick);
 *  - **declared only** — the name is reserved for the spec that implements it (`order.route`,
 *    `assignment.timeout`, `notification.deliver`, `fx.refresh`, `sitemap.regenerate`,
 *    `occasion.reminders`, `review.request`, `payout.accrue`). No queue, no schema: the
 *    implementing spec writes the payload, so nothing here guesses its shape, and `enqueue`
 *    refuses the name until then.
 *
 * Versioning. What pg-boss stores is an **envelope**, `{ v, requestId, payload }`: `v` is the
 * payload schema version of the job name, so a job written by an older deployment is recognised
 * and refused by name and number instead of being half-parsed (a later version bumps `version`
 * here and keeps the old schema until the queue drains). `requestId` is the correlation id of the
 * request that enqueued it (spec 002 §11 "Job observability", `plan/12` §6), so the handler's log
 * lines join the request's.
 *
 * Pure: zod only, no pg-boss and no database, so the registry is unit-testable and importable from
 * anywhere that needs a job name.
 */
import { z } from "zod";

/** `media.derive_variants` (spec 006 §5.2): the asset whose variant ladder to derive, and why. */
export const MediaDeriveVariantsPayload = z
  .object({
    assetId: z.string().min(1),
    reason: z.enum(["upload", "backfill", "reencode"]),
  })
  .strict();

/** `retention.sweep` (spec 002 §5.2, AC-20): `dryRun` writes nothing and reports the counts. */
export const RetentionSweepPayload = z
  .object({ dryRun: z.boolean().default(false) })
  .strict();

/** `neon.usage_probe` (spec 002 §5.2, AC-24): takes nothing. */
export const NeonUsageProbePayload = z.object({}).strict();

/** `db.backup_verify` (spec 002 §5.2, AC-25): the R2 key of the dump to restore. */
export const BackupVerifyPayload = z
  .object({ objectKey: z.string().min(1) })
  .strict();

/**
 * `outbox.dispatch` (spec 013 §5.2, AC-20): one run of the outbox dispatcher. With `orderId`, only
 * that order's due deliveries (spec 013's `afterAccept` asks for its order at once); without, the
 * oldest due deliveries of every order (the minute tick's run).
 */
export const OutboxDispatchPayload = z
  .object({ orderId: z.uuid().optional() })
  .strict();

/**
 * `payments.production_start` (spec 013 §5.2, AC-44, TASK-258): one tick of the delivery-morning
 * production start. Takes nothing: every `paid` order whose instant has passed is due.
 */
export const PaymentsProductionStartPayload = z.object({}).strict();

/**
 * `webhook.process` (spec 013 §5.2, AC-22, TASK-260): process one stored webhook. The handler is
 * wired with the production provider once Stripe keys exist (TASK-266); until then its jobs wait.
 */
export const WebhookProcessPayload = z.object({ inboxId: z.uuid() }).strict();

/**
 * `order.close_sweep` (spec 022a §5.2, AC-2 to AC-4; TASK-369): one run of the close sweep, which
 * closes every due order (at most 200). Takes nothing; the minute tick enqueues one run under a
 * `singletonKey`.
 */
export const OrderCloseSweepPayload = z.object({}).strict();

/** One registered job: its payload schema and that schema's version. */
export interface RegisteredJob<Schema extends z.ZodType = z.ZodType> {
  readonly version: number;
  readonly payload: Schema;
}

/** The registered jobs (spec 002 §5.2 "Implemented here"). */
export const REGISTERED_JOBS = {
  "media.derive_variants": { version: 1, payload: MediaDeriveVariantsPayload },
  "retention.sweep": { version: 1, payload: RetentionSweepPayload },
  "neon.usage_probe": { version: 1, payload: NeonUsageProbePayload },
  "db.backup_verify": { version: 1, payload: BackupVerifyPayload },
  "outbox.dispatch": { version: 1, payload: OutboxDispatchPayload },
  "payments.production_start": {
    version: 1,
    payload: PaymentsProductionStartPayload,
  },
  "webhook.process": { version: 1, payload: WebhookProcessPayload },
  "order.close_sweep": { version: 1, payload: OrderCloseSweepPayload },
} as const satisfies Record<string, RegisteredJob>;

/** The declared-only names (spec 002 §5.2 "Declared only"; `plan/01` §8). */
export const DECLARED_JOBS = [
  "order.route",
  "assignment.timeout",
  "notification.deliver",
  "fx.refresh",
  "sitemap.regenerate",
  "occasion.reminders",
  "review.request",
  "payout.accrue",
] as const;

export type RegisteredJobName = keyof typeof REGISTERED_JOBS;
export type DeclaredJobName = (typeof DECLARED_JOBS)[number];
/** Every job name the application knows (spec 002 §5.2 `JobName`). */
export type JobName = RegisteredJobName | DeclaredJobName;

/** The registered names, in registry order. */
export const REGISTERED_JOB_NAMES = Object.keys(
  REGISTERED_JOBS,
) as RegisteredJobName[];

/** Every name, registered first. */
export const JOB_NAMES: readonly JobName[] = [
  ...REGISTERED_JOB_NAMES,
  ...DECLARED_JOBS,
];

/** What a registered job's handler receives: the parsed payload. */
export type JobPayload<Name extends RegisteredJobName> = z.output<
  (typeof REGISTERED_JOBS)[Name]["payload"]
>;
/** What a caller may pass to `enqueue` (defaults not yet applied). */
export type JobPayloadInput<Name extends RegisteredJobName> = z.input<
  (typeof REGISTERED_JOBS)[Name]["payload"]
>;

/** True for a name with a queue and a payload schema. */
export function isRegisteredJob(name: string): name is RegisteredJobName {
  return Object.hasOwn(REGISTERED_JOBS, name);
}

/** True for a name reserved for a later spec. */
export function isDeclaredJob(name: string): name is DeclaredJobName {
  return (DECLARED_JOBS as readonly string[]).includes(name);
}

/**
 * The correlation id carried in the envelope: a UUID v4 from a request, `system:{job}` from a
 * job or a cron. The same character set `src/lib/db.ts` accepts for `app.request_id`, so it can
 * be handed to `withSystemContext` / `withDbContext` unchanged.
 */
export const JobRequestId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9.:_-]+$/);

/** The envelope schema of one registered job name: `{ v, requestId, payload }`. */
export function jobEnvelope<Name extends RegisteredJobName>(name: Name) {
  const job: RegisteredJob = REGISTERED_JOBS[name];
  return z
    .object({
      v: z.literal(job.version),
      requestId: JobRequestId,
      payload: REGISTERED_JOBS[name].payload,
    })
    .strict();
}

export type JobEnvelope<Name extends RegisteredJobName> = z.output<
  ReturnType<typeof jobEnvelope<Name>>
>;

/** Why a job was refused before any handler saw it. Closed set: logged, never the payload. */
export type JobRefusal = "not_registered" | "payload_invalid";

export type ParsedJob<Name extends RegisteredJobName> =
  | { readonly ok: true; readonly envelope: JobEnvelope<Name> }
  | {
      readonly ok: false;
      readonly reason: JobRefusal;
      /** zod issue paths and codes only — never a value, so no payload reaches a log line. */
      readonly issues: readonly string[];
    };

/** zod issues as `path:code`, with no received value. */
function issueSummary(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.map(String).join(".") || "(root)"}:${issue.code}`,
  );
}

/**
 * Builds the stored envelope for `name`, validating the payload against its registered schema.
 * Throws a `JobPayloadError` naming the job and the failing paths (never the values) for a
 * declared-only or unknown name, or a payload that fails the schema: nothing invalid is ever
 * written to the queue.
 */
export function buildJobData<Name extends RegisteredJobName>(
  name: Name,
  payload: JobPayloadInput<Name>,
  requestId: string,
): JobEnvelope<Name>;
export function buildJobData(
  name: string,
  payload: unknown,
  requestId: string,
): unknown;
export function buildJobData(
  name: string,
  payload: unknown,
  requestId: string,
): unknown {
  if (!isRegisteredJob(name)) {
    throw new JobPayloadError(name, "not_registered", []);
  }
  const parsed = jobEnvelope(name).safeParse({
    v: REGISTERED_JOBS[name].version,
    requestId,
    payload,
  });
  if (!parsed.success) {
    throw new JobPayloadError(
      name,
      "payload_invalid",
      issueSummary(parsed.error),
    );
  }
  return parsed.data;
}

/**
 * Parses what pg-boss hands back for `name`. The consuming half of the boundary: a job whose data
 * does not match the registered envelope — another version, a hand-inserted row, a payload that
 * fails its schema — is refused here, before its handler runs (AC-21, T-21).
 */
export function parseJobData<Name extends RegisteredJobName>(
  name: Name,
  data: unknown,
): ParsedJob<Name> {
  if (!isRegisteredJob(name)) {
    return { ok: false, reason: "not_registered", issues: [] };
  }
  const parsed = jobEnvelope(name).safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "payload_invalid",
      issues: issueSummary(parsed.error),
    };
  }
  return { ok: true, envelope: parsed.data };
}

/** Thrown by `buildJobData` (and so by `enqueue`): the job name, the reason, the failing paths. */
export class JobPayloadError extends Error {
  readonly job: string;
  readonly reason: JobRefusal;
  readonly issues: readonly string[];

  constructor(job: string, reason: JobRefusal, issues: readonly string[]) {
    super(
      reason === "not_registered"
        ? `job "${job}" is not a registered job (declared-only names have no queue until their spec implements them)`
        : `job "${job}" payload fails its registered schema: ${issues.join(", ")}`,
    );
    this.name = "JobPayloadError";
    this.job = job;
    this.reason = reason;
    this.issues = issues;
  }
}
