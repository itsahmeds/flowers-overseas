/**
 * The `analytics.ga4` outbox handler (spec 023 §5.2 "The outbox target", "Exactly once", §11;
 * AC-20 to AC-24, AC-26, AC-28; TASK-491): `purchase` once per order on `order.captured` row 2,
 * `refund` once per succeeded refund, by Measurement Protocol to GA4's EU host.
 *
 * It runs in the delivery's own transaction (spec 013's dispatcher). It **never throws for a
 * business reason**: every reason not to send is one `analytics_dispatch` row `skipped` with its
 * reason, and the delivery ends `sent`. It throws only for a retryable transport failure (network
 * error, the 5 s timeout, a 5xx), so the dispatcher retries with its backoff and its 8th failure
 * raises `outbox.dead`. A 4xx is `skipped` `rejected` with the status and `analytics.rejected`:
 * Google says not to resend a refused body.
 *
 * **Exactly once.** A dispatch row for the event already present means the delivery is done
 * (redelivery sends nothing); a `sent` purchase for the order means the same; the partial unique
 * index `analytics_one_purchase_sent` refuses a second one. The one window left (a 2xx, then the
 * process dies before the insert commits) resends the same `transaction_id`, which GA4
 * deduplicates.
 *
 * **Value.** A payment belongs to its purchase (spec 013 §14 A-founder-2026-10-22 item 2, migration
 * `0026`), and a purchase may hold several orders, each with its own GA4 `purchase`. The value is
 * the order's own captured share, `order.buyer_total_minor`, sent only when (a) the purchase's
 * captured payment equals the sum of its orders' totals and (b) the order's lines, less their
 * discount shares, equal the order's total; otherwise `value_mismatch` and the alert. For a
 * one-order purchase the value is exactly `payment.amount_captured_minor` (AC-20). The reading is
 * recorded in `docs/tasks/TASK-491.md` "Escalations".
 *
 * Logs (§8, §11): `order_id`, `event_id`, `kind`, `outcome`, `skip_reason`, `http_status`,
 * `duration_ms`. Never the client id, the session id, the transaction id, the URL or the body.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { ga4ServerConfig, type Ga4ServerConfig } from "@/lib/env.analytics";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { CurrencyCode } from "@/config/currencies";
import { raiseLegacyAlert } from "@/modules/ops";
import {
  type OrderExecutor,
  type OutboxDeliveryEvent,
  type OutboxHandler,
  registerOutboxHandler,
} from "@/modules/orders";

import type { CheckoutChannel } from "../events";
import { type Ga4OrderLine, ga4ItemsFromOrderLines } from "../items";
import { postMp } from "../mp/client";
import { purchaseBody, refundBody } from "../mp/payload";

/** The outbox target name (spec 023 §5.2). */
export const ANALYTICS_TARGET_NAME = "analytics.ga4" as const;

/** The kill switch (spec 023 §12). */
export const ANALYTICS_MP_FLAG = "analytics.mp_send" as const;

/** Past this many hours after the money fact, GA4 would clamp or drop it (§5.0: 72 h, margin 1). */
export const MP_MAX_AGE_HOURS = 71;

/** The only channel built so far; express paths carry theirs once they exist (carry-forward). */
const DEFAULT_CHECKOUT_CHANNEL: CheckoutChannel = "checkout";

export type SkipReason =
  | "no_context"
  | "no_consent"
  | "no_client_id"
  | "not_configured"
  | "disabled"
  | "mode_not_live"
  | "too_old"
  | "value_mismatch"
  | "rejected"
  | "no_purchase_sent"
  | "ids_cleared";

export interface Ga4HandlerDeps {
  readonly config?: () => Ga4ServerConfig;
  readonly flagOn?: () => Promise<boolean>;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
  readonly alert?: (
    alert: "analytics.value_mismatch" | "analytics.rejected",
    fields: { readonly order_id: string; readonly http_status?: number },
  ) => void;
  readonly log?: Logger;
}

/** Thrown for a 5xx answer: retryable, names no URL. */
export class MpServerError extends Error {
  readonly code = "ANALYTICS_MP_SERVER";

  constructor(status: number) {
    super(`ANALYTICS_MP_SERVER: ${String(status)}`);
    this.name = "MpServerError";
  }
}

/** Thrown for an event the target has no step for. */
export class AnalyticsEventUnhandled extends Error {
  readonly code = "ANALYTICS_EVENT_UNHANDLED";

  constructor(type: string) {
    super(`ANALYTICS_EVENT_UNHANDLED: no analytics step for ${type}`);
    this.name = "AnalyticsEventUnhandled";
  }
}

