/**
 * The payment webhook inbox (spec 013 §5.2 "Webhook inbox"; `plan/01` §9; AC-10 event half,
 * AC-21 to AC-26; TASK-260).
 *
 * **Store before process.** `ingestWebhook` reads the raw body (over 1 MB → 413), has the provider
 * verify its signature against the environment's one secret with Stripe's 300-second tolerance
 * (missing header, bad signature or stale timestamp → 400, nothing stored), then inserts the
 * event `ON CONFLICT (provider, event_id) DO NOTHING` and only after that commit asks for
 * `webhook.process`; the caller answers 200. A database failure answers 500, so the provider
 * retries. Nothing is processed inside the request. A verified event whose `livemode` differs from
 * the environment's is stored `ignored` with `livemode_mismatch` and moves nothing (AC-10).
 *
 * **Process once.** `processWebhook(inboxId)` locks its row `FOR UPDATE SKIP LOCKED` for the whole
 * run, so a second delivery of the job, or a concurrent one, finds it busy or already settled:
 * one processing run per event (AC-23). It routes by type:
 *
 *  - `payment_intent.*`: the payment is found by the intent's reference (never by an order), the
 *    intent is **retrieved** from the provider and handed to `reconcile`, which applies it to every
 *    order of the purchase. A state the orders have passed is `ignored` with `stale` (AC-24).
 *  - `refund.created`, `refund.updated`, `refund.failed`: the refund is retrieved and applied to
 *    our refund row (`applyProviderRefund`); `charge.refunded`: every refund of the charge is
 *    listed and applied. A success settles once (one money fact, one event), so whichever of
 *    `refund.updated` and `charge.refunded` arrives second is `ignored` with `stale` (AC-24,
 *    AC-29; TASK-261).
 *  - `charge.dispute.*`: the dispute is retrieved and applied (`applyProviderDispute`): opened,
 *    decided, or nothing new (`stale`) (AC-24, AC-31; TASK-261). Rows TASK-260 left `ignored`
 *    with `awaiting_handler` are re-processed with `pnpm jobs:replay-webhooks --inbox-id`.
 *  - any other type: `ignored` with `unknown_type` (AC-25).
 *
 * A row that fails `InboxEventSchema`, or whose processing throws, is `failed` and retried; on its
 * eighth attempt it is `dead` and `webhook.dead` is raised (AC-25).
 *
 * `replayWebhooks` feeds the provider's own event list (`events.list`, a 30-day window) through
 * the same insert, so a replay is idempotent; `inboxId` re-opens one row (AC-26).
 *
 * Logs and the inbox's `last_error` carry ids, types and error classes only: never the raw body,
 * the signature header or the secret.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { captureAlert } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import {
  withExecutor,
  type AlertRaiser,
  type OrderExecutor,
} from "@/modules/orders";

import type { PaymentTransaction } from "./context.ts";
import { applyProviderDispute } from "./disputes.ts";
import { applyProviderRefund, type ProviderRefundApplied } from "./refunds.ts";
import { createStripeProvider } from "./stripe/adapter.ts";
import { reconcile, type LifecycleDeps } from "./lifecycle.ts";
import {
  isProviderFailure,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderRefund,
  type WebhookHeaders,
} from "./provider.ts";

/** The largest body the endpoint reads (spec 013 §5.2): one byte more answers 413. */
export const WEBHOOK_MAX_BYTES = 1_048_576;

/** Attempts before a failing row is `dead` (spec 013 §5.2, AC-25). */
export const WEBHOOK_MAX_ATTEMPTS = 8;

/** Why a row is `ignored` (`webhook_inbox.ignore_reason`). */
export const WEBHOOK_IGNORE_REASONS = [
  "livemode_mismatch",
  "stale",
  "unknown_type",
  "unknown_object",
  /** TASK-260's interim mark for refund and dispute types; rows that carry it are replayed. */
  "awaiting_handler",
] as const;
export type WebhookIgnoreReason = (typeof WEBHOOK_IGNORE_REASONS)[number];

