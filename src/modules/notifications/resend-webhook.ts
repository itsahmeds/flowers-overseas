/**
 * Resend webhooks (spec 016 §5.2 "Resend webhooks", §8 "Logs and PII", §11; AC-28 to AC-30;
 * TASK-335). The route `POST /api/webhooks/resend` is a thin wrapper over `ingestResendWebhook`;
 * the job `webhook.resend.process` runs `runResendWebhookJob`.
 *
 * **Verify, then store, then answer.** Resend signs with Svix: `svix-id`, `svix-timestamp` (unix
 * seconds) and `svix-signature` (space-separated `v1,<base64>`), the HMAC-SHA256 of
 * `{id}.{timestamp}.{raw body}` under the base64 key after `whsec_` (`verifySvixSignature`). A
 * missing header, a signature that does not match, or a timestamp more than 300 seconds from now
 * either way answers **401 and stores nothing**; each refusal writes one `webhook.rejected` counter
 * line and one Sentry warning fingerprinted `webhook-signature:resend`. A body over 1 MB is 413
 * before anything else. A verified body is stored in `webhook_inbox` (`provider = 'resend'`,
 * `event_id = svix-id`) `ON CONFLICT DO NOTHING`, and only after that commit is
 * `webhook.resend.process` asked for; the answer is 200. A duplicate `svix-id` finds the stored row
 * and answers 200 without a second processing run (it re-asks only for a row still `received`, the
 * case where the first delivery's enqueue failed). Nothing is processed inside the request.
 *
 * **Process once, in any order.** `processResendWebhook(inboxId)` locks the row `FOR UPDATE SKIP
 * LOCKED`, so a settled or busy row is skipped. The stored body is parsed with
 * `ResendEventSchema`; an email status event updates the `notification_delivery` row whose
 * `provider_message_id` is `data.email_id`, **only upwards** in `RESEND_STATUS_RANK`
 * (`queued < sent < delivery_delayed < delivered`, then the final `failed`, `bounced`,
 * `complained`), so events applied in any order leave the highest-precedence status received
 * (AC-29). A final status is never left for a non-final one; the three finals are ranked among
 * themselves only so the result cannot depend on arrival order. A bounce that moves a florist's
 * delivery raises `alert=notifications.florist_bounce`. `email.opened` and `email.clicked` are
 * `ignored` (`not_tracked`; tracking is off on the domain), any other type `unknown_type`, an
 * `email_id` with no delivery row (a sign-in email) `unknown_object`, an event that would move a
 * status backwards `stale`.
 *
 * **Retries and `dead`.** A run that throws (a body that fails the schema, a database error) marks
 * the row `failed` and the job throws, so pg-boss retries it (`retryLimit` 7 in the registry); the
 * eighth attempt marks it `dead` and raises spec 013's `webhook.dead` with `provider=resend` once,
 * after the commit (AC-30). Alerts are raised after the transaction commits, never inside it.
 *
 * **No PII out.** The raw body (which names the recipient address and the subject) is kept only
 * in `webhook_inbox.raw`, as spec 016 §5.2 says, and deleted with the row by the 12-month sweep.
 * Logs, `last_error`, alerts and Sentry carry ids, the event type, reasons and error classes only:
 * never the body, an address, a subject, the signature header or the secret (§8, AC-33).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { captureAlert, captureWebhookSignatureRejected } from "@/lib/sentry";
import {
  withExecutor,
  type AlertRaiser,
  type OrderExecutor,
} from "@/modules/orders";

/** The largest body the endpoint reads: one byte more answers 413 (spec 013 §5.2's cap). */
export const RESEND_WEBHOOK_MAX_BYTES = 1_048_576;

/** How far `svix-timestamp` may be from now, either way (spec 016 §5.2: 5 minutes). */
export const RESEND_WEBHOOK_TOLERANCE_SECONDS = 300;

/** Attempts before a failing row is `dead` (spec 013 §5.2's rule, AC-30). */
export const RESEND_WEBHOOK_MAX_ATTEMPTS = 8;

/** The `webhook_inbox.provider` of these rows. */
const PROVIDER = "resend" as const;

/** The alert a florist bounce raises (spec 016 §11). */
export const FLORIST_BOUNCE_ALERT = "notifications.florist_bounce";