const HOUR_MS = 3_600_000;

const OrderRow = z.object({
  mode: z.enum(["demo", "test", "live"]),
  locale_code: z.string(),
  buyer_total_minor: z.coerce.number().int().nonnegative(),
  buyer_currency_code: z.string(),
  iso2: z.string(),
  country_status: z.enum(["live", "demo", "disabled"]),
  has_context: z.boolean(),
  analytics_consent: z.boolean().nullable(),
  marketing_consent: z.boolean().nullable(),
  ga_client_id: z.string().nullable(),
  ga_session_id: z.string().nullable(),
  ga_transaction_id: z.uuid().nullable(),
  purchase_orders_total: z.coerce.number().int().nonnegative(),
  amount_captured_minor: z.coerce.number().int().nonnegative().nullable(),
  payment_currency: z.string().nullable(),
  captured_at: z.coerce.date().nullable(),
  method: z.string().nullable(),
});
type OrderRowT = z.infer<typeof OrderRow>;

const LineRow = z.object({
  kind: z.enum(["product", "addon", "surcharge"]),
  qty: z.coerce.number().int().positive(),
  unit_retail_minor: z.coerce.number().int().nonnegative(),
  discount_minor: z.coerce.number().int().nonnegative(),
  currency_code: z.string(),
  tier_key: z.string().nullable(),
  sku: z.string().nullable(),
  product_name: z.string().nullable(),
  category_key: z.string().nullable(),
  addon_key: z.string().nullable(),
  addon_name: z.string().nullable(),
});

const RefundPayload = z.object({
  refund_id: z.uuid(),
  amount_minor: z.coerce.number().int().positive(),
  currency_code: z.string().regex(/^[A-Z]{3}$/u),
});

const RefundRow = z.object({
  succeeded_at: z.coerce.date().nullable(),
});

async function one<T>(
  executor: OrderExecutor,
  query: ReturnType<typeof sql>,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  const [row] = await executor.execute(query);
  return row === undefined ? undefined : schema.parse(row);
}

async function readOrder(
  executor: OrderExecutor,
  orderId: string,
): Promise<OrderRowT> {
  const row = await one(
    executor,
    sql`
      SELECT o.mode, o.locale_code, o.buyer_total_minor, o.buyer_currency_code,
             c.iso2, c.status AS country_status,
             (oa.order_id IS NOT NULL) AS has_context,
             oa.analytics_consent, oa.marketing_consent, oa.ga_client_id, oa.ga_session_id,
             oa.ga_transaction_id,
             (SELECT coalesce(sum(s.buyer_total_minor), 0) FROM "order" s
               WHERE s.purchase_id = o.purchase_id) AS purchase_orders_total,
             p.amount_captured_minor, p.currency_code AS payment_currency, p.captured_at, p.method
      FROM "order" o
      JOIN country c ON c.id = o.destination_country_id
      LEFT JOIN order_analytics oa ON oa.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT amount_captured_minor, currency_code, captured_at, method FROM payment
        WHERE purchase_id = o.purchase_id AND status = 'captured'
        ORDER BY captured_at DESC LIMIT 1) p ON true
      WHERE o.id = ${orderId}`,
    OrderRow,
  );
  if (row === undefined) throw new Error("ANALYTICS_ORDER_MISSING");
  return row;
}

async function readLines(
  executor: OrderExecutor,
  orderId: string,
): Promise<z.infer<typeof LineRow>[]> {
  const rows = await executor.execute(sql`
    SELECT l.kind, l.qty, l.unit_retail_minor, l.discount_minor, l.currency_code, l.tier_key,
           p.sku, pt.name AS product_name, cat.key AS category_key,
           a.key AS addon_key, at.name AS addon_name
    FROM order_line l
    LEFT JOIN product p ON p.id = l.product_id
    LEFT JOIN product_translation pt ON pt.product_id = p.id AND pt.locale_code = 'en'
    LEFT JOIN LATERAL (
      SELECT ca.key FROM product_category pc JOIN category ca ON ca.id = pc.category_id
      WHERE pc.product_id = p.id ORDER BY pc.sort, ca.key LIMIT 1) cat ON true
    LEFT JOIN addon a ON a.id = l.addon_id
    LEFT JOIN addon_translation at ON at.addon_id = a.id AND at.locale_code = 'en'
    WHERE l.order_id = ${orderId}
    ORDER BY l.created_at, l.id`);
  return rows.map((row) => LineRow.parse(row));
}

function money(amountMinor: number, currency: string) {
  return { amountMinor, currency: currency as CurrencyCode };
}