const PAYMENT_INTENT_PREFIX = "payment_intent.";
/** The refund types, each about one refund (`re_…`). */
const REFUND_TYPES: ReadonlySet<string> = new Set([
  "refund.created",
  "refund.updated",
  "refund.failed",
]);
/** About a charge (`ch_…`): every refund of it is applied. */
const CHARGE_REFUNDED = "charge.refunded";
const DISPUTE_PREFIX = "charge.dispute.";

const systemTransaction: PaymentTransaction = (fn) =>
  withExecutor(undefined, "payments.webhook", fn);

function providerColumn(provider: PaymentProvider): "stripe" | "mollie" {
  return provider.name === "mollie" ? "mollie" : "stripe";
}

// ---------------------------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------------------------

export interface IngestDeps {
  readonly provider: PaymentProvider;
  /** The environment's mode: `true` only in production with live keys. */
  readonly livemode: boolean;
  /** Asks for `webhook.process` for one inbox row, after its insert has committed. */
  readonly enqueue: (inboxId: string) => Promise<void>;
  readonly transaction?: PaymentTransaction;
  readonly now?: () => Date;
}

export type IngestResult =
  | { readonly status: 200; readonly inboxId: string; readonly fresh: boolean }
  | { readonly status: 400 | 413 | 500 };

interface InsertedRow {
  readonly id: string;
  readonly fresh: boolean;
  readonly status: string;
}

const InsertRow = z.object({ id: z.uuid(), status: z.string().min(1) });

/** Inserts one verified event, or finds the row an earlier delivery wrote. */
async function insertEvent(
  executor: OrderExecutor,
  provider: PaymentProvider,
  event: ProviderEvent,
  raw: unknown,
  livemode: boolean,
  now: Date,
): Promise<InsertedRow> {
  const mismatch = event.livemode !== livemode;
  const [inserted] = await executor.execute(sql`
    INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode, event_type,
                               object_ref, status, ignore_reason, processed_at)
    VALUES (${providerColumn(provider)}, ${event.id}, true, (${JSON.stringify(raw)}::text)::jsonb,
            ${event.livemode},
            ${event.type}, ${event.objectRef},
            ${mismatch ? "ignored" : "received"},
            ${mismatch ? "livemode_mismatch" : null},
            ${mismatch ? now.toISOString() : null}::timestamptz)
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING id, status`);
  if (inserted !== undefined) {
    const row = InsertRow.parse(inserted);
    return { ...row, fresh: true };
  }
  const [existing] = await executor.execute(sql`
    SELECT id, status FROM webhook_inbox
    WHERE provider = ${providerColumn(provider)} AND event_id = ${event.id}`);
  return { ...InsertRow.parse(existing), fresh: false };
}

/** Rows a delivery should (re)ask processing for: never one already settled. */
const OPEN_STATUSES: ReadonlySet<string> = new Set(["received", "failed"]);

/**
 * The endpoint's whole job (the route is a thin wrapper): verify, store, ask for processing, and
 * say which status to answer. Never throws for an expected outcome.
 */
export async function ingestWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  deps: IngestDeps,
): Promise<IngestResult> {
  if (Buffer.byteLength(rawBody, "utf8") > WEBHOOK_MAX_BYTES) {
    return { status: 413 };
  }
  const event = deps.provider.verifyAndParseWebhook(rawBody, headers);
  if ("kind" in event) {
    logger.warn({ reason: event.reason }, "payments.webhook_rejected");
    return { status: 400 };
  }
  const raw: unknown = JSON.parse(rawBody);
  const transaction = deps.transaction ?? systemTransaction;
  const now = (deps.now ?? (() => new Date()))();
  let row: InsertedRow;
  try {
    row = await transaction((executor) =>
      insertEvent(executor, deps.provider, event, raw, deps.livemode, now),
    );
  } catch (error) {
    logger.error(
      {
        event_id: event.id,
        error_class: error instanceof Error ? error.name : "unknown",
      },
      "payments.webhook_store_failed",
    );
    return { status: 500 };
  }
  if (OPEN_STATUSES.has(row.status)) {
    try {
      await deps.enqueue(row.id);
    } catch (error) {
      // The row is stored; the provider's retry finds it open and asks again.
      logger.error(
        {
          inbox_id: row.id,
          error_class: error instanceof Error ? error.name : "unknown",
        },
        "payments.webhook_enqueue_failed",
      );
      return { status: 500 };
    }
  }
  logger.info(
    {
      inbox_id: row.id,
      event_id: event.id,
      event_type: event.type,
      fresh: row.fresh,
    },
    "payments.webhook_stored",
  );
  return { status: 200, inboxId: row.id, fresh: row.fresh };
}

