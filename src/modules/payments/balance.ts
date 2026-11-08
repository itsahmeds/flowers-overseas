/**
 * The provider's balance facts: Stripe's fee, settled amount and FX for every money movement
 * (spec 030b §2.2, §5.2 "payments" row and "Jobs"; AC-6 to AC-10; TASK-439).
 *
 *  - `balanceKindOf` maps a provider reporting category to `payment_balance_txn.kind`;
 *  - `effectiveRatePpm` is our integer rate of a conversion (half away from zero, no float);
 *  - `recordBalanceFacts` stores facts `ON CONFLICT (provider_txn_ref) DO NOTHING`, resolving
 *    `refund_id` and `dispute_id` from their `provider_ref`, and raises
 *    `alert=payments.balance_unknown_category` the first time a category maps to `other`;
 *  - `runBalanceFetch` is the `payments.balance_fetch` job: one source asked, its facts stored; an
 *    empty list or an outage is retried with backoff for 72 hours, then `dead` with
 *    `alert=payments.balance_fetch_dead`; with the flag off nothing is asked and the work waits;
 *  - `runBalanceSweep` is the hourly `payments.balance_sweep`: every captured payment, succeeded
 *    refund and opened or closed dispute with no row an hour later is asked again, and a live
 *    payment with no `charge` row after `feesMissingAlertHours` raises
 *    `alert=payments.fees_missing` in the one run that first sees it past the line.
 *
 * Facts are never updated or deleted (`BALANCE_TXN_IMMUTABLE`, migration `0039`). Logs carry ids,
 * kinds and counts only; a provider response is parsed by schema in the adapter and never logged.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { currencyConfig, isCurrencyCode } from "@/config/currencies";
import {
  BALANCE_FETCH_BACKOFF_MINUTES,
  BALANCE_FETCH_GIVE_UP_HOURS,
  BALANCE_SWEEP_AFTER_MINUTES,
  BALANCE_SWEEP_INTERVAL_MINUTES,
} from "@/config/payments";
import { FINANCE_CONFIG } from "@/config/finance";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { captureAlert } from "@/lib/sentry";
import { withExecutor, type OrderExecutor } from "@/modules/orders";

import type { PaymentTransaction } from "./context.ts";
import {
  balanceSourceKinds,
  isProviderFailure,
  type BalanceSource,
  type PaymentProvider,
  type ProviderBalanceFact,
} from "./provider.ts";

/** `payment_balance_txn.kind` (migration `0039`). */
export const BALANCE_KINDS = [
  "charge",
  "refund",
  "refund_failure",
  "dispute",
  "dispute_reversal",
  "other",
] as const;
export type BalanceKind = (typeof BALANCE_KINDS)[number];

export const BALANCE_FETCH_JOB = "payments.balance_fetch";
export const BALANCE_SWEEP_JOB = "payments.balance_sweep";
export const BALANCE_FLAG = "payments.balance_fetch";
export const BALANCE_FETCH_DEAD_ALERT = "payments.balance_fetch_dead";
export const BALANCE_UNKNOWN_CATEGORY_ALERT =
  "payments.balance_unknown_category";
export const FEES_MISSING_ALERT = "payments.fees_missing";

/** Spec 030b §5.2: `charge` → `charge`, …, anything else → `other`. */
export function balanceKindOf(reportingCategory: string): BalanceKind {
  switch (reportingCategory) {
    case "charge":
    case "refund":
    case "refund_failure":
    case "dispute":
    case "dispute_reversal":
      return reportingCategory;
    default:
      return "other";
  }
}

/** `numerator ÷ denominator` rounded half away from zero; `denominator` must be non-zero. */
export function divideHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator === 0n) throw new RangeError("DIVISION_BY_ZERO");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

/**
 * Units of the settlement currency per unit of the presentment currency, in ppm: settled minor ×
 * 10^presentmentExponent × 1 000 000 ÷ (presentment minor × 10^settlementExponent), half away
 * from zero; `null` when the currencies are equal or the presentment amount is zero. Signs are
 * ignored (a rate is positive).
 */