function toGa4Lines(lines: readonly z.infer<typeof LineRow>[]): Ga4OrderLine[] {
  return lines.map((line): Ga4OrderLine => {
    const unitPrice = money(line.unit_retail_minor, line.currency_code);
    switch (line.kind) {
      case "product":
        return {
          kind: "product",
          sku: line.sku ?? "unknown",
          enName: line.product_name ?? line.sku ?? "unknown",
          categoryKey: line.category_key ?? "product",
          tierKey: line.tier_key,
          unitPrice,
          quantity: line.qty,
        };
      case "addon":
        return {
          kind: "addon",
          addonKey: line.addon_key ?? "addon",
          enName: line.addon_name ?? line.addon_key ?? "addon",
          unitPrice,
          quantity: line.qty,
        };
      case "surcharge":
        return {
          kind: "surcharge",
          surchargeKind: line.tier_key,
          unitPrice,
          quantity: line.qty,
        };
    }
  });
}

/** The Ga4 analytics handler. */
export function ga4OutboxHandler(deps: Ga4HandlerDeps = {}): OutboxHandler {
  const config = deps.config ?? (() => ga4ServerConfig(process.env));
  const flagOn =
    deps.flagOn ??
    (async () => {
      // Loaded on first use, so importing the analytics barrel reads no flag and opens no pool.
      const { isEnabled } = await import("@/lib/flags");
      return isEnabled(ANALYTICS_MP_FLAG);
    });
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? defaultLogger;
  const alert =
    deps.alert ??
    ((name, fields) => {
      raiseLegacyAlert(name, fields);
    });

  return async (event, context) => {
    const started = Date.now();
    const executor = context.executor;
    const kind: "purchase" | "refund" =
      event.type === "order.captured" ? "purchase" : "refund";
    if (event.type === "order.captured") {
      // Row 14's second `order.captured` (and any other) is not the sale.
      if (event.toStatus !== "paid_unrouted") return;
    } else if (
      event.type !== "order.refunded_partial" &&
      event.type !== "order.refunded_full"
    ) {
      throw new AnalyticsEventUnhandled(event.type);
    }

    // Redelivery: this event already has its outcome.
    const [done] = await executor.execute(sql`
      SELECT 1 FROM analytics_dispatch WHERE event_id = ${event.eventId}`);
    if (done !== undefined) return;

    let refundId: string | null = null;
    let refundAmount: { amountMinor: number; currency: string } | null = null;
    if (kind === "refund") {
      const [payloadRow] = await executor.execute(sql`
        SELECT payload FROM order_event WHERE id = ${event.eventId}`);
      const payload = RefundPayload.parse(
        z.object({ payload: z.unknown() }).parse(payloadRow).payload,
      );
      refundId = payload.refund_id;
      refundAmount = {
        amountMinor: payload.amount_minor,
        currency: payload.currency_code,
      };
    }

    const finish = async (
      outcome: "sent" | "skipped",
      skipReason: SkipReason | null,
      httpStatus: number | null,
    ): Promise<void> => {
      await executor.execute(sql`
        INSERT INTO analytics_dispatch
          (order_id, event_id, kind, refund_id, outcome, skip_reason, http_status, finished_at)
        VALUES (${event.orderId}, ${event.eventId}, ${kind}, ${refundId}, ${outcome},
                ${skipReason}, ${httpStatus}, ${now().toISOString()}::timestamptz)`);
      log.info(
        {
          order_id: event.orderId,
          event_id: event.eventId,
          kind,
          outcome,
          skip_reason: skipReason,
          http_status: httpStatus,
          duration_ms: Date.now() - started,
        },
        "analytics.dispatch",
      );
    };
    const skip = (reason: SkipReason) => finish("skipped", reason, null);

    if (kind === "purchase") {
      const [sent] = await executor.execute(sql`
        SELECT 1 FROM analytics_dispatch
        WHERE order_id = ${event.orderId} AND kind = 'purchase' AND outcome = 'sent'`);
      if (sent !== undefined) return;
    }

    const cfg = config();
    if (!cfg.configured) return skip("not_configured");
    if (!(await flagOn())) return skip("disabled");
    if (cfg.environment === "production" && event.mode !== "live") {
      return skip("mode_not_live");
    }

    const order = await readOrder(executor, event.orderId);

    if (kind === "refund") {
      return sendRefund(event, order);
    }
    return sendPurchase(event, order);

    async function sendPurchase(
      evt: OutboxDeliveryEvent,
      row: OrderRowT,
    ): Promise<void> {
      if (!row.has_context || row.ga_transaction_id === null) {
        return skip("no_context");
      }
      if (row.analytics_consent !== true) return skip("no_consent");
      if (row.ga_client_id === null) return skip("no_client_id");
      if (
        row.captured_at === null ||
        row.amount_captured_minor === null ||
        row.payment_currency === null
      ) {
        // Row 2 means a captured payment; without one the money facts upstream disagree.
        await skip("value_mismatch");
        alert("analytics.value_mismatch", { order_id: evt.orderId });
        return;
      }
      if (
        now().getTime() - row.captured_at.getTime() >
        MP_MAX_AGE_HOURS * HOUR_MS
      ) {
        return skip("too_old");
      }
      const lines = await readLines(executor, evt.orderId);
      const linesNet = lines.reduce(
        (sum, line) =>
          sum + line.unit_retail_minor * line.qty - line.discount_minor,
        0,
      );
      if (
        lines.length === 0 ||
        linesNet !== row.buyer_total_minor ||
        row.purchase_orders_total !== row.amount_captured_minor ||
        row.payment_currency !== row.buyer_currency_code
      ) {
        await skip("value_mismatch");
        alert("analytics.value_mismatch", { order_id: evt.orderId });
        return;
      }
      const cfgOn = cfg as Extract<Ga4ServerConfig, { configured: true }>;
      const body = purchaseBody({
        clientId: row.ga_client_id,
        at: row.captured_at,
        marketingConsent: row.marketing_consent === true,
        transactionId: row.ga_transaction_id,
        environment: cfgOn.environment,
        value: money(row.buyer_total_minor, row.payment_currency),
        items: ga4ItemsFromOrderLines(toGa4Lines(lines), row.iso2),
        sessionId: row.ga_session_id,
        locale: row.locale_code,
        destinationCountry: row.iso2,
        countryStatus: evt.mode === "live" ? "live" : row.country_status,
        paymentType: row.method ?? "unknown",
        checkoutChannel: DEFAULT_CHECKOUT_CHANNEL,
      });
      return deliver(cfgOn, body, evt.orderId);
    }

    async function sendRefund(
      evt: OutboxDeliveryEvent,
      row: OrderRowT,
    ): Promise<void> {
      const [sent] = await executor.execute(sql`
        SELECT 1 FROM analytics_dispatch
        WHERE order_id = ${evt.orderId} AND kind = 'purchase' AND outcome = 'sent'`);
      if (sent === undefined || row.ga_transaction_id === null) {
        return skip("no_purchase_sent");
      }
      if (row.ga_client_id === null) return skip("ids_cleared");
      const refund = await one(
        executor,
        sql`SELECT succeeded_at FROM refund WHERE id = ${refundId}`,
        RefundRow,
      );
      const succeededAt = refund?.succeeded_at ?? null;
      if (
        succeededAt === null ||
        now().getTime() - succeededAt.getTime() > MP_MAX_AGE_HOURS * HOUR_MS
      ) {
        return skip("too_old");
      }
      const amount = refundAmount as { amountMinor: number; currency: string };
      const cfgOn = cfg as Extract<Ga4ServerConfig, { configured: true }>;
      const body = refundBody({
        clientId: row.ga_client_id,
        at: succeededAt,
        marketingConsent: row.marketing_consent === true,
        transactionId: row.ga_transaction_id,
        environment: cfgOn.environment,
        value: money(amount.amountMinor, amount.currency),
      });
      return deliver(cfgOn, body, evt.orderId);
    }

    async function deliver(
      cfgOn: Extract<Ga4ServerConfig, { configured: true }>,
      body: Parameters<typeof postMp>[0],
      orderId: string,
    ): Promise<void> {
      const status = await postMp(
        body,
        { measurementId: cfgOn.measurementId, apiSecret: cfgOn.apiSecret },
        {
          validate: cfgOn.validate,
          log,
          ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
          ...(deps.timeoutMs === undefined
            ? {}
            : { timeoutMs: deps.timeoutMs }),
        },
      );
      if (status >= 200 && status < 300) {
        await finish("sent", null, status);
        return;
      }
      if (status >= 400 && status < 500) {
        await finish("skipped", "rejected", status);
        alert("analytics.rejected", { order_id: orderId, http_status: status });
        return;
      }
      throw new MpServerError(status);
    }
  };
}

/** Registers the handler with the dispatcher, once per process (the worker, `src/jobs/handlers.ts`). */
export function registerAnalyticsOutbox(deps: Ga4HandlerDeps = {}): void {
  registerOutboxHandler(ANALYTICS_TARGET_NAME, ga4OutboxHandler(deps));
}