// ---------------------------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------------------------

/** The columns a run reads, and the shape they must have to be processed at all. */
export const InboxEventSchema = z.object({
  id: z.uuid(),
  status: z.string().min(1),
  attempts: z.number().int().nonnegative(),
  event_type: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/),
  object_ref: z.string().min(1),
});

export interface ProcessDeps extends Pick<
  LifecycleDeps,
  "provider" | "now" | "alert"
> {
  readonly transaction?: PaymentTransaction;
  /** The lifecycle's own transactions; defaults to `transaction`. */
  readonly lifecycle?: Omit<LifecycleDeps, "provider">;
}

export type ProcessOutcome =
  | { readonly kind: "processed" }
  | { readonly kind: "ignored"; readonly reason: WebhookIgnoreReason }
  | { readonly kind: "failed"; readonly attempts: number }
  | { readonly kind: "dead" }
  /** Another run holds the row, or it is already settled: nothing done. */
  | { readonly kind: "skipped"; readonly status: string };

type Routed =
  | { readonly kind: "processed" }
  | { readonly kind: "ignored"; readonly reason: WebhookIgnoreReason };

/** A failure the run raises so the row is retried; its class is all that is stored. */
class WebhookRetry extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "WebhookRetry";
    this.code = code;
  }
}

async function routePaymentIntent(
  objectRef: string,
  deps: ProcessDeps,
  lifecycle: LifecycleDeps,
  executor: OrderExecutor,
): Promise<Routed> {
  const [payment] = await executor.execute(sql`
    SELECT id FROM payment WHERE provider_ref = ${objectRef}`);
  if (payment === undefined)
    return { kind: "ignored", reason: "unknown_object" };
  const paymentId = z.uuid().parse(payment["id"]);
  const intent = await deps.provider.retrieveIntent(objectRef);
  if (isProviderFailure(intent)) {
    throw new WebhookRetry(`retrieve_${intent.failure}`);
  }
  const result = await reconcile(paymentId, intent, lifecycle);
  return result.outcome === "stale" || result.outcome === "unchanged"
    ? { kind: "ignored", reason: "stale" }
    : { kind: "processed" };
}

/** One refund-or-dispute application's outcome as the inbox records it. */
function routedOf(applied: ProviderRefundApplied): Routed {
  if (applied === "changed") return { kind: "processed" };
  return {
    kind: "ignored",
    reason: applied === "unknown" ? "unknown_object" : "stale",
  };
}

async function routeRefund(
  type: string,
  objectRef: string,
  deps: ProcessDeps,
  lifecycle: LifecycleDeps,
): Promise<Routed> {
  const now = lifecycle.now?.() ?? new Date();
  const alert = lifecycle.alert ?? captureAlert;
  const transaction = lifecycle.transaction ?? systemTransaction;
  const remotes =
    type === CHARGE_REFUNDED
      ? await deps.provider.listChargeRefunds(objectRef)
      : await deps.provider.retrieveRefund(objectRef);
  if (isProviderFailure(remotes)) {
    if (remotes.failure === "not_found") {
      return { kind: "ignored", reason: "unknown_object" };
    }
    throw new WebhookRetry(`retrieve_${remotes.failure}`);
  }
  const list: readonly ProviderRefund[] =
    "ref" in remotes ? [remotes] : remotes;
  const applied = await transaction(async (executor) => {
    const outcomes: ProviderRefundApplied[] = [];
    for (const remote of list) {
      outcomes.push(await applyProviderRefund(executor, remote, now, alert));
    }
    return outcomes;
  });
  if (applied.includes("changed")) return routedOf("changed");
  if (applied.includes("unchanged")) return routedOf("unchanged");
  return routedOf("unknown");
}