/** `notification_delivery.status`, lowest precedence first (spec 016 §5.2). */
export const RESEND_STATUS_RANK = [
  "queued",
  "sent",
  "delivery_delayed",
  "delivered",
  "failed",
  "bounced",
  "complained",
] as const;
export type DeliveryStatus = (typeof RESEND_STATUS_RANK)[number];

/** The statuses nothing moves a row out of except a higher final one. */
export const FINAL_DELIVERY_STATUSES: ReadonlySet<DeliveryStatus> = new Set([
  "failed",
  "bounced",
  "complained",
]);

/** The Resend event types that carry a delivery status, and the status each sets. */
export const RESEND_STATUS_EVENTS = {
  "email.sent": "sent",
  "email.delivery_delayed": "delivery_delayed",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
} as const satisfies Record<string, DeliveryStatus>;

/** Types stored and deliberately not applied: open and click tracking are off (spec 016 §5.2). */
export const RESEND_IGNORED_EVENTS: ReadonlySet<string> = new Set([
  "email.opened",
  "email.clicked",
]);

/** Why a Resend row is `ignored` (`webhook_inbox.ignore_reason`). */
export type ResendIgnoreReason =
  "not_tracked" | "unknown_type" | "unknown_object" | "stale";

/** Why a request was refused before anything was stored. Closed set: the only thing logged. */
export type ResendRejection =
  "missing_header" | "malformed_header" | "stale_timestamp" | "bad_signature";

/**
 * The status a delivery ends at when `incoming` arrives at a row that is `current`: the higher of
 * the two in `RESEND_STATUS_RANK`. Commutative and idempotent, so any arrival order of the same
 * events gives the same status (AC-29).
 */
export function precedenceOf(
  current: DeliveryStatus,
  incoming: DeliveryStatus,
): DeliveryStatus {
  return RESEND_STATUS_RANK.indexOf(incoming) >
    RESEND_STATUS_RANK.indexOf(current)
    ? incoming
    : current;
}

// ---------------------------------------------------------------------------------------------
// Svix signature
// ---------------------------------------------------------------------------------------------

/** The three Svix headers, as the request carried them (absent → `undefined`). */
export interface SvixHeaders {
  readonly id: string | undefined;
  readonly timestamp: string | undefined;
  readonly signature: string | undefined;
}

/** `svix-id`: Svix's `msg_…` ids; a closed character set, so nothing odd reaches the database. */
const SVIX_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const SVIX_TIMESTAMP = /^\d{1,12}$/;
const SECRET_PREFIX = "whsec_";

/** The HMAC key of a `whsec_…` secret (the prefix is optional, as in Svix's own libraries). */
function secretKey(secret: string): Buffer {
  const encoded = secret.startsWith(SECRET_PREFIX)
    ? secret.slice(SECRET_PREFIX.length)
    : secret;
  return Buffer.from(encoded, "base64");
}

/** The `v1` signature of a body, base64, as Svix computes it. Exported for the suites' signer. */
export function svixSignature(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", secretKey(secret))
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest("base64");
}

/**
 * Verifies a Svix-signed body against `secret` at `now`: the id's shape, the timestamp within
 * `RESEND_WEBHOOK_TOLERANCE_SECONDS` either way, and at least one `v1` signature equal (in
 * constant time) to the body's. Returns the `svix-id` or the reason.
 */
export function verifySvixSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string,
  now: Date,
):
  | { readonly ok: true; readonly id: string }
  | {
      readonly ok: false;
      readonly reason: ResendRejection;
    } {
  const { id, timestamp, signature } = headers;
  if (
    id === undefined ||
    timestamp === undefined ||
    signature === undefined ||
    id === "" ||
    timestamp === "" ||
    signature === ""
  ) {
    return { ok: false, reason: "missing_header" };
  }
  if (!SVIX_ID.test(id) || !SVIX_TIMESTAMP.test(timestamp)) {
    return { ok: false, reason: "malformed_header" };
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    Math.abs(nowSeconds - Number(timestamp)) > RESEND_WEBHOOK_TOLERANCE_SECONDS
  ) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const expected = Buffer.from(
    svixSignature(secret, id, timestamp, rawBody),
    "base64",
  );
  for (const part of signature.split(" ")) {
    const comma = part.indexOf(",");
    if (comma < 0 || part.slice(0, comma) !== "v1") continue;
    const given = Buffer.from(part.slice(comma + 1), "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return { ok: true, id };
    }
  }
  return { ok: false, reason: "bad_signature" };
}