export function effectiveRatePpm(
  presentment: {
    readonly amountMinor: bigint | number;
    readonly currency: string;
  },
  settlement: {
    readonly amountMinor: bigint | number;
    readonly currency: string;
  },
): bigint | null {
  if (presentment.currency === settlement.currency) return null;
  if (
    !isCurrencyCode(presentment.currency) ||
    !isCurrencyCode(settlement.currency)
  ) {
    return null;
  }
  const abs = (value: bigint): bigint => (value < 0n ? -value : value);
  const p = abs(BigInt(presentment.amountMinor));
  const s = abs(BigInt(settlement.amountMinor));
  if (p === 0n) return null;
  const pExp = BigInt(currencyConfig(presentment.currency).minorUnitExponent);
  const sExp = BigInt(currencyConfig(settlement.currency).minorUnitExponent);
  const rate = divideHalfAwayFromZero(
    s * 10n ** pExp * 1_000_000n,
    p * 10n ** sExp,
  );
  return rate > 0n ? rate : null;
}

/** `BalanceSourceSchema` (spec 030b §5.2). */
export const BalanceSourceSchema = z
  .object({ kind: z.enum(balanceSourceKinds), ref: z.string().min(1).max(255) })
  .strict();

/**
 * `BalanceFetchJobSchema` (spec 030b §5.2): the payment and the source, plus the retry clock this
 * job keeps for itself (`attempt`, and `firstAttemptAt`, set at the first provider call).
 */
export const BalanceFetchJobSchema = z
  .object({
    paymentId: z.uuid(),
    source: BalanceSourceSchema,
    attempt: z.number().int().min(0).default(0),
    firstAttemptAt: z.iso.datetime().optional(),
  })
  .strict();
export type BalanceFetchJob = z.output<typeof BalanceFetchJobSchema>;
export type BalanceFetchJobInput = z.input<typeof BalanceFetchJobSchema>;

/** The singleton key of one fetch: `{kind}:{ref}` (spec 030b §5.2). */
export function balanceFetchKey(source: BalanceSource): string {
  return `${source.kind}:${source.ref}`;
}

/** Thrown when a refund or dispute fact names an object our tables do not hold yet: retried. */
export class BalanceSourceUnknown extends Error {
  readonly code = "BALANCE_SOURCE_UNKNOWN";
  constructor() {
    super(
      "BALANCE_SOURCE_UNKNOWN: a balance fact names a refund or dispute we have no row for",
    );
    this.name = "BalanceSourceUnknown";
  }
}

export type BalanceAlert = (
  alert: string,
  fields: Readonly<Record<string, unknown>>,
) => void;

const defaultAlert: BalanceAlert = (alert, fields) => {
  captureAlert(alert, fields);
};

export interface RecordBalanceResult {
  readonly inserted: number;
  readonly unknownCategories: readonly string[];
}

/**
 * Stores `facts` for `paymentId` in the caller's transaction. A fact already stored (by its
 * `provider_txn_ref`) is left alone. A refund or dispute fact resolves its row by the provider's
 * reference; with no such row yet it throws `BalanceSourceUnknown` (the job retries).
 */
export async function recordBalanceFacts(
  executor: OrderExecutor,
  paymentId: string,
  provider: "stripe" | "mollie",
  facts: readonly ProviderBalanceFact[],
  alert: BalanceAlert = defaultAlert,
): Promise<RecordBalanceResult> {
  let inserted = 0;
  const unknownCategories: string[] = [];
  for (const fact of facts) {
    const kind = balanceKindOf(fact.reportingCategory);
    let refundId: string | null = null;
    let disputeId: string | null = null;
    if (kind === "refund" || kind === "refund_failure") {
      const [row] = await executor.execute(sql`
        SELECT id FROM refund WHERE provider_ref = ${fact.sourceRef} AND payment_id = ${paymentId}`);
      if (row === undefined) throw new BalanceSourceUnknown();
      refundId = z.uuid().parse(row["id"]);
    } else if (kind === "dispute" || kind === "dispute_reversal") {
      const [row] = await executor.execute(sql`
        SELECT id FROM payment_dispute WHERE provider_ref = ${fact.sourceRef} AND payment_id = ${paymentId}`);
      if (row === undefined) throw new BalanceSourceUnknown();
      disputeId = z.uuid().parse(row["id"]);
    }
    const firstOfCategory =
      kind === "other"
        ? (
            await executor.execute(sql`
              SELECT 1 FROM payment_balance_txn
              WHERE kind = 'other' AND reporting_category = ${fact.reportingCategory} LIMIT 1`)
          ).length === 0
        : false;
    const rate =
      fact.presentment === null
        ? null
        : effectiveRatePpm(fact.presentment, {
            amountMinor: fact.amountMinor,
            currency: fact.settlementCurrency,
          });
    const rows = await executor.execute(sql`
      INSERT INTO payment_balance_txn (
        payment_id, refund_id, dispute_id, kind, provider, provider_txn_ref, source_ref,
        provider_type, reporting_category, presentment_amount_minor, presentment_currency_code,
        amount_minor, fee_minor, net_minor, settlement_currency_code, effective_rate_ppm,
        provider_exchange_rate, provider_created_at, available_on, livemode
      ) VALUES (
        ${paymentId}, ${refundId}, ${disputeId}, ${kind}, ${provider}, ${fact.providerTxnRef},
        ${fact.sourceRef}, ${fact.providerType}, ${fact.reportingCategory},
        ${fact.presentment === null ? null : String(fact.presentment.amountMinor)}::bigint,
        ${fact.presentment?.currency ?? null},
        ${String(fact.amountMinor)}::bigint, ${String(fact.feeMinor)}::bigint,
        ${String(fact.netMinor)}::bigint, ${fact.settlementCurrency},
        ${rate === null ? null : rate.toString()}::bigint, ${fact.exchangeRate},
        ${fact.createdAt.toISOString()}::timestamptz, ${fact.availableOn}::date, ${fact.livemode}
      )
      ON CONFLICT (provider_txn_ref) DO NOTHING
      RETURNING id`);
    if (rows.length > 0) {
      inserted += 1;
      if (firstOfCategory) {
        unknownCategories.push(fact.reportingCategory);
        alert(BALANCE_UNKNOWN_CATEGORY_ALERT, {
          payment_id: paymentId,
          reporting_category: fact.reportingCategory,
        });
      }
    }
  }
  return { inserted, unknownCategories };
}

