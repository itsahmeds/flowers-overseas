/**
 * Spec 018 invoices, connected half (TASK-341), on a migrated PG16 scratch database
 * (`support/scratch-db.ts`; never the shared database):
 *
 *  - **AC-15 / T-15:** the launch walk `placed → paid_unrouted → routed → accepted → paid` through
 *    the engine and the outbox: one invoice, issued at the first `order.captured` before any
 *    routing event; row 14's second `order.captured` issues nothing. The `authorised` walk: one
 *    invoice, at row 14. `demo` and `test` walks: no invoice, every `next_number` unchanged.
 *    Twenty concurrent issuances in one series: 1..20, no gap, no duplicate; two concurrent issues
 *    of one order: one invoice. A year boundary: the profile repointed to a 2027 series starts at
 *    000001 and leaves 2026's counter alone.
 *  - **AC-20 / T-20:** each refusal in its fixture case: the code, `next_number` unchanged, the
 *    alert spy called (`INVOICE_NOT_CAPTURED` only after the 8th attempt).
 *  - **AC-21 / T-21:** a partial refund (row 30), then a full one (row 31): credit notes in the
 *    credit series, referencing the invoice, negative per rate, summing to each refund, the two
 *    netting the invoice to zero per rate; a refund after `cancelled` (row 32) nets it to zero; a
 *    refund on an order with no invoice: `INVOICE_CREDIT_NO_INVOICE` and an alert;
 *    `order.chargeback_lost`: no credit note; a replayed delivery: nothing new.
 *
 * Each case runs in a transaction that is rolled back, except the concurrency cases, which need
 * real separate transactions and so use their own series and country.
 */
import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { COMPANY, type Company } from "@/config/company";
import { createLogger, type Logger } from "@/lib/logger";
import {
  InvoiceRefusal,
  InvoiceSnapshotV1,
  CreditNoteSnapshotV1,
  invoicesOutboxHandler,
  issueCreditNote,
  issueInvoice,
  type InvoiceOptions,
  type VatRateProvider,
} from "@/modules/invoices";
import {
  dispatchOutbox,
  transition,
  type AlertRaiser,
  type DeliveryTransaction,
  type OutboxHandler,
} from "@/modules/orders";
import "@/modules/payments/events";

import {
  ACTOR_OF,
  registerFixtureEventSchemas,
} from "../fixtures/order-engine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import { country, customer, recipient, unique } from "./support/rows.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
registerFixtureEventSchemas();

/** Spec 013 §5.2: "after 8 attempts `dead`". The literal, so changing the constant fails here. */
const MAX_ATTEMPTS = 8;

/** A registered issuer with obviously fake facts: no real registry number or address. */
const ISSUER: Company = {
  ...COMPANY,
  registered: true,
  legalName: "Test Seller LLC",
  registryName: "Test Register",
  registrationNumber: "TEST-0001",
  address: {
    lines: ["1 Test Street"],
    postalCode: "00001",
    city: "Testville",
    countryIso2: "US",
  },
  supportEmail: "support@example.test",
};

function alerts(): AlertRaiser & {
  raised: { alert: string; fields: Record<string, unknown> }[];
} {
  const raised: { alert: string; fields: Record<string, unknown> }[] = [];
  const raise: AlertRaiser = (alert, fields) => {
    raised.push({ alert, fields: { ...fields } });
  };
  return Object.assign(raise, { raised });
}

function silentLogger(): Logger {
  return createLogger({ level: "debug", write: () => undefined });
}

const noop: OutboxHandler = () => Promise.resolve();

function savepoints(tx: Tx): DeliveryTransaction {
  return <T>(fn: (executor: ReturnType<typeof runnerOf>) => Promise<T>) =>
    tx.savepoint((sp) => fn(runnerOf(sp))) as Promise<T>;
}

/** One dispatch run over `orderId`'s due deliveries, with the real `invoices` handler. */
async function dispatch(
  tx: Tx,
  orderId: string,
  alert: AlertRaiser = alerts(),
  batchSize?: number,
): Promise<void> {
  await dispatchOutbox({
    handlers: {
      invoices: invoicesOutboxHandler({
        company: ISSUER,
        alert,
        log: silentLogger(),
      }),
      payments: noop,
      routing: noop,
      notifications: noop,
      payouts: noop,
    },
    transaction: savepoints(tx),
    orderId,
    retryBaseSeconds: 0,
    ...(batchSize === undefined ? {} : { batchSize }),
    alert: () => undefined,
    log: silentLogger(),
  });
}