// ---------------------------------------------------------------------------------------------
// Event schemas
// ---------------------------------------------------------------------------------------------

const EVENT_TYPE = z
  .string()
  .max(100)
  .regex(/^[a-z_]+(\.[a-z_]+)+$/);

/**
 * What the endpoint needs before it stores a verified body: a JSON object with an event type.
 * `data.email_id` is read when present (the inbox's `object_ref`); everything else is left to the
 * processing run.
 */
export const ResendEnvelopeSchema = z.looseObject({
  type: EVENT_TYPE,
  data: z
    .looseObject({ email_id: z.string().min(1).max(200).optional() })
    .optional(),
});

/** A status event, as processing reads it: the message id and when Resend saw it. */
export const ResendStatusEventSchema = z.looseObject({
  type: EVENT_TYPE,
  created_at: z.iso.datetime({ offset: true }),
  data: z.looseObject({ email_id: z.string().min(1).max(200) }),
});

// ---------------------------------------------------------------------------------------------
// Ingest (POST /api/webhooks/resend)
// ---------------------------------------------------------------------------------------------

/** One transaction in the `system` context (the suites pass their own). */
export type ResendTransaction = <T>(
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

const systemTransaction: ResendTransaction = (fn) =>
  withExecutor(undefined, "notifications.resend_webhook", fn);

export interface ResendIngestDeps {
  /** `RESEND_WEBHOOK_SECRET`; absent until the founder creates the webhook (503). */
  readonly secret: string | undefined;
  /** Asks for `webhook.resend.process` for one inbox row, after its insert has committed. */
  readonly enqueue: (inboxId: string) => Promise<void>;
  readonly transaction?: ResendTransaction;
  readonly now?: () => Date;
  readonly log?: Logger;
  /** The Sentry half of a refusal; defaults to `captureWebhookSignatureRejected("resend")`. */
  readonly signatureRejected?: (reason: ResendRejection) => void;
}

/** An empty answer: Resend reads the status alone, and no body echoes input. */
function empty(status: number): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

const InsertedRow = z.object({ id: z.uuid(), status: z.string().min(1) });

/**
 * The endpoint's whole body (spec 016 §5.2; AC-28). Never throws for an expected outcome: 503
 * without a secret, 413 over the cap, 401 for a refused signature or timestamp, 400 for a signed
 * body that is not an event, 500 when the store or the enqueue fails (Resend retries), else 200.
 */
export async function ingestResendWebhook(
  request: Request,
  deps: ResendIngestDeps,
): Promise<Response> {
  const log = deps.log ?? defaultLogger;
  if (deps.secret === undefined || deps.secret === "") return empty(503);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > RESEND_WEBHOOK_MAX_BYTES) {
    return empty(413);
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > RESEND_WEBHOOK_MAX_BYTES) {
    return empty(413);
  }
  const now = (deps.now ?? (() => new Date()))();
  const verified = verifySvixSignature(
    rawBody,
    {
      id: request.headers.get("svix-id") ?? undefined,
      timestamp: request.headers.get("svix-timestamp") ?? undefined,
      signature: request.headers.get("svix-signature") ?? undefined,
    },
    deps.secret,
    now,
  );
  if (!verified.ok) {
    // The counter (spec 016 §5.2): one line per refusal, the reason only.
    log.warn(
      {
        provider: PROVIDER,
        reason: verified.reason,
        counter: "webhook_signature_rejected",
      },
      "webhook.rejected",
    );
    (
      deps.signatureRejected ??
      ((reason) => {
        captureWebhookSignatureRejected(PROVIDER, { reason });
      })
    )(verified.reason);
    return empty(401);
  }

  let envelope: z.output<typeof ResendEnvelopeSchema>;
  try {
    const parsed = ResendEnvelopeSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) throw new Error("envelope");
    envelope = parsed.data;
  } catch {
    log.warn(
      { provider: PROVIDER, reason: "body_invalid" },
      "webhook.rejected",
    );
    return empty(400);
  }

  const transaction = deps.transaction ?? systemTransaction;
  let row: { id: string; status: string; fresh: boolean };
  try {
    row = await transaction(async (executor) => {
      const [inserted] = await executor.execute(sql`
        INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, event_type,
                                   object_ref, status)
        VALUES (${PROVIDER}, ${verified.id}, true, (${JSON.stringify(envelope)}::text)::jsonb,
                ${envelope.type}, ${envelope.data?.email_id ?? null}, 'received')
        ON CONFLICT (provider, event_id) DO NOTHING
        RETURNING id, status`);
      if (inserted !== undefined) {
        return { ...InsertedRow.parse(inserted), fresh: true };
      }
      const [existing] = await executor.execute(sql`
        SELECT id, status FROM webhook_inbox
        WHERE provider = ${PROVIDER} AND event_id = ${verified.id}`);
      return { ...InsertedRow.parse(existing), fresh: false };
    });
  } catch (error) {
    log.error(
      {
        provider: PROVIDER,
        event_type: envelope.type,
        error_class: error instanceof Error ? error.name : "unknown",
      },
      "webhook.store_failed",
    );
    return empty(500);
  }

  // A fresh row is asked for; a duplicate only when it is still `received` (its first enqueue
  // failed). A `failed` row is pg-boss's to retry, a settled one is done: no second run.
  if (row.fresh || row.status === "received") {
    try {
      await deps.enqueue(row.id);
    } catch (error) {
      log.error(
        {
          provider: PROVIDER,
          inbox_id: row.id,
          error_class: error instanceof Error ? error.name : "unknown",
        },
        "webhook.enqueue_failed",
      );
      return empty(500);
    }
  }
  log.info(
    {
      provider: PROVIDER,
      inbox_id: row.id,
      event_type: envelope.type,
      fresh: row.fresh,
    },
    "webhook.received",
  );
  return empty(200);
}