// ---------------------------------------------------------------------------------------------
// payments.balance_fetch
// ---------------------------------------------------------------------------------------------

export interface BalanceJobDeps {
  /** The provider; built lazily so a missing key fails the job (retried), not the import. */
  readonly provider: () => PaymentProvider;
  readonly transaction?: PaymentTransaction;
  readonly now?: () => Date;
  readonly alert?: BalanceAlert;
  readonly log?: Logger;
  /** The `payments.balance_fetch` flag. */
  readonly flagOn: () => Promise<boolean>;
  /** Enqueues `job` again, not before `startAfter` (the handler's pg-boss enqueue). */
  readonly reschedule: (
    job: BalanceFetchJob,
    startAfter: Date,
  ) => Promise<void>;
}

export type BalanceFetchOutcome =
  | { readonly kind: "recorded"; readonly inserted: number }
  | { readonly kind: "flag_off" }
  | {
      readonly kind: "retry";
      readonly attempt: number;
      readonly startAfter: Date;
    }
  | { readonly kind: "dead" }
  | { readonly kind: "not_found" };

const systemTransaction: PaymentTransaction = (fn) =>
  withExecutor(undefined, BALANCE_FETCH_JOB, fn);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** The delay before retry `attempt` (1-based): the configured ladder, its last step repeated. */
export function balanceBackoffMinutes(attempt: number): number {
  const ladder = BALANCE_FETCH_BACKOFF_MINUTES;
  const index = Math.min(Math.max(attempt, 1), ladder.length) - 1;
  return ladder[index] ?? ladder[ladder.length - 1] ?? 60;
}

function providerColumn(provider: PaymentProvider): "stripe" | "mollie" {
  return provider.name === "mollie" ? "mollie" : "stripe";
}

