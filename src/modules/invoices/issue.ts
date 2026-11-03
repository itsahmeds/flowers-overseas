/**
 * `issueInvoice(orderId)` (spec 018 §5.2 `modules/invoices`, AC-15, AC-20; TASK-341).
 *
 * One transaction (the caller's, or a `system` one): the order row is locked
 * (`FOR NO KEY UPDATE`, so two deliveries of one order queue instead of racing), then, in order:
 *
 *  1. `INVOICE_NOT_LIVE` unless `order.mode = 'live'` (no alert, no number);
 *  2. an existing `kind = 'invoice'` row for the order is returned unchanged (idempotent: row 14's
 *     second `order.captured` issues nothing, AC-15);
 *  3. `INVOICE_NOT_CAPTURED` unless a `payment` of the order's purchase has `captured_at` (the
 *     payment belongs to the purchase since `0026_payment_purchase`, spec 013 §14 Q19; the money
 *     fact is the column, never the event; retried, alerted after the retries);
 *  4. `INVOICE_FLAG_OFF` unless `invoice.issue` is on for the destination;
 *  5. `INVOICE_SUPPLY_MODEL_UNSET` when `order.supply_model` is null;
 *  6. `INVOICE_NO_PROFILE` when no active profile matches `(supply_model, destination)`;
 *  7. `INVOICE_ISSUER_INCOMPLETE` when `company.registered` is false or no `tax_registration` of
 *     the profile's country is valid on the issue date;
 *  8. `INVOICE_TOTAL_MISMATCH` when the lines, `vat_breakdown` and `buyer_total_minor` disagree;
 *  9. the second-VAT-currency rate, if the profile asks for one (before any lock on the series);
 * 10. `SELECT … FOR UPDATE` on the series row, the number, the `invoice` row with its snapshot.
 *
 * Every refusal is raised inside `guarded`'s savepoint, so no number is consumed (AC-20).
 *
 * **Dates.** `issued_at` is the transaction's `now()`; the snapshot's `issueDate` is that instant's
 * date in the destination's zone. `supply_date` is the order's delivery date (the day the flowers
 * are supplied). The tax point handed to the rate provider is the first `payment.captured_at`'s
 * date in the destination's zone (§5.2 "NBP adapter").
 *
 * **The year.** The number carries the series row's own `year`; a new year is a new series row
 * and the profile repointed to it, by data (the invoices runbook, TASK-342).
 *
 * `invoice.render` is not enqueued here: its queue, payload and handler are TASK-342's (spec 018
 * §12 task 3 part b), which picks up every invoice whose render columns are null.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  jsonb,
  orderReference,
  withExecutor,
  type OrderExecutor,
} from "@/modules/orders";

import { InvoiceRefusal } from "./errors";
import {
  allocateNumber,
  guarded,
  invoiceFlagOn,
  resolve,
  type InvoiceOptions,
  type IssueResult,
  type Resolved,
} from "./shared";
import {
  InvoiceSnapshotV1,
  SNAPSHOT_VERSION,
  type InvoiceSnapshot,
  type VatRateSnapshot,
} from "./snapshot";
import { invoiceByRate } from "./vat";
import { vatRateProvider } from "./vat-rate";

const Minor = z.coerce.number().int();

const OrderRow = z.object({
  id: z.uuid(),
  mode: z.enum(["demo", "test", "live"]),
  buyer_currency_code: z.string(),
  buyer_total_minor: Minor,
  vat_breakdown: z.array(
    z
      .object({ rateBp: z.number().int(), grossMinor: z.number().int() })
      .loose(),
  ),
  supply_model: z.enum(["principal", "agent"]).nullable(),
  buyer_snapshot: z
    .object({ name: z.string().min(1), countryIso2: z.string() })
    .loose(),
  locale_code: z.string(),
  delivery_date: z.iso.date(),
  destination_iso2: z.string().regex(/^[A-Z]{2}$/),
  issue_date: z.iso.date(),
  tax_point_date: z.iso.date().nullable(),
});

const ExistingRow = z.object({ id: z.uuid(), number: z.string() });

const ProfileRow = z.object({
  key: z.string(),
  destination_iso2: z.string(),
  label_locales: z.array(z.string()),
  vat_bearing_line_kinds: z.array(z.string()),
  series_key: z.string(),
  vat_currency_code: z.string().nullable(),
});

const RegistrationRow = z.object({
  country_iso2: z.string(),
  vat_id: z.string(),
});

const LineRow = z.object({
  kind: z.enum(["product", "addon", "surcharge"]),
  qty: z.coerce.number().int().positive(),
  unit_retail_minor: Minor,
  vat_rate_bp: z.coerce.number().int(),
  names: z.record(z.string(), z.string()),
});

const IdRow = z.object({ id: z.uuid() });

async function readOrder(executor: OrderExecutor, orderId: string) {
  const [row] = await executor.execute(sql`
    SELECT o.id, o.mode, o.buyer_currency_code, o.buyer_total_minor, o.vat_breakdown,
           o.supply_model, o.buyer_snapshot, o.locale_code, o.delivery_date::text AS delivery_date,
           c.iso2 AS destination_iso2,
           (now() AT TIME ZONE c.iana_zone)::date::text AS issue_date,
           (SELECT (min(p.captured_at) AT TIME ZONE c.iana_zone)::date::text
            FROM payment p WHERE p.purchase_id = o.purchase_id AND p.captured_at IS NOT NULL) AS tax_point_date
    FROM "order" o JOIN country c ON c.id = o.destination_country_id
    WHERE o.id = ${orderId}
    FOR NO KEY UPDATE OF o`);
  if (row === undefined) {
    throw new Error(`INVOICE_ORDER_NOT_FOUND: order ${orderId}`);
  }
  return OrderRow.parse(row);
}

/** The issuer block, or `INVOICE_ISSUER_INCOMPLETE`. */
async function issuer(
  executor: OrderExecutor,
  resolved: Resolved,
  countryIso2: string,
  issueDate: string,
  orderId: string,
): Promise<InvoiceSnapshot["issuer"]> {
  const company = resolved.company;
  const [registration] = await executor.execute(sql`
    SELECT country_iso2, vat_id FROM tax_registration
    WHERE country_iso2 = ${countryIso2}
      AND valid_from <= ${issueDate}::date
      AND (valid_to IS NULL OR valid_to >= ${issueDate}::date)
    ORDER BY valid_from DESC
    LIMIT 1`);
  if (
    !company.registered ||
    company.legalName === undefined ||
    company.registryName === undefined ||
    company.registrationNumber === undefined ||
    company.address === undefined ||
    registration === undefined
  ) {
    throw new InvoiceRefusal("INVOICE_ISSUER_INCOMPLETE", { orderId });
  }
  const vat = RegistrationRow.parse(registration);
  return {
    legalName: company.legalName,
    registryName: company.registryName,
    registrationNumber: company.registrationNumber,
    address: {
      lines: [...company.address.lines],
      postalCode: company.address.postalCode,
      city: company.address.city,
      countryIso2: company.address.countryIso2,
    },
    vatIds: [{ countryIso2: vat.country_iso2, vatId: vat.vat_id }],
  };
}