async function routeDispute(
  objectRef: string,
  deps: ProcessDeps,
  lifecycle: LifecycleDeps,
): Promise<Routed> {
  const remote = await deps.provider.retrieveDispute(objectRef);
  if (isProviderFailure(remote)) {
    if (remote.failure === "not_found") {
      return { kind: "ignored", reason: "unknown_object" };
    }
    throw new WebhookRetry(`retrieve_${remote.failure}`);
  }
  const now = lifecycle.now?.() ?? new Date();
  const alert = lifecycle.alert ?? captureAlert;
  const transaction = lifecycle.transaction ?? systemTransaction;
  return routedOf(
    await transaction((executor) =>
      applyProviderDispute(executor, remote, now, alert),
    ),
  );
}

/**
 * Processes one inbox row (`webhook.process`). Idempotent: a settled row, or one another run
 * holds, is skipped.
 */
export async function processWebhook(
  inboxId: string,
  deps: ProcessDeps,
): Promise<ProcessOutcome> {
  const id = z.uuid().parse(inboxId);
  const transaction = deps.transaction ?? systemTransaction;
  const alert: AlertRaiser = deps.alert ?? captureAlert;
  const now = deps.now ?? (() => new Date());
  const lifecycle: LifecycleDeps = {
    provider: deps.provider,
    transaction: deps.lifecycle?.transaction ?? transaction,
    now,
    alert,
    ...(deps.lifecycle?.methodSources === undefined
      ? {}
      : { methodSources: deps.lifecycle.methodSources }),
  };

  return transaction(async (executor): Promise<ProcessOutcome> => {
    const [raw] = await executor.execute(sql`
      SELECT id, status, attempts, event_type, object_ref FROM webhook_inbox
      WHERE id = ${id} FOR UPDATE SKIP LOCKED`);
    if (raw === undefined) return { kind: "skipped", status: "busy" };
    const status = z.string().parse(raw["status"]);
    if (!OPEN_STATUSES.has(status)) return { kind: "skipped", status };
    const attempts = z.number().int().parse(raw["attempts"]) + 1;

    let routed: Routed;
    try {
      const row = InboxEventSchema.safeParse(raw);
      if (!row.success) throw new WebhookRetry("schema_invalid");
      const type = row.data.event_type;
      if (type.startsWith(PAYMENT_INTENT_PREFIX)) {
        routed = await routePaymentIntent(
          row.data.object_ref,
          deps,
          lifecycle,
          executor,
        );
      } else if (REFUND_TYPES.has(type) || type === CHARGE_REFUNDED) {
        routed = await routeRefund(type, row.data.object_ref, deps, lifecycle);
      } else if (type.startsWith(DISPUTE_PREFIX)) {
        routed = await routeDispute(row.data.object_ref, deps, lifecycle);
      } else {
        routed = { kind: "ignored", reason: "unknown_type" };
      }
    } catch (error) {
      const code =
        error instanceof WebhookRetry
          ? error.code
          : error instanceof Error
            ? error.name
            : "unknown";
      const dead = attempts >= WEBHOOK_MAX_ATTEMPTS;
      await executor.execute(sql`
        UPDATE webhook_inbox
        SET status = ${dead ? "dead" : "failed"}, attempts = ${attempts}, last_error = ${code}
        WHERE id = ${id}`);
      logger.warn(
        { inbox_id: id, attempts, error_class: code, dead },
        "payments.webhook_failed",
      );
      if (dead) {
        alert("webhook.dead", { inbox_id: id, provider: "stripe" });
        return { kind: "dead" };
      }
      return { kind: "failed", attempts };
    }

    await executor.execute(sql`
      UPDATE webhook_inbox
      SET status = ${routed.kind}, attempts = ${attempts},
          ignore_reason = ${routed.kind === "ignored" ? routed.reason : null},
          processed_at = ${now().toISOString()}::timestamptz, last_error = NULL
      WHERE id = ${id}`);
    logger.info(
      {
        inbox_id: id,
        outcome: routed.kind,
        ...(routed.kind === "ignored" ? { reason: routed.reason } : {}),
      },
      "payments.webhook_processed",
    );
    return routed;
  });
}