// ---------------------------------------------------------------------------------------------
// Process (webhook.resend.process)
// ---------------------------------------------------------------------------------------------

export interface ResendProcessDeps {
  readonly transaction?: ResendTransaction;
  readonly now?: () => Date;
  readonly alert?: AlertRaiser;
  readonly log?: Logger;
}

export type ResendProcessOutcome =
  | { readonly kind: "processed"; readonly status: DeliveryStatus }
  | { readonly kind: "ignored"; readonly reason: ResendIgnoreReason }
  | { readonly kind: "failed"; readonly attempts: number }
  | { readonly kind: "dead" }
  /** Another run holds the row, it is already settled, or it is not a Resend row. */
  | { readonly kind: "skipped"; readonly status: string };

type Routed =
  | { readonly kind: "processed"; readonly status: DeliveryStatus }
  | { readonly kind: "ignored"; readonly reason: ResendIgnoreReason };

interface PendingAlert {
  readonly name: string;
  readonly fields: Readonly<Record<string, unknown>> & {
    readonly order_id?: string;
  };
}

/** A failure that marks the row `failed`; its code is all that is stored. */
class ResendWebhookRetry extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ResendWebhookRetry";
    this.code = code;
  }
}

const DeliveryRow = z.object({
  id: z.uuid(),
  status: z.enum(RESEND_STATUS_RANK),
  audience: z.enum(["buyer", "florist", "ops"]),
  order_id: z.uuid().nullable(),
  template_key: z.string().min(1),
});

const OPEN_STATUSES: ReadonlySet<string> = new Set(["received", "failed"]);

function isStatusEvent(
  type: string,
): type is keyof typeof RESEND_STATUS_EVENTS {
  return Object.hasOwn(RESEND_STATUS_EVENTS, type);
}

/** Applies one status event to its delivery row, upwards only. */
async function applyStatusEvent(
  executor: OrderExecutor,
  raw: unknown,
  type: keyof typeof RESEND_STATUS_EVENTS,
  alerts: PendingAlert[],
): Promise<Routed> {
  const parsed = ResendStatusEventSchema.safeParse(raw);
  if (!parsed.success) throw new ResendWebhookRetry("schema_invalid");
  const incoming = RESEND_STATUS_EVENTS[type];
  const [found] = await executor.execute(sql`
    SELECT id, status, audience, order_id, template_key FROM notification_delivery
    WHERE provider_message_id = ${parsed.data.data.email_id}
    FOR UPDATE`);
  if (found === undefined) return { kind: "ignored", reason: "unknown_object" };
  const delivery = DeliveryRow.parse(found);
  const next = precedenceOf(delivery.status, incoming);
  if (next === delivery.status) return { kind: "ignored", reason: "stale" };
  await executor.execute(sql`
    UPDATE notification_delivery
    SET status = ${next}, status_at = ${parsed.data.created_at}::timestamptz
    WHERE id = ${delivery.id}`);
  if (next === "bounced" && delivery.audience === "florist") {
    alerts.push({
      name: FLORIST_BOUNCE_ALERT,
      fields: {
        delivery_id: delivery.id,
        template_key: delivery.template_key,
        ...(delivery.order_id === null ? {} : { order_id: delivery.order_id }),
      },
    });
  }
  return { kind: "processed", status: next };
}