async function readLines(
  executor: OrderExecutor,
  orderId: string,
  locales: readonly string[],
) {
  const list = sql.join(
    locales.map((code) => sql`${code}`),
    sql`, `,
  );
  const rows = await executor.execute(sql`
    SELECT l.kind, l.qty, l.unit_retail_minor, l.vat_rate_bp,
           coalesce(
             (SELECT jsonb_object_agg(t.locale_code, t.name) FROM product_translation t
              WHERE t.product_id = l.product_id AND t.locale_code IN (${list})),
             (SELECT jsonb_object_agg(t.locale_code, t.name) FROM addon_translation t
              WHERE t.addon_id = l.addon_id AND t.locale_code IN (${list})),
             '{}'::jsonb) AS names
    FROM order_line l
    WHERE l.order_id = ${orderId}
    ORDER BY l.created_at, array_position(ARRAY['product', 'addon', 'surcharge'], l.kind),
             l.vat_rate_bp, l.id`);
  return rows.map((row) => LineRow.parse(row));
}

async function issueIn(
  executor: OrderExecutor,
  orderId: string,
  options: InvoiceOptions,
  resolved: Resolved,
): Promise<IssueResult> {
  const order = await readOrder(executor, orderId);
  if (order.mode !== "live") {
    throw new InvoiceRefusal("INVOICE_NOT_LIVE", { orderId });
  }
  const [existing] = await executor.execute(sql`
    SELECT id, number FROM invoice WHERE order_id = ${orderId} AND kind = 'invoice'`);
  if (existing !== undefined) {
    const row = ExistingRow.parse(existing);
    return { invoiceId: row.id, number: row.number, created: false };
  }
  if (order.tax_point_date === null) {
    throw new InvoiceRefusal("INVOICE_NOT_CAPTURED", { orderId });
  }
  if (!(await invoiceFlagOn(executor, order.destination_iso2))) {
    throw new InvoiceRefusal("INVOICE_FLAG_OFF", { orderId });
  }
  if (order.supply_model === null) {
    throw new InvoiceRefusal("INVOICE_SUPPLY_MODEL_UNSET", { orderId });
  }
  const [profileRow] = await executor.execute(sql`
    SELECT key, destination_iso2, label_locales, vat_bearing_line_kinds, series_key,
           vat_currency_code
    FROM invoice_profile
    WHERE active AND supply_model = ${order.supply_model}
      AND destination_iso2 = ${order.destination_iso2}`);
  if (profileRow === undefined) {
    throw new InvoiceRefusal("INVOICE_NO_PROFILE", { orderId });
  }
  const profile = ProfileRow.parse(profileRow);
  const issuerBlock = await issuer(
    executor,
    resolved,
    profile.destination_iso2,
    order.issue_date,
    orderId,
  );
  const labelLocales = [
    ...new Set(
      profile.label_locales.map((code) =>
        code === "{buyer}" ? order.locale_code : code,
      ),
    ),
  ];
  const lines = await readLines(executor, orderId, labelLocales);
  const arithmetic = invoiceByRate({
    orderId,
    buyerTotalMinor: order.buyer_total_minor,
    lines: lines.map((line) => ({
      kind: line.kind,
      qty: line.qty,
      unitRetailMinor: line.unit_retail_minor,
      vatRateBp: line.vat_rate_bp,
    })),
    breakdown: order.vat_breakdown,
    vatBearingKinds: profile.vat_bearing_line_kinds,
  });

  let vatRate: VatRateSnapshot | null = null;
  if (
    profile.vat_currency_code !== null &&
    profile.vat_currency_code !== order.buyer_currency_code
  ) {
    vatRate = await (options.vatRates ?? vatRateProvider()).rateFor({
      from: order.buyer_currency_code,
      to: profile.vat_currency_code,
      taxPointDate: order.tax_point_date,
    });
  }

  const snapshot = InvoiceSnapshotV1.parse({
    kind: "invoice",
    issuer: issuerBlock,
    buyer: {
      name: order.buyer_snapshot.name,
      countryIso2: order.buyer_snapshot.countryIso2,
    },
    supplyDate: order.delivery_date,
    issueDate: order.issue_date,
    lines: lines.map((line) => ({
      kind: line.kind,
      qty: line.qty,
      unitGrossMinor: line.unit_retail_minor,
      grossMinor: line.unit_retail_minor * line.qty,
      vatRateBp: line.vat_rate_bp,
      vatBearing: profile.vat_bearing_line_kinds.includes(line.kind),
      names: line.names,
    })),
    byRate: arithmetic.byRate,
    outsideVatMinor: arithmetic.outsideVatMinor,
    totals: arithmetic.totals,
    currency: order.buyer_currency_code,
    vatCurrency: profile.vat_currency_code,
    vatRate,
    profileKey: profile.key,
    labelLocales,
    orderReference: orderReference(orderId),
  });

  const number = await allocateNumber(executor, profile.series_key);
  const [inserted] = await executor.execute(sql`
    INSERT INTO invoice (kind, order_id, series_key, number, issued_at, supply_date,
                         currency_code, total_minor, profile_key, snapshot, snapshot_version)
    VALUES ('invoice', ${orderId}, ${profile.series_key}, ${number}, now(),
            ${order.delivery_date}::date, ${order.buyer_currency_code},
            ${arithmetic.totals.grossMinor}, ${profile.key}, ${jsonb(snapshot)},
            ${SNAPSHOT_VERSION})
    RETURNING id`);
  const invoiceId = IdRow.parse(inserted).id;
  resolved.log.info(
    {
      invoice_id: invoiceId,
      order_id: orderId,
      series: profile.series_key,
      number,
    },
    "invoice.issued",
  );
  return { invoiceId, number, created: true };
}

/** Issues the order's invoice, or returns the one it has. Throws an `InvoiceRefusal`. */
export async function issueInvoice(
  orderId: string,
  options: InvoiceOptions = {},
): Promise<IssueResult> {
  const resolved = resolve(options);
  return withExecutor(options, "invoice.issue", (executor) =>
    guarded(executor, { orderId }, resolved, () =>
      issueIn(executor, orderId, options, resolved),
    ),
  );
}