function opts(tx: Tx, extra: Partial<InvoiceOptions> = {}): InvoiceOptions {
  return {
    executor: runnerOf(tx),
    company: ISSUER,
    alert: alerts(),
    log: silentLogger(),
    ...extra,
  };
}

/** The issuing data for a destination: VAT registration, active profile, flag on. */
async function invoicing(
  tx: Tx,
  iso2 = "PL",
  series = { invoice: "fo-pl-2026", credit: "fok-pl-2026" },
): Promise<void> {
  await country(tx, iso2);
  await tx`INSERT INTO tax_registration (country_iso2, vat_id, valid_from)
           VALUES (${iso2}, ${`${iso2}0000000000`}, DATE '2020-01-01')`;
  await tx`INSERT INTO invoice_profile (key, supply_model, destination_iso2, document_kind,
                                        title_key, label_locales, vat_bearing_line_kinds,
                                        series_key, credit_series_key, active)
           VALUES (${`principal-${iso2.toLowerCase()}`}, 'principal', ${iso2}, 'vat_invoice',
                   'invoice.title.vat', ARRAY['pl', '{buyer}'],
                   ARRAY['product', 'addon', 'surcharge'], ${series.invoice}, ${series.credit}, true)`;
  await tx`INSERT INTO feature_flag_scope (flag_key, scope, scope_ref, enabled)
           VALUES ('invoice.issue', 'country', ${iso2}, true)
           ON CONFLICT (flag_key, scope, scope_ref) DO UPDATE SET enabled = true`;
}

interface Line {
  readonly kind: "product" | "addon" | "surcharge";
  readonly gross: number;
  readonly rateBp: number;
}

/** AC-17's fixture: one 8 % bouquet and one 23 % add-on, paid in GBP. */
const MIXED: readonly Line[] = [
  { kind: "product", gross: 6_799, rateBp: 800 },
  { kind: "addon", gross: 1_299, rateBp: 2300 },
];
const SINGLE: readonly Line[] = [
  { kind: "product", gross: 6_799, rateBp: 800 },
];

