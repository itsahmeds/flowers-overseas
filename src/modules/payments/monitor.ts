/**
 * The two payment monitors (spec 013 §11, §5.2 "Jobs" `payments.monitor`, §13 Q8 and Q10;
 * AC-39, AC-40; TASK-264). One job, every minute, read-only: it writes no table, calls no
 * provider and raises alerts through `raiseLegacyAlert` (spec 025: the Sentry event, the alert row
 * and the page by severity). Its own reads write nothing; the alert row is the ops module's.
 *
 *  - **`payment.paid_not_routed`** (AC-39): every `test` or `live` order still `authorised` or
 *    `paid_unrouted` more than `PAID_NOT_ROUTED_AFTER_MINUTES` after `expectedFirstOfferAt(order)`
 *    (spec 016's rule, exported by the `orders` barrel). The payment was secured when the order
 *    left `placed` for one of those two states (its `order_event`); a night order is expected at
 *    the next 07:30 in the destination's zone, so it does not page at 23:05. A destination with
 *    no agreed operations (no zone or no same-day cutoff) falls back to AC-39's default, the
 *    secured instant itself. `demo` orders, and orders that reached `routed` or
 *    `no_partner_available` (spec 002 §14 A8), are never selected. Each alert is fingerprinted
 *    `[alert, order_id]`, so the same stuck order on every minute tick is one Sentry issue.
 *  - **`webhook.silent_24h`** (AC-40): `payments.stripe` is on, no `webhook_inbox` row with
 *    `provider = 'stripe'` **and the environment's `livemode`** was received in the last
 *    `WEBHOOK_SILENCE_HOURS`, and a `payment` with a `provider_ref` was created in the last
 *    `WEBHOOK_QUIET_SITE_DAYS` (§13 Q10's recommendation: a site with no recent payment is quiet,
 *    not broken). A row of the other `livemode` counts as none received. Fingerprinted `[alert]`.
 *
 * The decisions are pure (`paidNotRoutedDue`, `webhookSilent`) and the job takes its seams
 * (`transaction`, `now`, `alert`, `log`, `livemode`, `firstOfferAt`): these are the
 * fault-injection hooks the suites use (an injected clock; a first-offer rule swapped out).
 * Logs and alerts carry ids, counts and closed-set words only (§11's field list), never PII.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  PAID_NOT_ROUTED_AFTER_MINUTES,
  WEBHOOK_QUIET_SITE_DAYS,
  WEBHOOK_SILENCE_HOURS,
} from "@/config/payments";
import { appEnvironment } from "@/lib/env.schema";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { raiseLegacyAlert } from "@/modules/ops";
import {
  expectedFirstOfferAt,
  type FirstOfferInput,
  withExecutor,
} from "@/modules/orders";

import type { PaymentTransaction } from "./context.ts";

/** The job's name, as registered in `src/jobs`. */
export const PAYMENTS_MONITOR_JOB = "payments.monitor";

/** The two alerts this job raises (spec 013 §11). */
export const PAID_NOT_ROUTED_ALERT = "payment.paid_not_routed";
export const WEBHOOK_SILENT_ALERT = "webhook.silent_24h";

/** The order states the monitor watches: a secured payment that no florist has been offered. */
export const UNROUTED_STATES = ["authorised", "paid_unrouted"] as const;

/** At most this many stuck orders are reported per tick (the rest on the next). */
export const PAYMENTS_MONITOR_BATCH = 200;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------------------------
// The pure decisions
// ---------------------------------------------------------------------------------------------

/** What the paid-not-routed rule reads off one order. */
export interface UnroutedOrder {
  /** When the payment was secured (the order left `placed`). */
  readonly securedAt: Date;
  readonly deliveryDate: FirstOfferInput["deliveryDate"];
  /** Null when the destination has no zone or no same-day cutoff. */
  readonly destination: FirstOfferInput["destination"] | null;
}

/** When the first offer was due: spec 016's rule, or AC-39's default without a destination. */
export type FirstOfferRule = (order: UnroutedOrder) => Date;

/** The production rule: `expectedFirstOfferAt`, else the secured instant (AC-39's default). */
export const defaultFirstOfferAt: FirstOfferRule = (order) =>
  order.destination === null
    ? order.securedAt
    : expectedFirstOfferAt({
        securedAt: order.securedAt,
        deliveryDate: order.deliveryDate,
        destination: order.destination,
      });

