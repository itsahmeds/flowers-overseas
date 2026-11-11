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
 *    `payments.monitor` (spec 013 §5.2, §11, TASK-264: the paid-not-routed and webhook-silence
 *    monitors, read-only, enqueued by every minute tick),
 *    `webhook.process` (spec 013 §5.2, TASK-260: one stored webhook), `webhook.resend.process`
 *    (spec 016 §5.2, TASK-335: one stored Resend webhook, 7 retries), `notifications.resend`
 *    (spec 020a §5.2, TASK-360: one admin resend row, keyed by row, `short`, 7 retries), `order.close_sweep`
 *    (spec 022a §5.2, TASK-369: one run of the close sweep, enqueued by every minute tick), and
 *    spec 016's routing jobs (§5.2 "Jobs", TASK-328): `order.route`, `assignment.remind`,
 *    `assignment.timeout`, `assignment.photo_remind` (each keyed, at most one waiting job per key:
 *    the queue's `short` policy) and `routing.sla_watch` (enqueued by every minute tick),
 *    TASK-329's `order.no_partner_expire` (keyed by order, `short`), spec 030a's
 *    `payouts.prepaid_ready` (§5.2, TASK-363: founder email F1, keyed by payout),
 *    `payouts.close` and `payouts.watch` (§5.2, TASK-364: the hourly weekly close and the
 *    missing-line watch, enqueued by the minute tick once an hour), and `payouts.statement_email`
 *    (§5.2, TASK-365: keyed by payout; no handler until the shared PDF renderer lands), and spec 018's
 *    invoice jobs (§5.2, TASK-342): `invoice.render` (keyed by invoice, `exclusive`, 5 attempts),
 *    `invoice.render_sweep` (enqueued by every minute tick) and `invoice.email` (keyed by invoice,
 *    `short`; its handler is spec 016's B8, TASK-334, so until then its jobs wait); spec 030b's
 *    `payments.balance_fetch` (§5.2, TASK-439: keyed `{kind}:{ref}`, `short`) and
 *    `payments.balance_sweep` (enqueued by the minute tick once an hour), and
 *    `partners.contract_reminders` (§14.5, TASK-442: hourly, from the minute tick);
 *  - **declared only** — the name is reserved for the spec that implements it
 *    (`notification.deliver`, `fx.refresh`, `sitemap.regenerate`,
 *    `occasion.reminders`, `payout.accrue`). No queue, no schema: the
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
 * `payments.monitor` (spec 013 §5.2, §11, AC-39, AC-40; TASK-264): one minute's look for paid
 * orders not yet routed and for a silent Stripe endpoint. Takes nothing; reads only.
 */
export const PaymentsMonitorPayload = z.object({}).strict();

/**
 * `webhook.process` (spec 013 §5.2, AC-22, TASK-260): process one stored webhook. The handler is
 * wired with the production provider once Stripe keys exist (TASK-266); until then its jobs wait.
 */
export const WebhookProcessPayload = z.object({ inboxId: z.uuid() }).strict();

/**
 * `webhook.resend.process` (spec 016 §5.2 "Resend webhooks", AC-29, AC-30; TASK-335): process one
 * stored Resend webhook. A `failed` run throws, so pg-boss retries it: 7 retries make the eighth
 * attempt the one that marks the row `dead` and raises `webhook.dead` with `provider=resend`.
 */
export const WebhookResendProcessPayload = z
  .object({ inboxId: z.uuid() })
  .strict();

/**
 * `notifications.resend` (spec 020a §5.2 "Resend", AC-25, AC-26; TASK-360): send one admin resend
 * row (`source_key = admin:{actionId}`, `resend_of` set) through spec 016's pipeline. Keyed by the
 * row (`singletonKey = deliveryId`); a row already sent is skipped. While `notifications.email` is
 * off it throws `NOTIFICATIONS_HELD` and pg-boss retries it; the row stays `queued`.
 */
export const NotificationsResendPayload = z
  .object({ deliveryId: z.uuid() })
  .strict();

/**
 * `order.close_sweep` (spec 022a §5.2, AC-2 to AC-4; TASK-369): one run of the close sweep, which
 * closes every due order (at most 200). Takes nothing; the minute tick enqueues one run under a
 * `singletonKey`.
 */
export const OrderCloseSweepPayload = z.object({}).strict();

/**
 * `review.request` (spec 022a §5.2, AC-7, AC-8; TASK-370): one run of the review invitation, which
 * sends B9 for every due invite (at most 50) while `reviews.invite` is on, and marks the expired.
 * Takes nothing; the minute tick enqueues one run under a `singletonKey`.
 */
export const ReviewRequestPayload = z.object({}).strict();

/**
 * `partners.rating_refresh` (spec 022a §5.2, AC-22; TASK-372): writes `rating_90d_bp` and
 * `acceptance_rate_bp` for one florist (after a submission or a moderation touching it), or for
 * every non-demo florist (the nightly run at 03:00 UTC, no `partnerId`). Never writes `status`.
 */
export const PartnersRatingRefreshPayload = z
  .object({ partnerId: z.uuid().optional() })
  .strict();

/**
 * `order.route` (spec 016 §5.2 "Jobs", AC-1, TASK-328): offer the order to its next florist, or
 * exhaust it. Keyed by the order (`singletonKey = orderId`): at most one waiting run per order.
 */
export const OrderRoutePayload = z.object({ orderId: z.uuid() }).strict();

/**
 * `assignment.remind` and `assignment.timeout` (spec 016 §5.2, AC-7): V2 at half the answer
 * window, the timeout at its end. Keyed by the assignment.
 */
export const AssignmentJobPayload = z
  .object({ assignmentId: z.uuid() })
  .strict();

/** `assignment.photo_remind` (spec 016 §5.2, AC-17): V5 an hour after delivery. Keyed by order. */
export const AssignmentPhotoRemindPayload = z
  .object({ orderId: z.uuid() })
  .strict();

/**
 * `order.no_partner_expire` (spec 016 §5.2, AC-11, AC-12; TASK-329): at `graceEnd`, cancel an order
 * still `no_partner_available` through spec 013's `cancelOrder`. Keyed by order.
 */
export const OrderNoPartnerExpirePayload = z
  .object({ orderId: z.uuid() })
  .strict();

/** `routing.sla_watch` (spec 016 §5.2, AC-31): one minute's look for overdue offers. */
export const RoutingSlaWatchPayload = z.object({}).strict();
/**
 * `invoice.render` and `invoice.email` (spec 018 §5.2, AC-37; TASK-342): one invoice or credit
 * note. `invoice.render` stores its PDF (an `exclusive` queue keyed by the invoice, 5 attempts);
 * `invoice.email` is spec 016's B8 (TASK-334 adds its handler), keyed `invoice.email:{invoiceId}`.
 */
export const InvoiceJobPayload = z.object({ invoiceId: z.uuid() }).strict();
/**
 * `invoice.email`'s retries (spec 016 §5.2 "B8 handler", TASK-334): an invoice's B8 throws while
 * its purchase's B1 is still waiting for invoices (`B1_INVOICE_WAIT`, 5 minutes) and each retry
 * comes at the next minute tick, so 15 retries outlast the wait with ten minutes to spare. pg-boss's
 * default (2) would let the job die before B1 has gone.
 */
export const INVOICE_EMAIL_RETRY_LIMIT = 15;
/** `invoice.render_sweep` (spec 018 §11; TASK-342): one minute's look for unrendered documents. */
export const InvoiceRenderSweepPayload = z.object({}).strict();

/**
 * `payouts.prepaid_ready` (spec 030a §5.2, AC-7, TASK-363): founder email F1 for one prepaid
 * payout, enqueued by `fixPayoutAtAcceptance`. Keyed by the payout; the send itself is once per
 * payout by `notification_delivery`'s key.
 */
export const PayoutsPrepaidReadyPayload = z
  .object({ payoutId: z.uuid() })
  .strict();

/**
 * `payouts.statement_email` (spec 030a §5.2, AC-21; TASK-365): the statement email and PDF of one
 * sent payout, enqueued by `sendStatement`. Keyed by the payout; the send itself is once per
 * payout by `notification_delivery`'s key. Its handler (the PDF on spec 018's renderer and the
 * email with the attachment) lands with the shared renderer (TASK-342); until then the job waits.
 */
export const PayoutsStatementEmailPayload = z
  .object({ payoutId: z.uuid() })
  .strict();

/**
 * `payouts.close` (spec 030a §5.2, AC-14; TASK-364): one run of the weekly close. Takes nothing;
 * the minute tick enqueues one run an hour under a `singletonKey`.
 */
export const PayoutsClosePayload = z.object({}).strict();

/**
 * `payouts.watch` (spec 030a §5.2, AC-11; TASK-364): one run of the missing-line watch (F3).
 * Takes nothing; enqueued once an hour beside `payouts.close`.
 */
export const PayoutsWatchPayload = z.object({}).strict();

/**
 * `alerts.dispatch` (spec 025 §5.2 "Jobs", AC-5 to AC-12; TASK-488): decide and send one alert's
 * push and email. Keyed `alertId:kind`; enqueued by `raiseAlert` and `clearCondition`.
 */
export const AlertsDispatchPayload = z
  .object({
    alertId: z.uuid(),
    kind: z.enum([
      "raise",
      "bump",
      "resolve",
      "reminder",
      "escalation",
      "test",
    ]),
  })
  .strict();

/**
 * `payments.balance_fetch` (spec 030b §5.2 `BalanceFetchJobSchema`, AC-6, AC-10; TASK-439): one
 * source's balance transactions, asked once and stored. `attempt` and `firstAttemptAt` are the
 * job's own retry clock (72 hours of backoff, then `dead`). Mirrors `payments`' schema, which the
 * handler parses again; kept here so the registry imports no module.
 */
export const PaymentsBalanceFetchPayload = z
  .object({
    paymentId: z.uuid(),
    source: z
      .object({
        kind: z.enum(["intent", "refund", "dispute"]),
        ref: z.string().min(1).max(255),
      })
      .strict(),
    attempt: z.number().int().min(0).default(0),
    firstAttemptAt: z.iso.datetime().optional(),
  })
  .strict();

/**
 * `alerts.monitor` and `alerts.escalate` (spec 025 §5.2 "Jobs", AC-13 to AC-27; TASK-489): one
 * minute's checks, and one minute's receipts, escalations, bumps, reminders and held digests.
 * Take nothing; the minute tick enqueues one of each under a `singletonKey`.
 */
export const AlertsMonitorPayload = z.object({}).strict();
/**
 * `risk.monitor` (spec 021 §5.2 "Jobs", AC-6; TASK-493): one minute's card-testing check. Takes
 * nothing; the minute tick enqueues one under a `singletonKey`. The deadline defaults, due-soon
 * alerts and the site velocity alert join it in TASK-494.
 */
export const RiskMonitorPayload = z.object({}).strict();
export const AlertsEscalatePayload = z.object({}).strict();

/**
 * `alerts.daily_summary` (spec 025 §5.2, AC-28; TASK-489): the summary of one local date in the
 * configured zone, enqueued by the minute tick from 08:00 there, keyed by the date.
 */
export const AlertsDailySummaryPayload = z
  .object({ date: z.iso.date() })
  .strict();

/**
 * `payments.balance_sweep` (spec 030b §5.2; AC-10; TASK-439): one hourly look for sources with no
 * balance row and live payments past the fees-missing line. Takes nothing.
 */
export const PaymentsBalanceSweepPayload = z.object({}).strict();

/**
 * `basket-reminders.scan` (spec 034 §5.2 "Jobs", AC-2; TASK-450): one scan for abandoned baskets.
 * Takes nothing; the minute tick enqueues one every 10 minutes under a `singletonKey`.
 */
export const BasketRemindersScanPayload = z.object({}).strict();

/**
 * `basket-reminders.send` (spec 034 §5.2, AC-3, AC-4; TASK-450): one reminder's checks and send,
 * keyed by the reminder. After its last retry the reminder ends `failed`.
 */
export const BasketRemindersSendPayload = z
  .object({ reminderId: z.uuid() })
  .strict();

/**
 * `reminders.daily` (spec 018 §14 A-founder-2026-10-22 C.7.4, C.12, AC-57; TASK-353): one day's
 * occasion reminders. Takes nothing; the minute tick enqueues one per UTC day, not before 07:00.
 */
export const RemindersDailyPayload = z.object({}).strict();

/**
 * `partners.contract_reminders` (spec 030b §14.5, AC-42; TASK-442): one hourly look at the current
 * agreements' and addenda's review dates. Takes nothing; the minute tick enqueues one an hour.
 */
export const PartnersContractRemindersPayload = z.object({}).strict();

/**
 * `catalogue.publish` (spec 012b §2.3, AC-7; TASK-295): one step of one publish run, then the next
 * a minute later until it is finished; idempotent by run id. `addedUrls` travels with the job so
 * that the step after `verified` can request each added URL once.
 */
export const CataloguePublishPayload = z
  .object({
    runId: z.uuid(),
    addedUrls: z.array(z.string().regex(/^\/[^\s?#]*$/u)).max(20_000),
  })
  .strict();

/**
 * `cache.invalidate` (spec 012b §2.3 F1, AC-38; TASK-295): `invalidate()` with these tags, run by
 * the tick, inside a request, where Next's `revalidatePath` works. A deployment's boot hands its
 * `dataAsOf` here, because `instrumentation.ts` runs outside any request and cannot reach the
 * tag builders.
 */
export const CacheInvalidatePayload = z.union([
  z
    .object({
      tags: z
        .array(z.string().regex(/^[a-z]+(?::[A-Za-z0-9_-]+)*$/u))
        .min(1)
        .max(5_000),
    })
    .strict(),
  // The boot's `dataAsOf` (`src/lib/publish-boot.ts`): the job reads the rows changed after it
  // and invalidates their §5.4 tags once (`invalidateChangedSinceJob()`).
  z.object({ changedSince: z.iso.datetime({ offset: true }) }).strict(),
]);

/**
 * pg-boss's queue policy for a job. `short`: at most one **waiting** (`created`) job per
 * `singletonKey`, so a second enqueue for the same key while one waits is a no-op, while a job
 * already running may enqueue its own successor (a deferred offer, the next offer). `exclusive`:
 * at most one job per `singletonKey` that is waiting, retrying or running (spec 018's
 * `invoice.render`, which the minute sweep asks for again until the document is rendered).
 */
export type JobQueuePolicy = "standard" | "short" | "exclusive";

/** One registered job: its payload schema and that schema's version. */
export interface RegisteredJob<Schema extends z.ZodType = z.ZodType> {
  readonly version: number;
  readonly payload: Schema;
  /** The queue's policy; `standard` when absent. */
  readonly policy?: JobQueuePolicy;
  /** Retries after the first attempt; pg-boss's default when absent. */
  readonly retryLimit?: number;
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
  "payments.monitor": { version: 1, payload: PaymentsMonitorPayload },
  "webhook.process": { version: 1, payload: WebhookProcessPayload },
  "webhook.resend.process": {
    version: 1,
    payload: WebhookResendProcessPayload,
    retryLimit: 7,
  },
  "notifications.resend": {
    version: 1,
    payload: NotificationsResendPayload,
    policy: "short",
    retryLimit: 7,
  },
  "order.close_sweep": { version: 1, payload: OrderCloseSweepPayload },
  "review.request": { version: 1, payload: ReviewRequestPayload },
  "partners.rating_refresh": {
    version: 1,
    payload: PartnersRatingRefreshPayload,
  },
  "order.route": { version: 1, payload: OrderRoutePayload, policy: "short" },
  "assignment.remind": {
    version: 1,
    payload: AssignmentJobPayload,
    policy: "short",
  },
  "assignment.timeout": {
    version: 1,
    payload: AssignmentJobPayload,
    policy: "short",
  },
  "assignment.photo_remind": {
    version: 1,
    payload: AssignmentPhotoRemindPayload,
    policy: "short",
  },
  "routing.sla_watch": { version: 1, payload: RoutingSlaWatchPayload },
  "order.no_partner_expire": {
    version: 1,
    payload: OrderNoPartnerExpirePayload,
    policy: "short",
  },
  "payouts.prepaid_ready": {
    version: 1,
    payload: PayoutsPrepaidReadyPayload,
    policy: "short",
  },
  "invoice.render": {
    version: 1,
    payload: InvoiceJobPayload,
    policy: "exclusive",
    retryLimit: 4,
  },
  "invoice.render_sweep": { version: 1, payload: InvoiceRenderSweepPayload },
  "invoice.email": {
    version: 1,
    payload: InvoiceJobPayload,
    policy: "short",
    retryLimit: INVOICE_EMAIL_RETRY_LIMIT,
  },
  "payouts.statement_email": {
    version: 1,
    payload: PayoutsStatementEmailPayload,
    policy: "short",
  },
  "payouts.close": { version: 1, payload: PayoutsClosePayload },
  "payouts.watch": { version: 1, payload: PayoutsWatchPayload },
  "alerts.dispatch": {
    version: 1,
    payload: AlertsDispatchPayload,
    policy: "short",
    retryLimit: 3,
  },
  "alerts.monitor": { version: 1, payload: AlertsMonitorPayload },
  "risk.monitor": { version: 1, payload: RiskMonitorPayload },
  "alerts.escalate": { version: 1, payload: AlertsEscalatePayload },
  "alerts.daily_summary": {
    version: 1,
    payload: AlertsDailySummaryPayload,
    policy: "short",
  },
  "payments.balance_fetch": {
    version: 1,
    payload: PaymentsBalanceFetchPayload,
    policy: "short",
  },
  "payments.balance_sweep": {
    version: 1,
    payload: PaymentsBalanceSweepPayload,
  },
  "partners.contract_reminders": {
    version: 1,
    payload: PartnersContractRemindersPayload,
  },
  "reminders.daily": { version: 1, payload: RemindersDailyPayload },
  "basket-reminders.scan": { version: 1, payload: BasketRemindersScanPayload },
  "basket-reminders.send": {
    version: 1,
    payload: BasketRemindersSendPayload,
    policy: "short",
    retryLimit: 3,
  },
  "catalogue.publish": { version: 1, payload: CataloguePublishPayload },
  "cache.invalidate": { version: 1, payload: CacheInvalidatePayload },
} as const satisfies Record<string, RegisteredJob>;

/** The declared-only names (spec 002 §5.2 "Declared only"; `plan/01` §8). */
export const DECLARED_JOBS = [
  "notification.deliver",
  "fx.refresh",
  "sitemap.regenerate",
  "occasion.reminders",
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

/** The queue policy of a registered job (`standard` unless the registry names another). */
export function jobQueuePolicy(name: RegisteredJobName): JobQueuePolicy {
  const job: RegisteredJob = REGISTERED_JOBS[name];
  return job.policy ?? "standard";
}

/** The registered retry limit of a job, or `undefined` for pg-boss's default. */
export function jobRetryLimit(name: RegisteredJobName): number | undefined {
  const job: RegisteredJob = REGISTERED_JOBS[name];
  return job.retryLimit;
}

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