// ---------------------------------------------------------------------------------------------
// Replay (pnpm jobs:replay-webhooks)
// ---------------------------------------------------------------------------------------------

export interface ReplayOptions {
  /** Feed the provider's events from this instant on. */
  readonly since?: Date;
  /** Re-open this one row instead (status back to `received`, attempts kept). */
  readonly inboxId?: string;
  /** Count only: write nothing, ask for nothing. */
  readonly dryRun?: boolean;
}

export interface ReplayCounts {
  /** Events the provider listed (or 1 for `inboxId`). */
  readonly seen: number;
  /** New inbox rows. */
  readonly inserted: number;
  /** Rows asked for processing. */
  readonly enqueued: number;
}

/**
 * Feeds the provider's own event list through the inbox insert (an event the endpoint already
 * stored is a conflict and changes nothing), or re-opens one row. Events from `events.list` are
 * fetched over the authenticated API, so they need no signature; the raw body kept is the
 * provider's normalised event.
 */
export async function replayWebhooks(
  options: ReplayOptions,
  deps: IngestDeps,
): Promise<ReplayCounts | { readonly error: "unavailable" | "not_found" }> {
  const transaction = deps.transaction ?? systemTransaction;
  const now = (deps.now ?? (() => new Date()))();

  if (options.inboxId !== undefined) {
    const inboxId = z.uuid().parse(options.inboxId);
    const [row] = await transaction((executor) =>
      executor.execute(sql`SELECT id FROM webhook_inbox WHERE id = ${inboxId}`),
    );
    if (row === undefined) return { error: "not_found" };
    if (options.dryRun === true) return { seen: 1, inserted: 0, enqueued: 0 };
    await transaction((executor) =>
      executor.execute(sql`
        UPDATE webhook_inbox
        SET status = 'received', processed_at = NULL, ignore_reason = NULL
        WHERE id = ${inboxId}`),
    );
    await deps.enqueue(inboxId);
    return { seen: 1, inserted: 0, enqueued: 1 };
  }

  const since = options.since ?? new Date(now.getTime() - 30 * 86_400_000);
  const events = await deps.provider.listEventsSince(since);
  if (isProviderFailure(events)) return { error: "unavailable" };
  if (options.dryRun === true) {
    return { seen: events.length, inserted: 0, enqueued: 0 };
  }
  let inserted = 0;
  let enqueued = 0;
  for (const event of events) {
    const raw = {
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      created: Math.floor(event.createdAt.getTime() / 1000),
      object: { id: event.objectRef, type: event.objectType },
    };
    const row = await transaction((executor) =>
      insertEvent(executor, deps.provider, event, raw, deps.livemode, now),
    );
    if (row.fresh) inserted += 1;
    if (row.fresh && OPEN_STATUSES.has(row.status)) {
      await deps.enqueue(row.id);
      enqueued += 1;
    }
  }
  logger.info(
    { seen: events.length, inserted, enqueued },
    "payments.webhook_replay",
  );
  return { seen: events.length, inserted, enqueued };
}

// ---------------------------------------------------------------------------------------------
// The Stripe endpoint (`POST /api/webhooks/stripe`)
// ---------------------------------------------------------------------------------------------