/**
 * True when `now` is **more than** `PAID_NOT_ROUTED_AFTER_MINUTES` after the expected first
 * offer: an order secured at 10:00 (offered at once) is due at 10:05:01, not at 10:05:00.
 */
export function paidNotRoutedDue(
  order: UnroutedOrder,
  now: Date,
  firstOfferAt: FirstOfferRule = defaultFirstOfferAt,
): boolean {
  const threshold =
    firstOfferAt(order).getTime() + PAID_NOT_ROUTED_AFTER_MINUTES * MINUTE_MS;
  return now.getTime() > threshold;
}

/** What the silence rule reads. */
export interface WebhookSilenceFacts {
  /** The global `payments.stripe` flag. */
  readonly stripeOn: boolean;
  /** The newest Stripe inbox row of the environment's `livemode`, or null for none. */
  readonly lastWebhookAt: Date | null;
  /** The newest `payment` with a `provider_ref`, or null for none. */
  readonly lastPaymentAt: Date | null;
}

/**
 * True when the Stripe endpoint has been silent for `WEBHOOK_SILENCE_HOURS` while payments are
 * on and one was made in the last `WEBHOOK_QUIET_SITE_DAYS`. "In the last N" is inclusive of the
 * boundary: a row exactly 24 hours old still counts as received, a payment exactly 7 days old
 * still counts as recent.
 */
export function webhookSilent(facts: WebhookSilenceFacts, now: Date): boolean {
  if (!facts.stripeOn) return false;
  if (facts.lastPaymentAt === null) return false;
  if (
    now.getTime() - facts.lastPaymentAt.getTime() >
    WEBHOOK_QUIET_SITE_DAYS * DAY_MS
  ) {
    return false;
  }
  if (facts.lastWebhookAt === null) return true;
  return (
    now.getTime() - facts.lastWebhookAt.getTime() >
    WEBHOOK_SILENCE_HOURS * HOUR_MS
  );
}

// ---------------------------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------------------------

/** An alert raised by the monitor, with its fingerprint (`raiseLegacyAlert`'s shape). */
export type MonitorAlert = (
  alert: string,
  fields: Readonly<Record<string, unknown>> & { readonly order_id?: string },
  options: { readonly fingerprint: readonly string[] },
) => void;

/** The job's seams; each has the production default. */
export interface PaymentsMonitorDeps {
  /** Default: a fresh `system` transaction. */
  readonly transaction?: PaymentTransaction;
  readonly now?: () => Date;
  /** Default: `raiseLegacyAlert` (spec 025: Sentry, the alert row and the page). */
  readonly alert?: MonitorAlert;
  readonly log?: Logger;
  /** The environment's Stripe mode. Default: `APP_ENV` is `production`. */
  readonly livemode?: boolean;
  /** Default: `defaultFirstOfferAt`. */
  readonly firstOfferAt?: FirstOfferRule;
}

export interface PaymentsMonitorCounts {
  /** `payment.paid_not_routed` alerts raised this tick. */
  readonly paidNotRouted: number;
  /** Whether `webhook.silent_24h` was raised this tick. */
  readonly webhookSilent: boolean;
}

const UnroutedRow = z.object({
  id: z.uuid(),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  iana_zone: z.string().min(1).nullable(),
  same_day_cutoff_local: z.string().min(1).nullable(),
  secured_at: z.coerce.date(),
});

const SilenceRow = z.object({
  stripe_on: z.boolean().nullable(),
  last_webhook_at: z.coerce.date().nullable(),
  last_payment_at: z.coerce.date().nullable(),
});

const systemTransaction: PaymentTransaction = (fn) =>
  withExecutor(undefined, PAYMENTS_MONITOR_JOB, fn);

/**
 * One tick of `payments.monitor`. Reads in one `system` transaction, then raises. Idempotent by
 * construction: it writes nothing, and a repeated alert groups into the same Sentry issue.
 */