/** One `payments.balance_fetch` run. */
export async function runBalanceFetch(
  input: BalanceFetchJobInput,
  deps: BalanceJobDeps,
): Promise<BalanceFetchOutcome> {
  const job = BalanceFetchJobSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? defaultLogger;
  const alert = deps.alert ?? defaultAlert;
  const transaction = deps.transaction ?? systemTransaction;

  if (!(await deps.flagOn())) {
    // Nothing asked; the work waits, and its retry clock does not run while the flag is off.
    await deps.reschedule(job, new Date(now.getTime() + 15 * MINUTE_MS));
    return { kind: "flag_off" };
  }

  const firstAttemptAt = job.firstAttemptAt ?? now.toISOString();
  const provider = deps.provider();
  const facts = await provider.balanceFacts(job.source);

  if (isProviderFailure(facts) && facts.failure === "not_found") {
    log.warn(
      { payment_id: job.paymentId, source_kind: job.source.kind },
      "payments.balance_fetch_not_found",
    );
    return { kind: "not_found" };
  }

  if (!isProviderFailure(facts) && facts.length > 0) {
    const { inserted } = await transaction((executor) =>
      recordBalanceFacts(
        executor,
        job.paymentId,
        providerColumn(provider),
        facts,
        alert,
      ),
    );
    log.info(
      {
        payment_id: job.paymentId,
        source_kind: job.source.kind,
        row_count: inserted,
      },
      "payments.balance_fetched",
    );
    return { kind: "recorded", inserted };
  }

  // Empty (not settled yet) or unavailable: try again later, for at most 72 hours.
  const attempt = job.attempt + 1;
  log.info(
    { payment_id: job.paymentId, source_kind: job.source.kind, attempt },
    "payments.balance_fetch_empty",
  );
  const giveUpAt =
    new Date(firstAttemptAt).getTime() + BALANCE_FETCH_GIVE_UP_HOURS * HOUR_MS;
  const startAfter = new Date(
    now.getTime() + balanceBackoffMinutes(attempt) * MINUTE_MS,
  );
  if (startAfter.getTime() > giveUpAt) {
    alert(BALANCE_FETCH_DEAD_ALERT, {
      payment_id: job.paymentId,
      source_kind: job.source.kind,
      attempts: attempt,
    });
    return { kind: "dead" };
  }
  await deps.reschedule({ ...job, attempt, firstAttemptAt }, startAfter);
  return { kind: "retry", attempt, startAfter };
}

// ---------------------------------------------------------------------------------------------
// payments.balance_sweep
// ---------------------------------------------------------------------------------------------

export interface BalanceSweepDeps {
  readonly transaction?: PaymentTransaction;
  readonly now?: () => Date;
  readonly alert?: BalanceAlert;
  readonly log?: Logger;
  /** Enqueues one fetch (the handler's pg-boss enqueue under its singleton key). */
  readonly enqueue: (job: BalanceFetchJobInput) => Promise<void>;
}

export interface BalanceSweepCounts {
  readonly enqueued: number;
  readonly feesMissing: number;
}

const SweepRow = z.object({
  payment_id: z.uuid(),
  kind: z.enum(balanceSourceKinds),
  ref: z.string().min(1),
});

const FeesMissingRow = z.object({ payment_id: z.uuid() });

/** One `payments.balance_sweep` run (hourly). */
export async function runBalanceSweep(
  deps: BalanceSweepDeps,
): Promise<BalanceSweepCounts> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? defaultLogger;
  const alert = deps.alert ?? defaultAlert;
  const transaction =
    deps.transaction ??
    ((fn) => withExecutor(undefined, BALANCE_SWEEP_JOB, fn));
  const after = new Date(
    now.getTime() - BALANCE_SWEEP_AFTER_MINUTES * MINUTE_MS,
  );
  const since = new Date(now.getTime() - BALANCE_FETCH_GIVE_UP_HOURS * HOUR_MS);
  const missingLine = new Date(
    now.getTime() - FINANCE_CONFIG.feesMissingAlertHours * HOUR_MS,
  );
  const missingFrom = new Date(
    missingLine.getTime() - BALANCE_SWEEP_INTERVAL_MINUTES * MINUTE_MS,
  );

  const { due, missing } = await transaction(async (executor) => {
    const dueRows = await executor.execute(sql`
      SELECT p.id AS payment_id, 'intent' AS kind, p.provider_ref AS ref
      FROM payment p
      WHERE p.captured_at IS NOT NULL AND p.provider_ref IS NOT NULL
        AND p.captured_at <= ${after.toISOString()}::timestamptz
        AND p.captured_at > ${since.toISOString()}::timestamptz
        AND NOT EXISTS (SELECT 1 FROM payment_balance_txn b
                        WHERE b.payment_id = p.id AND b.kind = 'charge')
      UNION ALL
      SELECT r.payment_id, 'refund', r.provider_ref
      FROM refund r
      WHERE r.status = 'succeeded' AND r.provider_ref IS NOT NULL
        AND r.succeeded_at <= ${after.toISOString()}::timestamptz
        AND r.succeeded_at > ${since.toISOString()}::timestamptz
        AND NOT EXISTS (SELECT 1 FROM payment_balance_txn b WHERE b.refund_id = r.id)
      UNION ALL
      SELECT d.payment_id, 'dispute', d.provider_ref
      FROM payment_dispute d
      WHERE coalesce(d.closed_at, d.opened_at) <= ${after.toISOString()}::timestamptz
        AND coalesce(d.closed_at, d.opened_at) > ${since.toISOString()}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM payment_balance_txn b
          WHERE b.dispute_id = d.id
            AND (d.closed_at IS NULL OR d.status <> 'won' OR b.kind = 'dispute_reversal'))
      ORDER BY 1, 2`);
    const missingRows = await executor.execute(sql`
      SELECT p.id AS payment_id
      FROM payment p
      WHERE p.captured_at IS NOT NULL AND p.livemode
        AND p.captured_at <= ${missingLine.toISOString()}::timestamptz
        AND p.captured_at > ${missingFrom.toISOString()}::timestamptz
        AND NOT EXISTS (SELECT 1 FROM payment_balance_txn b
                        WHERE b.payment_id = p.id AND b.kind = 'charge')
      ORDER BY p.id`);
    return {
      due: dueRows.map((row) => SweepRow.parse(row)),
      missing: missingRows.map((row) => FeesMissingRow.parse(row)),
    };
  });

  for (const row of due) {
    await deps.enqueue({
      paymentId: row.payment_id,
      source: { kind: row.kind, ref: row.ref },
    });
  }
  for (const row of missing) {
    alert(FEES_MISSING_ALERT, { payment_id: row.payment_id });
  }
  log.info(
    { enqueued: due.length, fees_missing: missing.length },
    "payments.balance_sweep",
  );
  return { enqueued: due.length, feesMissing: missing.length };
}