/**
 * Processes one Resend inbox row (`webhook.resend.process`; AC-29, AC-30). Idempotent: a settled
 * row, one another run holds, or a row of another provider is skipped.
 */
export async function processResendWebhook(
  inboxId: string,
  deps: ResendProcessDeps = {},
): Promise<ResendProcessOutcome> {
  const id = z.uuid().parse(inboxId);
  const transaction = deps.transaction ?? systemTransaction;
  const alert: AlertRaiser = deps.alert ?? captureAlert;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? defaultLogger;
  const alerts: PendingAlert[] = [];

  const outcome = await transaction(
    async (executor): Promise<ResendProcessOutcome> => {
      const [row] = await executor.execute(sql`
        SELECT id, status, attempts, event_type, raw FROM webhook_inbox
        WHERE id = ${id} AND provider = ${PROVIDER} FOR UPDATE SKIP LOCKED`);
      if (row === undefined) return { kind: "skipped", status: "busy" };
      const status = z.string().parse(row["status"]);
      if (!OPEN_STATUSES.has(status)) return { kind: "skipped", status };
      const attempts = z.number().int().parse(row["attempts"]) + 1;

      let routed: Routed;
      try {
        const type = EVENT_TYPE.safeParse(row["event_type"]);
        if (!type.success) throw new ResendWebhookRetry("schema_invalid");
        if (isStatusEvent(type.data)) {
          routed = await applyStatusEvent(
            executor,
            row["raw"],
            type.data,
            alerts,
          );
        } else if (RESEND_IGNORED_EVENTS.has(type.data)) {
          routed = { kind: "ignored", reason: "not_tracked" };
        } else {
          routed = { kind: "ignored", reason: "unknown_type" };
        }
      } catch (error) {
        alerts.length = 0;
        const code =
          error instanceof ResendWebhookRetry
            ? error.code
            : error instanceof Error
              ? error.name
              : "unknown";
        const dead = attempts >= RESEND_WEBHOOK_MAX_ATTEMPTS;
        await executor.execute(sql`
          UPDATE webhook_inbox
          SET status = ${dead ? "dead" : "failed"}, attempts = ${attempts}, last_error = ${code}
          WHERE id = ${id}`);
        log.warn(
          {
            provider: PROVIDER,
            inbox_id: id,
            attempts,
            error_class: code,
            dead,
          },
          "webhook.failed",
        );
        if (dead) {
          alerts.push({
            name: "webhook.dead",
            fields: { inbox_id: id, provider: PROVIDER },
          });
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
      log.info(
        {
          provider: PROVIDER,
          inbox_id: id,
          event_type: z.string().catch("unknown").parse(row["event_type"]),
          outcome: routed.kind,
          ...(routed.kind === "ignored"
            ? { reason: routed.reason }
            : { status: routed.status }),
        },
        "webhook.processed",
      );
      return routed;
    },
  );

  // Raised only once the transaction has committed: a rolled-back run raises nothing.
  for (const pending of alerts) alert(pending.name, pending.fields);
  return outcome;
}

/** Thrown by the job so pg-boss retries a `failed` row; carries no input. */
export class ResendWebhookFailed extends Error {
  constructor(attempts: number) {
    super(`resend webhook row failed on attempt ${String(attempts)}`);
    this.name = "ResendWebhookFailed";
  }
}

/**
 * The `webhook.resend.process` handler: one processing run; a `failed` row throws so pg-boss
 * retries the job, everything else completes it (a `dead` row has raised its alert).
 */
export async function runResendWebhookJob(
  inboxId: string,
  process: (inboxId: string) => Promise<ResendProcessOutcome> = (row) =>
    processResendWebhook(row),
): Promise<ResendProcessOutcome> {
  const outcome = await process(inboxId);
  if (outcome.kind === "failed")
    throw new ResendWebhookFailed(outcome.attempts);
  return outcome;
}