export async function runPaymentsMonitor(
  deps: PaymentsMonitorDeps = {},
): Promise<PaymentsMonitorCounts> {
  const transaction = deps.transaction ?? systemTransaction;
  const now = (deps.now ?? (() => new Date()))();
  const alert: MonitorAlert = deps.alert ?? raiseLegacyAlert;
  const log = deps.log ?? defaultLogger;
  const livemode =
    deps.livemode ?? appEnvironment(process.env) === "production";
  const firstOfferAt = deps.firstOfferAt ?? defaultFirstOfferAt;
  // No first offer is ever due before the payment was secured, so an order secured within the
  // threshold cannot be due; the exact instant is decided below, in the order's own zone.
  const securedBefore = new Date(
    now.getTime() - PAID_NOT_ROUTED_AFTER_MINUTES * MINUTE_MS,
  );

  const { unrouted, silence } = await transaction(async (executor) => {
    const unroutedRows = await executor.execute(sql`
      SELECT o.id, o.delivery_date::text AS delivery_date,
             coalesce(ci.iana_zone, c.iana_zone) AS iana_zone,
             to_char(c.same_day_cutoff_local, 'HH24:MI') AS same_day_cutoff_local,
             s.secured_at
      FROM "order" o
      JOIN country c ON c.id = o.destination_country_id
      LEFT JOIN city ci ON ci.id = o.destination_city_id
      CROSS JOIN LATERAL (
        SELECT coalesce(min(e.occurred_at), o.created_at) AS secured_at
        FROM order_event e
        WHERE e.order_id = o.id AND e.from_status = 'placed'
          AND e.to_status IN ('authorised', 'paid_unrouted')
      ) s
      WHERE o.status IN ('authorised', 'paid_unrouted')
        AND o.mode IN ('test', 'live')
        AND s.secured_at < ${securedBefore.toISOString()}::timestamptz
      ORDER BY s.secured_at, o.id
      LIMIT ${PAYMENTS_MONITOR_BATCH}`);
    const [silenceRow] = await executor.execute(sql`
      SELECT
        (SELECT coalesce(
                  (SELECT s.enabled FROM feature_flag_scope s
                   WHERE s.flag_key = f.key AND s.scope = 'global' AND s.scope_ref = '*'),
                  f.enabled_default)
         FROM feature_flag f WHERE f.key = 'payments.stripe') AS stripe_on,
        (SELECT max(w.received_at) FROM webhook_inbox w
         WHERE w.provider = 'stripe' AND w.livemode = ${livemode}) AS last_webhook_at,
        (SELECT max(p.created_at) FROM payment p
         WHERE p.provider_ref IS NOT NULL) AS last_payment_at`);
    return {
      unrouted: unroutedRows.map((row) => UnroutedRow.parse(row)),
      silence: SilenceRow.parse(silenceRow),
    };
  });

  let paidNotRouted = 0;
  for (const row of unrouted) {
    const order: UnroutedOrder = {
      securedAt: row.secured_at,
      deliveryDate: row.delivery_date,
      destination:
        row.iana_zone === null || row.same_day_cutoff_local === null
          ? null
          : {
              ianaZone: row.iana_zone,
              sameDayCutoffLocal: row.same_day_cutoff_local,
            },
    };
    if (!paidNotRoutedDue(order, now, firstOfferAt)) continue;
    paidNotRouted += 1;
    log.error(
      { order_id: row.id, job: PAYMENTS_MONITOR_JOB },
      PAID_NOT_ROUTED_ALERT,
    );
    alert(
      PAID_NOT_ROUTED_ALERT,
      { order_id: row.id, job: PAYMENTS_MONITOR_JOB },
      { fingerprint: [PAID_NOT_ROUTED_ALERT, row.id] },
    );
  }

  const silent = webhookSilent(
    {
      stripeOn: silence.stripe_on === true,
      lastWebhookAt: silence.last_webhook_at,
      lastPaymentAt: silence.last_payment_at,
    },
    now,
  );
  if (silent) {
    const fields = { provider: "stripe", livemode, job: PAYMENTS_MONITOR_JOB };
    log.error(fields, WEBHOOK_SILENT_ALERT);
    alert(WEBHOOK_SILENT_ALERT, fields, {
      fingerprint: [WEBHOOK_SILENT_ALERT],
    });
  }
  return { paidNotRouted, webhookSilent: silent };
}