export interface StripeEndpointConfig {
  /** `STRIPE_SECRET_KEY`; absent until the Stripe account exists. */
  readonly secretKey: string | undefined;
  /** `STRIPE_WEBHOOK_SECRET`; absent until the endpoint exists. */
  readonly webhookSecret: string | undefined;
  /** `true` in production only. */
  readonly livemode: boolean;
  readonly enqueue: (inboxId: string) => Promise<void>;
  /** Defaults to a fresh `system` transaction (tests pass their own). */
  readonly transaction?: PaymentTransaction;
}

/** An empty answer with `status`: the provider reads the status alone, and no body echoes input. */
function empty(status: number): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * The route's whole body. A declared `content-length` over the cap is refused before the body is
 * read; the body is read as raw text (the signature covers its exact bytes). Without the two
 * secrets the endpoint answers 503 and stores nothing.
 */
export async function ingestStripeWebhook(
  request: Request,
  config: StripeEndpointConfig,
  build: (secretKey: string, webhookSecret: string) => PaymentProvider = (
    secretKey,
    webhookSecret,
  ) => createStripeProvider({ secretKey, webhookSecret }),
): Promise<Response> {
  if (
    config.secretKey === undefined ||
    config.secretKey === "" ||
    config.webhookSecret === undefined ||
    config.webhookSecret === ""
  ) {
    return empty(503);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > WEBHOOK_MAX_BYTES) {
    return empty(413);
  }
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const result = await ingestWebhook(rawBody, headers, {
    provider: build(config.secretKey, config.webhookSecret),
    livemode: config.livemode,
    enqueue: config.enqueue,
    ...(config.transaction === undefined
      ? {}
      : { transaction: config.transaction }),
  });
  return empty(result.status);
}

/** The body `POST /api/internal/payments/replay-webhooks` accepts (`pnpm jobs:replay-webhooks`). */
export const ReplayRequestSchema = z
  .object({
    since: z.iso.datetime({ offset: true }).optional(),
    inboxId: z.uuid().optional(),
    dryRun: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => (value.since === undefined) !== (value.inboxId === undefined),
    {
      message: "exactly one of since and inboxId",
    },
  );

/**
 * The replay route's body, after its secret gate: read and parse the JSON body
 * (`ReplayRequestSchema`; 400 otherwise), refuse without Stripe keys (503), run
 * `replayWebhooks` on the Stripe adapter, answer the counts. Counts only, never an event.
 */
export async function replayStripeWebhooks(
  request: Request,
  config: StripeEndpointConfig,
  build: (secretKey: string, webhookSecret: string) => PaymentProvider = (
    secretKey,
    webhookSecret,
  ) => createStripeProvider({ secretKey, webhookSecret }),
): Promise<{ readonly status: number; readonly body: object }> {
  let parsed: ReturnType<typeof ReplayRequestSchema.safeParse>;
  try {
    parsed = ReplayRequestSchema.safeParse(await request.json());
  } catch {
    return { status: 400, body: { ok: false, error: "invalid" } };
  }
  if (!parsed.success) {
    return { status: 400, body: { ok: false, error: "invalid" } };
  }
  if (
    config.secretKey === undefined ||
    config.secretKey === "" ||
    config.webhookSecret === undefined ||
    config.webhookSecret === ""
  ) {
    return {
      status: 503,
      body: { ok: false, error: "payments_not_configured" },
    };
  }
  const result = await replayWebhooks(
    {
      ...(parsed.data.since === undefined
        ? {}
        : { since: new Date(parsed.data.since) }),
      ...(parsed.data.inboxId === undefined
        ? {}
        : { inboxId: parsed.data.inboxId }),
      ...(parsed.data.dryRun === undefined
        ? {}
        : { dryRun: parsed.data.dryRun }),
    },
    {
      provider: build(config.secretKey, config.webhookSecret),
      livemode: config.livemode,
      enqueue: config.enqueue,
      ...(config.transaction === undefined
        ? {}
        : { transaction: config.transaction }),
    },
  );
  if ("error" in result) {
    return {
      status: result.error === "not_found" ? 404 : 503,
      body: { ok: false, error: result.error },
    };
  }
  return { status: 200, body: { ok: true, ...result } };
}
