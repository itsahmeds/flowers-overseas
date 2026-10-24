/**
 * Drizzle definitions for the invoice tables — `tax_registration`, `invoice_series`,
 * `invoice_profile` and `invoice` (spec 018 §5.1, AC-16; migration `0021_post_purchase.sql`;
 * TASK-337).
 *
 * The typed mirror of the migration. What to read off this file:
 *
 *  - **an invoice never changes** — `0021`'s `invoice_immutable()` refuses every `UPDATE` except
 *    the one `NULL → value` write of the three render columns, and every `DELETE` (AC-16); a wrong
 *    invoice is corrected by a credit note. Drizzle does not model triggers;
 *  - **an invoice is in its order's currency** — it references the order by
 *    `(order_id, currency_code)`, as a payment does (spec 002 §2 money pair);
 *  - **switching profile is a data change** — `invoice_profile` holds the title, issuer statement,
 *    label languages, VAT-bearing line kinds, series and optional second VAT currency per
 *    `(supply_model, destination)`, one active row each (AC-18).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { currency, supplyModels } from "./geo.ts";
import { timestamps } from "./i18n.ts";
import { order } from "./orders.ts";
import { refund } from "./payments.ts";

export const invoiceDocumentKinds = [
  "vat_invoice",
  "receipt_on_behalf",
] as const;
export const vatRateSources = ["nbp_previous_business_day"] as const;
export const invoiceKinds = ["invoice", "credit_note"] as const;
/** `order_line.kind` (`0007`): the kinds a profile may say carry VAT. */
export const invoiceLineKinds = ["product", "addon", "surcharge"] as const;

function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

const CURRENCY_PATTERN = "^[A-Z]{3}$";
const KEY_PATTERN = "^[a-z0-9][a-z0-9-]*$";