/** A placed order to `iso2` with its lines, `vat_breakdown` and `supply_model`. */
async function order(
  tx: Tx,
  options: {
    mode?: "demo" | "test" | "live";
    lines?: readonly Line[];
    iso2?: string;
    supplyModel?: "principal" | null;
  } = {},
): Promise<string> {
  const lines = options.lines ?? MIXED;
  const total = lines.reduce((sum, line) => sum + line.gross, 0);
  const countryId = await country(tx, options.iso2 ?? "PL");
  const customerId = await customer(tx);
  const id = await insertPlacedOrder(tx, {
    countryId,
    customerId,
    recipientId: await recipient(tx, customerId),
    mode: options.mode ?? "live",
    currencyCode: "GBP",
    totalMinor: total,
  });
  const byRate = new Map<number, number>();
  for (const line of lines)
    byRate.set(line.rateBp, (byRate.get(line.rateBp) ?? 0) + line.gross);
  const breakdown = [...byRate].map(([rateBp, grossMinor]) => ({
    rateBp,
    grossMinor,
    vatMinor: 0,
    netMinor: grossMinor,
  }));
  await tx`UPDATE "order"
           SET vat_breakdown = ${tx.json(breakdown)},
               supply_model = ${options.supplyModel === undefined ? "principal" : options.supplyModel},
               buyer_snapshot = ${tx.json({ name: "Test Buyer", email: "buyer@example.test", countryIso2: "GB" })}
           WHERE id = ${id}`;
  for (const line of lines) {
    let productId: string | null = null;
    let addonId: string | null = null;
    if (line.kind === "product") {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                             substitution_class, freshness_days)
        VALUES (${unique("SKU-")}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
        RETURNING id`;
      productId = row?.id ?? null;
      await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
               VALUES (${productId}, 'pl', 'Bukiet róż', ${unique("bukiet-")})`;
    }
    if (line.kind === "addon") {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO addon (key, kind) VALUES (${unique("chocolates_").replaceAll("-", "")}, 'confectionery') RETURNING id`;
      addonId = row?.id ?? null;
      await tx`INSERT INTO addon_translation (addon_id, locale_code, name)
               VALUES (${addonId}, 'pl', 'Czekoladki'), (${addonId}, 'en', 'Chocolates')`;
    }
    await tx`INSERT INTO order_line (order_id, kind, product_id, addon_id, qty, unit_retail_minor,
                                     currency_code, vat_rate_bp)
             VALUES (${id}, ${line.kind}, ${productId}, ${addonId}, 1, ${line.gross}, 'GBP',
                     ${line.rateBp})`;
  }
  return id;
}

/**
 * The payment of the order's purchase, captured now (`payment.captured_at`, the money fact). Since
 * `0026_payment_purchase` a payment pays for a purchase, at the purchase's total.
 */
async function capturePayment(tx: Tx, orderId: string): Promise<string> {
  const [row] = await tx<{ id: string; total: string }[]>`
    INSERT INTO payment (purchase_id, provider, provider_ref, status, method, amount_minor,
                         currency_code, livemode, capture_method, amount_captured_minor, captured_at)
    SELECT pu.id, 'stripe', ${unique("pi_")}, 'captured', 'card', pu.total_minor, 'GBP', true,
           'automatic', pu.total_minor, now()
    FROM "order" o JOIN purchase pu ON pu.id = o.purchase_id
    WHERE o.id = ${orderId}
    RETURNING id`;
  return row?.id ?? "";
}

async function engine(
  tx: Tx,
  orderId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await transition(
    orderId,
    event as "order.captured",
    ACTOR_OF.system,
    payload,
    {
      executor: runnerOf(tx),
    },
  );
}

/** A succeeded refund of `amount` on the order's payment, settled through the engine. */
async function refund(
  tx: Tx,
  orderId: string,
  amount: number,
  event: "order.refunded_partial" | "order.refunded_full",
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO refund (payment_id, order_id, purchase_id, provider_ref, amount_minor,
                        currency_code, reason, status, requested_by, succeeded_at)
    SELECT p.id, o.id, o.purchase_id, ${unique("re_")}, ${amount}, 'GBP', 'quality', 'succeeded',
           'system:test', now()
    FROM payment p JOIN "order" o ON o.purchase_id = p.purchase_id
    WHERE o.id = ${orderId}
    RETURNING id`;
  const refundId = row?.id ?? "";
  await engine(tx, orderId, event, {
    mode: "live",
    refund_id: refundId,
    amount_minor: amount,
    currency_code: "GBP",
    reason: "quality",
  });
  return refundId;
}

async function nextNumbers(tx: Tx): Promise<Record<string, number>> {
  const rows = await tx<{ key: string; next_number: number }[]>`
    SELECT key, next_number FROM invoice_series ORDER BY key`;
  return Object.fromEntries(rows.map((row) => [row.key, row.next_number]));
}

interface DocRow {
  kind: string;
  number: string;
  series_key: string;
  total_minor: string;
  refund_id: string | null;
  corrects_invoice_id: string | null;
  snapshot: unknown;
  id: string;
}

async function documents(tx: Tx, orderId: string): Promise<DocRow[]> {
  return tx<DocRow[]>`
    SELECT id, kind, number, series_key, total_minor::text, refund_id, corrects_invoice_id, snapshot
    FROM invoice WHERE order_id = ${orderId} ORDER BY number`;
}

/** Runs `fn` in a savepoint that is always rolled back, and returns its result. */
async function undone<T>(tx: Tx, fn: (sp: Tx) => Promise<T>): Promise<T> {
  const box: { value?: T } = {};
  const sentinel = new Error("undone");
  try {
    await tx.savepoint(async (sp) => {
      box.value = await fn(sp);
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  return box.value as T;
}

async function refusalOf(
  promise: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof InvoiceRefusal) return error.code;
    throw error;
  }
  return undefined;
}

describe.skipIf(server.url === undefined)(
  `spec 018 invoices (TASK-341)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "invoices");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-15: the launch walk issues one invoice at the first order.captured, before routing; row 14 issues nothing", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        const before = await nextNumbers(tx);
        const id = await order(tx);
        await capturePayment(tx, id);
        await engine(tx, id, "order.captured", { mode: "live" });
        await dispatch(tx, id);
        const atCapture = await documents(tx, id);
        const [routedEvents] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM order_event WHERE order_id = ${id} AND type = 'order.routed'`;
        await applyTransition(tx, id, "order.routed", "routed");
        await applyTransition(tx, id, "assignment.accepted", "accepted");
        await engine(tx, id, "order.captured", { mode: "live" });
        await dispatch(tx, id);
        const [status] = await tx<
          { status: string }[]
        >`SELECT status FROM "order" WHERE id = ${id}`;
        return {
          before,
          after: await nextNumbers(tx),
          atCapture,
          routedBefore: routedEvents?.n,
          final: await documents(tx, id),
          status: status?.status,
        };
      });
      expect(result.routedBefore).toBe(0);
      expect(result.atCapture.map((doc) => [doc.kind, doc.number])).toEqual([
        ["invoice", "FO-PL/2026/000001"],
      ]);
      expect(result.status).toBe("paid");
      expect(result.final.map((doc) => doc.id)).toEqual(
        result.atCapture.map((doc) => doc.id),
      );
      expect(result.after["fo-pl-2026"]).toBe(
        (result.before["fo-pl-2026"] ?? 0) + 1,
      );
      expect(result.after["fok-pl-2026"]).toBe(result.before["fok-pl-2026"]);
      const snapshot = InvoiceSnapshotV1.parse(result.final[0]?.snapshot);
      expect(snapshot.byRate).toEqual([
        { rateBp: 800, netMinor: 6_295, vatMinor: 504, grossMinor: 6_799 },
        { rateBp: 2300, netMinor: 1_056, vatMinor: 243, grossMinor: 1_299 },
      ]);
      expect(snapshot.totals.grossMinor).toBe(8_098);
      expect(result.final[0]?.total_minor).toBe("8098");
      expect(snapshot.buyer).toEqual({ name: "Test Buyer", countryIso2: "GB" });
      expect(JSON.stringify(snapshot)).not.toContain("buyer@example.test");
      expect(snapshot.issuer.vatIds).toEqual([
        { countryIso2: "PL", vatId: "PL0000000000" },
      ]);
      expect(snapshot.issuer.legalName).toBe("Test Seller LLC");
      expect(snapshot.lines.map((line) => line.names)).toEqual([
        { pl: "Bukiet róż" },
        { pl: "Czekoladki", en: "Chocolates" },
      ]);
      expect(snapshot.supplyDate).toBe("2027-02-14");
      expect(snapshot.orderReference).toMatch(/^FO-[0-9A-Z]{4}-[0-9A-Z]{4}$/u);
    });

    it("AC-15: the authorised walk (machine fixture) issues one invoice, at row 14", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        const id = await order(tx);
        await applyTransition(tx, id, "order.authorised", "authorised");
        await applyTransition(tx, id, "order.routed", "routed");
        await applyTransition(tx, id, "assignment.accepted", "accepted");
        const beforeCapture = await documents(tx, id);
        await capturePayment(tx, id);
        await engine(tx, id, "order.captured", { mode: "live" });
        await dispatch(tx, id);
        return { beforeCapture, after: await documents(tx, id) };
      });
      expect(result.beforeCapture).toEqual([]);
      expect(result.after.map((doc) => doc.number)).toEqual([
        "FO-PL/2026/000001",
      ]);
    });

    it("AC-15: demo and test walks to capture and refund create no invoice and leave every next_number unchanged", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        const before = await nextNumbers(tx);
        const out: Record<string, unknown> = {};
        for (const mode of ["demo", "test"] as const) {
          const id = await order(tx, { mode });
          await capturePayment(tx, id);
          await engine(tx, id, "order.captured", { mode });
          await dispatch(tx, id);
          const alert = alerts();
          out[`${mode} direct`] = await refusalOf(
            issueInvoice(id, opts(tx, { alert })),
          );
          out[`${mode} alerts`] = alert.raised.length;
          const [targets] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM outbox_delivery d JOIN outbox x ON x.id = d.outbox_id
            WHERE x.order_id = ${id} AND d.target = 'invoices'`;
          out[`${mode} invoice deliveries`] = targets?.n;
          out[`${mode} documents`] = (await documents(tx, id)).length;
        }
        return { out, before, after: await nextNumbers(tx) };
      });
      expect(result.out).toEqual({
        "demo direct": "INVOICE_NOT_LIVE",
        "demo alerts": 0,
        "demo invoice deliveries": 0,
        "demo documents": 0,
        "test direct": "INVOICE_NOT_LIVE",
        "test alerts": 0,
        "test invoice deliveries": 0,
        "test documents": 0,
      });
      expect(result.after).toEqual(result.before);
    });

    it("AC-15: the year boundary: the profile repointed to a 2027 series starts at 000001; 2026 keeps its counter", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        const first = await order(tx);
        await capturePayment(tx, first);
        const a = await issueInvoice(first, opts(tx));
        await tx`INSERT INTO invoice_series (key, prefix, year) VALUES ('fo-pl-2027', 'FO-PL', 2027)`;
        await tx`UPDATE invoice_profile SET series_key = 'fo-pl-2027' WHERE key = 'principal-pl'`;
        const second = await order(tx);
        await capturePayment(tx, second);
        const b = await issueInvoice(second, opts(tx));
        return { a: a.number, b: b.number, after: await nextNumbers(tx) };
      });
      expect(result.a).toBe("FO-PL/2026/000001");
      expect(result.b).toBe("FO-PL/2027/000001");
      expect(result.after["fo-pl-2026"]).toBe(2);
      expect(result.after["fo-pl-2027"]).toBe(2);
    });

    it("AC-19 (snapshot half): a PLN VAT currency stores the provider's rate, asked for the capture date", async () => {
      const asked: unknown[] = [];
      const provider: VatRateProvider = {
        rateFor: (request) => {
          asked.push(request);
          return Promise.resolve({
            from: request.from,
            to: request.to,
            rate: "5.1234",
            source: "nbp_table_a",
            table: "001/A/NBP/2026",
            effectiveDate: "2026-10-30",
          });
        },
      };
      const snapshot = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        await tx`UPDATE invoice_profile SET vat_currency_code = 'PLN',
                   vat_rate_source = 'nbp_previous_business_day' WHERE key = 'principal-pl'`;
        const id = await order(tx);
        await capturePayment(tx, id);
        await issueInvoice(id, opts(tx, { vatRates: provider }));
        const [today] = await tx<{ d: string }[]>`
          SELECT (now() AT TIME ZONE 'Europe/Warsaw')::date::text AS d`;
        return { docs: await documents(tx, id), today: today?.d };
      });
      expect(asked).toEqual([
        { from: "GBP", to: "PLN", taxPointDate: snapshot.today },
      ]);
      const parsed = InvoiceSnapshotV1.parse(snapshot.docs[0]?.snapshot);
      expect(parsed.vatCurrency).toBe("PLN");
      expect(parsed.vatRate?.rate).toBe("5.1234");
    });

    it("AC-20: each refusal in its fixture case names its code, keeps next_number and raises its alert", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        const cases: Record<
          string,
          (sp: Tx, id: string) => Promise<Partial<InvoiceOptions>>
        > = {
          INVOICE_ISSUER_INCOMPLETE: () =>
            Promise.resolve({ company: COMPANY }),
          "INVOICE_ISSUER_INCOMPLETE (no registration)": async (sp) => {
            await sp`DELETE FROM tax_registration WHERE country_iso2 = 'PL'`;
            return {};
          },
          INVOICE_SUPPLY_MODEL_UNSET: async (sp, id) => {
            await sp`UPDATE "order" SET supply_model = NULL WHERE id = ${id}`;
            return {};
          },
          INVOICE_NO_PROFILE: async (sp) => {
            await sp`UPDATE invoice_profile SET active = false WHERE key = 'principal-pl'`;
            return {};
          },
          INVOICE_FLAG_OFF: async (sp) => {
            await sp`UPDATE feature_flag_scope SET enabled = false
                     WHERE flag_key = 'invoice.issue' AND scope_ref = 'PL'`;
            return {};
          },
          INVOICE_TOTAL_MISMATCH: async (sp, id) => {
            await sp`UPDATE "order" SET vat_breakdown = ${sp.json([
              { rateBp: 800, grossMinor: 6_798, vatMinor: 0, netMinor: 6_798 },
              { rateBp: 2300, grossMinor: 1_300, vatMinor: 0, netMinor: 1_300 },
            ])} WHERE id = ${id}`;
            return {};
          },
        };
        const out: Record<string, unknown> = {};
        for (const [name, arrange] of Object.entries(cases)) {
          const outcome = await undone(tx, async (sp) => {
            const id = await order(sp);
            await capturePayment(sp, id);
            const extra = await arrange(sp, id);
            const before = await nextNumbers(sp);
            const alert = alerts();
            const code = await refusalOf(
              issueInvoice(id, opts(sp, { alert, ...extra })),
            );
            return {
              code,
              unchanged:
                JSON.stringify(await nextNumbers(sp)) ===
                JSON.stringify(before),
              alerts: alert.raised.map(
                (raised) => `${raised.alert}:${String(raised.fields["code"])}`,
              ),
              documents: (await documents(sp, id)).length,
            };
          });
          out[name] = outcome;
        }
        return out;
      });
      const expected = (code: string) => ({
        code,
        unchanged: true,
        alerts: [`invoice.refused:${code}`],
        documents: 0,
      });
      expect(result).toEqual({
        INVOICE_ISSUER_INCOMPLETE: expected("INVOICE_ISSUER_INCOMPLETE"),
        "INVOICE_ISSUER_INCOMPLETE (no registration)": expected(
          "INVOICE_ISSUER_INCOMPLETE",
        ),
        INVOICE_SUPPLY_MODEL_UNSET: expected("INVOICE_SUPPLY_MODEL_UNSET"),
        INVOICE_NO_PROFILE: expected("INVOICE_NO_PROFILE"),
        INVOICE_FLAG_OFF: expected("INVOICE_FLAG_OFF"),
        INVOICE_TOTAL_MISMATCH: expected("INVOICE_TOTAL_MISMATCH"),
      });
    });

    it("AC-20: INVOICE_NOT_CAPTURED is retried and alerts only after the 8th attempt; next_number unchanged", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        const before = await nextNumbers(tx);
        const id = await order(tx);
        await engine(tx, id, "order.captured", { mode: "live" });
        const alert = alerts();
        // One delivery per run, so each run is at most one attempt of the invoices delivery;
        // the alert count is read after each of its attempts.
        const alertsAfter: number[] = [];
        for (let run = 0; run < MAX_ATTEMPTS + 2; run += 1) {
          await dispatch(tx, id, alert, 1);
          const [state] = await tx<{ attempts: number }[]>`
            SELECT d.attempts FROM outbox_delivery d JOIN outbox x ON x.id = d.outbox_id
            WHERE x.order_id = ${id} AND d.target = 'invoices'`;
          const attempts = state?.attempts ?? 0;
          if (attempts > alertsAfter.length)
            alertsAfter.push(alert.raised.length);
        }
        const [delivery] = await tx<{ status: string; attempts: number }[]>`
          SELECT d.status, d.attempts FROM outbox_delivery d JOIN outbox x ON x.id = d.outbox_id
          WHERE x.order_id = ${id} AND d.target = 'invoices'`;
        return {
          before,
          after: await nextNumbers(tx),
          alertsAfter,
          raised: alert.raised,
          delivery,
        };
      });
      expect(result.alertsAfter).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
      expect(result.raised[0]).toMatchObject({
        alert: "invoice.refused",
        fields: { code: "INVOICE_NOT_CAPTURED", attempts: MAX_ATTEMPTS },
      });
      expect(result.delivery).toEqual({
        status: "dead",
        attempts: MAX_ATTEMPTS,
      });
      expect(result.after).toEqual(result.before);
    });

    it("AC-21: a partial refund, then a full one: credit notes that reference the invoice and net it to zero; a replay adds nothing", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        const id = await order(tx, { lines: SINGLE });
        await capturePayment(tx, id);
        await engine(tx, id, "order.captured", { mode: "live" });
        await dispatch(tx, id);
        await walkOrderTo(tx, id, "delivered");
        const partialId = await refund(tx, id, 1_001, "order.refunded_partial");
        await dispatch(tx, id);
        const fullId = await refund(tx, id, 5_798, "order.refunded_full");
        await dispatch(tx, id);
        const replay = await issueCreditNote(partialId, opts(tx));
        return {
          docs: await documents(tx, id),
          partialId,
          fullId,
          replay,
          after: await nextNumbers(tx),
        };
      });
      const [invoice, first, second] = result.docs;
      expect(
        result.docs.map((doc) => [doc.kind, doc.number, doc.series_key]),
      ).toEqual([
        ["invoice", "FO-PL/2026/000001", "fo-pl-2026"],
        ["credit_note", "FOK-PL/2026/000001", "fok-pl-2026"],
        ["credit_note", "FOK-PL/2026/000002", "fok-pl-2026"],
      ]);
      expect(first?.refund_id).toBe(result.partialId);
      expect(second?.refund_id).toBe(result.fullId);
      expect(first?.corrects_invoice_id).toBe(invoice?.id);
      expect(first?.total_minor).toBe("-1001");
      expect(second?.total_minor).toBe("-5798");
      const a = CreditNoteSnapshotV1.parse(first?.snapshot);
      const b = CreditNoteSnapshotV1.parse(second?.snapshot);
      expect(a.corrects.number).toBe("FO-PL/2026/000001");
      expect(a.byRate).toEqual([
        { rateBp: 800, netMinor: -927, vatMinor: -74, grossMinor: -1_001 },
      ]);
      const original = InvoiceSnapshotV1.parse(invoice?.snapshot);
      const net = original.byRate.map((split, index) => ({
        gross:
          split.grossMinor +
          (a.byRate[index]?.grossMinor ?? 0) +
          (b.byRate[index]?.grossMinor ?? 0),
        vat:
          split.vatMinor +
          (a.byRate[index]?.vatMinor ?? 0) +
          (b.byRate[index]?.vatMinor ?? 0),
        net:
          split.netMinor +
          (a.byRate[index]?.netMinor ?? 0) +
          (b.byRate[index]?.netMinor ?? 0),
      }));
      expect(net).toEqual([{ gross: 0, vat: 0, net: 0 }]);
      expect(result.replay).toMatchObject({
        created: false,
        number: "FOK-PL/2026/000001",
      });
      expect(result.after["fok-pl-2026"]).toBe(3);
    });

    it("AC-21: a refund settling on a cancelled order (row 32) nets the mixed-rate invoice to zero per rate", async () => {
      const docs = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        const id = await order(tx);
        await capturePayment(tx, id);
        await engine(tx, id, "order.captured", { mode: "live" });
        await dispatch(tx, id);
        await applyTransition(tx, id, "order.cancelled", "cancelled");
        await refund(tx, id, 8_098, "order.refunded_full");
        await dispatch(tx, id);
        return documents(tx, id);
      });
      const [invoice, credit] = docs;
      expect(credit?.kind).toBe("credit_note");
      expect(credit?.total_minor).toBe("-8098");
      const original = InvoiceSnapshotV1.parse(invoice?.snapshot);
      const note = CreditNoteSnapshotV1.parse(credit?.snapshot);
      expect(note.byRate).toEqual(
        original.byRate.map((split) => ({
          rateBp: split.rateBp,
          netMinor: -split.netMinor,
          vatMinor: -split.vatMinor,
          grossMinor: -split.grossMinor,
        })),
      );
    });

    it("AC-21: a refund on an order with no invoice raises INVOICE_CREDIT_NO_INVOICE and an alert; a mixed-rate partial is refused, not split", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        await tx`UPDATE feature_flag_scope SET enabled = false
                 WHERE flag_key = 'invoice.issue' AND scope_ref = 'PL'`;
        const id = await order(tx);
        await capturePayment(tx, id);
        const orphan = await tx.savepoint(async (sp) => {
          const [row] = await sp<{ id: string }[]>`
            INSERT INTO refund (payment_id, order_id, purchase_id, provider_ref, amount_minor,
                                currency_code, reason, status, requested_by, succeeded_at)
            SELECT p.id, o.id, o.purchase_id, ${unique("re_")}, 100, 'GBP', 'quality', 'succeeded',
                   'system:test', now()
            FROM payment p JOIN "order" o ON o.purchase_id = p.purchase_id
            WHERE o.id = ${id} RETURNING id`;
          const alert = alerts();
          const code = await refusalOf(
            issueCreditNote(row?.id ?? "", opts(sp, { alert })),
          );
          return {
            code,
            alerts: alert.raised.map((raised) => raised.fields["code"]),
          };
        });
        await tx`UPDATE feature_flag_scope SET enabled = true
                 WHERE flag_key = 'invoice.issue' AND scope_ref = 'PL'`;
        await issueInvoice(id, opts(tx));
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO refund (payment_id, order_id, purchase_id, provider_ref, amount_minor,
                              currency_code, reason, status, requested_by, succeeded_at)
          SELECT p.id, o.id, o.purchase_id, ${unique("re_")}, 1000, 'GBP', 'quality', 'succeeded',
                 'system:test', now()
          FROM payment p JOIN "order" o ON o.purchase_id = p.purchase_id
          WHERE o.id = ${id} RETURNING id`;
        const before = await nextNumbers(tx);
        const alert = alerts();
        const split = await refusalOf(
          issueCreditNote(row?.id ?? "", opts(tx, { alert })),
        );
        return {
          orphan,
          split,
          splitAlerts: alert.raised.map((raised) => raised.fields["code"]),
          unchanged:
            JSON.stringify(await nextNumbers(tx)) === JSON.stringify(before),
        };
      });
      expect(result.orphan).toEqual({
        code: "INVOICE_CREDIT_NO_INVOICE",
        alerts: ["INVOICE_CREDIT_NO_INVOICE"],
      });
      expect(result.split).toBe("INVOICE_CREDIT_SPLIT_OPEN");
      expect(result.splitAlerts).toEqual(["INVOICE_CREDIT_SPLIT_OPEN"]);
      expect(result.unchanged).toBe(true);
    });

    it("AC-21: order.chargeback_lost creates no credit note", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await invoicing(tx);
        const id = await order(tx);
        await capturePayment(tx, id);
        await engine(tx, id, "order.captured", { mode: "live" });
        await dispatch(tx, id);
        await walkOrderTo(tx, id, "chargeback_open");
        await engine(tx, id, "order.chargeback_lost", {
          mode: "live",
          dispute_id: randomUUID(),
        });
        await dispatch(tx, id);
        return documents(tx, id);
      });
      expect(result.map((doc) => doc.kind)).toEqual(["invoice"]);
    });

    describe("concurrency (committed rows, own series)", () => {
      let pool: postgres.Sql;

      beforeAll(async () => {
        pool = postgres(scratch.url, { max: 22, onnotice: () => undefined });
        await pool.begin(async (tx) => {
          await tx`INSERT INTO invoice_series (key, prefix, year) VALUES
                     ('fo-cz-2026', 'FO-CZ', 2026), ('fok-cz-2026', 'FOK-CZ', 2026)`;
          await invoicing(tx, "CZ", {
            invoice: "fo-cz-2026",
            credit: "fok-cz-2026",
          });
        });
      });

      afterAll(async () => {
        await pool.end({ timeout: 5 });
      });

      async function committedOrders(count: number): Promise<string[]> {
        return pool.begin(async (tx) => {
          const ids: string[] = [];
          for (let index = 0; index < count; index += 1) {
            const id = await order(tx, { iso2: "CZ" });
            await capturePayment(tx, id);
            ids.push(id);
          }
          return ids;
        });
      }

      function issueAlone(id: string) {
        return pool.begin((tx) => issueInvoice(id, opts(tx)));
      }

      it("AC-15: twenty concurrent issuances in one series give 1..20, no gap, no duplicate", async () => {
        const ids = await committedOrders(20);
        const results = await Promise.all(ids.map((id) => issueAlone(id)));
        const numbers = results.map((result) => result.number).sort();
        expect(numbers).toEqual(
          Array.from(
            { length: 20 },
            (_, index) => `FO-CZ/2026/${String(index + 1).padStart(6, "0")}`,
          ),
        );
        const [series] = await pool<{ next_number: number }[]>`
          SELECT next_number FROM invoice_series WHERE key = 'fo-cz-2026'`;
        expect(series?.next_number).toBe(21);
      }, 60_000);

      it("a double issue of one order on retry, at once: one invoice, the second call returns it", async () => {
        const [id] = await committedOrders(1);
        const [one, two] = await Promise.all([
          issueAlone(id ?? ""),
          issueAlone(id ?? ""),
        ]);
        expect([one?.created, two?.created].sort()).toEqual([false, true]);
        expect(one?.number).toBe(two?.number);
        const [count] = await pool<{ n: number }[]>`
          SELECT count(*)::int AS n FROM invoice WHERE order_id = ${id ?? ""}`;
        expect(count?.n).toBe(1);
        const [series] = await pool<{ next_number: number }[]>`
          SELECT next_number FROM invoice_series WHERE key = 'fo-cz-2026'`;
        expect(series?.next_number).toBe(22);
      }, 60_000);
    });
  },
);