/**
 * The fetches for every payment captured at or after `since` (`pnpm payments:backfill-balance`).
 * Read-only: the caller enqueues (or, on a dry run, only counts).
 */
export async function balanceBackfillJobs(
  since: Date,
  transaction: PaymentTransaction = (fn) =>
    withExecutor(undefined, "payments.backfill_balance", fn),
): Promise<BalanceFetchJobInput[]> {
  return transaction(async (executor) => {
    const rows = await executor.execute(sql`
      SELECT p.id AS payment_id, 'intent' AS kind, p.provider_ref AS ref
      FROM payment p
      WHERE p.captured_at IS NOT NULL AND p.provider_ref IS NOT NULL
        AND p.captured_at >= ${since.toISOString()}::timestamptz
      UNION ALL
      SELECT r.payment_id, 'refund', r.provider_ref
      FROM refund r
      WHERE r.status = 'succeeded' AND r.provider_ref IS NOT NULL
        AND r.succeeded_at >= ${since.toISOString()}::timestamptz
      UNION ALL
      SELECT d.payment_id, 'dispute', d.provider_ref
      FROM payment_dispute d
      WHERE d.opened_at >= ${since.toISOString()}::timestamptz
      ORDER BY 1, 2`);
    return rows.map((row) => {
      const parsed = SweepRow.parse(row);
      return {
        paymentId: parsed.payment_id,
        source: { kind: parsed.kind, ref: parsed.ref },
      };
    });
  });
}

/** The body of `POST /api/internal/payments/backfill-balance` (`pnpm payments:backfill-balance`). */
export const BalanceBackfillRequestSchema = z
  .object({
    since: z.iso.datetime({ offset: true }),
    dryRun: z.boolean().default(false),
  })
  .strict();

export interface BalanceBackfillResult {
  readonly status: number;
  readonly body: {
    readonly ok: boolean;
    readonly found?: number;
    readonly enqueued?: number;
    readonly error?: string;
  };
}

/**
 * The backfill route's whole body: parse, list every source captured, refunded or disputed since
 * the instant, and enqueue one fetch each (none on a dry run). Counts only in the answer.
 */
export async function runBalanceBackfill(
  body: unknown,
  deps: {
    readonly enqueue: (job: BalanceFetchJobInput) => Promise<void>;
    readonly transaction?: PaymentTransaction;
  },
): Promise<BalanceBackfillResult> {
  const parsed = BalanceBackfillRequestSchema.safeParse(body);
  if (!parsed.success)
    return { status: 400, body: { ok: false, error: "invalid_request" } };
  const jobs = await balanceBackfillJobs(
    new Date(parsed.data.since),
    ...(deps.transaction === undefined ? [] : [deps.transaction]),
  );
  let enqueued = 0;
  if (!parsed.data.dryRun) {
    for (const job of jobs) {
      await deps.enqueue(job);
      enqueued += 1;
    }
  }
  defaultLogger.info(
    { found: jobs.length, enqueued, dry_run: parsed.data.dryRun },
    "payments.balance_backfill",
  );
  return { status: 200, body: { ok: true, found: jobs.length, enqueued } };
}