export const taxRegistration = pgTable(
  "tax_registration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryIso2: text("country_iso2").notNull(),
    vatId: text("vat_id").notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    ...timestamps,
  },
  (table) => [
    unique("tax_registration_country_iso2_valid_from_key").on(
      table.countryIso2,
      table.validFrom,
    ),
    check(
      "tax_registration_country_iso2_check",
      sql.raw(`country_iso2 ~ '^[A-Z]{2}$'`),
    ),
    check("tax_registration_vat_id_check", sql`btrim(${table.vatId}) <> ''`),
    check(
      "tax_registration_valid_to_check",
      sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`,
    ),
  ],
);

export const invoiceSeries = pgTable(
  "invoice_series",
  {
    key: text("key").primaryKey(),
    prefix: text("prefix").notNull(),
    year: smallint("year").notNull(),
    nextNumber: integer("next_number").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    unique("invoice_series_prefix_year_key").on(table.prefix, table.year),
    check("invoice_series_key_check", sql.raw(`key ~ '${KEY_PATTERN}'`)),
    check(
      "invoice_series_prefix_check",
      sql.raw(`prefix ~ '^[A-Z][A-Z0-9-]*$'`),
    ),
    check(
      "invoice_series_year_check",
      sql`${table.year} between 2000 and 9999`,
    ),
    check("invoice_series_next_number_check", sql`${table.nextNumber} >= 1`),
  ],
);

export const invoiceProfile = pgTable(
  "invoice_profile",
  {
    key: text("key").primaryKey(),
    supplyModel: text("supply_model").notNull(),
    destinationIso2: text("destination_iso2").notNull(),
    documentKind: text("document_kind").notNull(),
    titleKey: text("title_key").notNull(),
    issuerStatementKey: text("issuer_statement_key"),
    labelLocales: text("label_locales").array().notNull(),
    vatBearingLineKinds: text("vat_bearing_line_kinds").array().notNull(),
    seriesKey: text("series_key")
      .notNull()
      .references(() => invoiceSeries.key, { onDelete: "restrict" }),
    creditSeriesKey: text("credit_series_key")
      .notNull()
      .references(() => invoiceSeries.key, { onDelete: "restrict" }),
    vatCurrencyCode: text("vat_currency_code").references(() => currency.code, {
      onDelete: "restrict",
    }),
    vatRateSource: text("vat_rate_source"),
    active: boolean("active").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("invoice_profile_active_idx")
      .on(table.supplyModel, table.destinationIso2)
      .where(sql`active`),
    check("invoice_profile_key_check", sql.raw(`key ~ '${KEY_PATTERN}'`)),
    check(
      "invoice_profile_supply_model_check",
      sql.raw(`supply_model in ${valueList(supplyModels)}`),
    ),
    check(
      "invoice_profile_destination_iso2_check",
      sql.raw(`destination_iso2 ~ '^[A-Z]{2}$'`),
    ),
    check(
      "invoice_profile_document_kind_check",
      sql.raw(`document_kind in ${valueList(invoiceDocumentKinds)}`),
    ),
    check(
      "invoice_profile_title_key_check",
      sql`btrim(${table.titleKey}) <> ''`,
    ),
    check(
      "invoice_profile_issuer_statement_key_check",
      sql`${table.issuerStatementKey} is null or btrim(${table.issuerStatementKey}) <> ''`,
    ),
    check(
      "invoice_profile_label_locales_check",
      sql`cardinality(${table.labelLocales}) >= 1`,
    ),
    check(
      "invoice_profile_vat_bearing_line_kinds_check",
      sql.raw(
        `vat_bearing_line_kinds <@ ARRAY[${invoiceLineKinds.map((kind) => `'${kind}'`).join(", ")}]::text[]`,
      ),
    ),
    check(
      "invoice_profile_vat_rate_source_check",
      sql.raw(`vat_rate_source in ${valueList(vatRateSources)}`),
    ),
    check(
      "invoice_profile_vat_currency_check",
      sql`(${table.vatCurrencyCode} is null) = (${table.vatRateSource} is null)`,
    ),
  ],
);

export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    orderId: uuid("order_id").notNull(),
    refundId: uuid("refund_id").references(() => refund.id, {
      onDelete: "restrict",
    }),
    correctsInvoiceId: uuid("corrects_invoice_id"),
    seriesKey: text("series_key")
      .notNull()
      .references(() => invoiceSeries.key, { onDelete: "restrict" }),
    number: text("number").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    supplyDate: date("supply_date").notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    profileKey: text("profile_key")
      .notNull()
      .references(() => invoiceProfile.key, { onDelete: "restrict" }),
    snapshot: jsonb("snapshot").notNull(),
    snapshotVersion: integer("snapshot_version").notNull(),
    pdfObjectKey: text("pdf_object_key"),
    pdfSha256: text("pdf_sha256"),
    renderedAt: timestamp("rendered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("invoice_number_key").on(table.number),
    foreignKey({
      name: "invoice_order_fkey",
      columns: [table.orderId, table.currencyCode],
      foreignColumns: [order.id, order.buyerCurrencyCode],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoice_corrects_invoice_id_invoice_id_fk",
      columns: [table.correctsInvoiceId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    check("invoice_kind_check", sql.raw(`kind in ${valueList(invoiceKinds)}`)),
    check(
      "invoice_kind_links_check",
      sql`(${table.kind} = 'invoice' and ${table.refundId} is null and ${table.correctsInvoiceId} is null) or (${table.kind} = 'credit_note' and ${table.correctsInvoiceId} is not null)`,
    ),
    check("invoice_number_check", sql`btrim(${table.number}) <> ''`),
    check(
      "invoice_currency_code_check",
      sql.raw(`currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "invoice_snapshot_check",
      sql`jsonb_typeof(${table.snapshot}) = 'object'`,
    ),
    check("invoice_snapshot_version_check", sql`${table.snapshotVersion} >= 1`),
    check("invoice_pdf_sha256_check", sql.raw(`pdf_sha256 ~ '^[0-9a-f]{64}$'`)),
    check(
      "invoice_pdf_object_key_check",
      sql`btrim(${table.pdfObjectKey}) <> ''`,
    ),
    check(
      "invoice_render_check",
      sql`(${table.pdfObjectKey} is null) = (${table.pdfSha256} is null) and (${table.pdfSha256} is null) = (${table.renderedAt} is null)`,
    ),
    uniqueIndex("invoice_one_per_order_idx")
      .on(table.orderId)
      .where(sql`kind = 'invoice'`),
    uniqueIndex("invoice_one_per_refund_idx")
      .on(table.refundId)
      .where(sql`kind = 'credit_note'`),
    index("invoice_order_id_idx").on(table.orderId),
  ],
);
