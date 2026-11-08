/**
 * The management-figures CSV (spec 030b §2.5, §5.2 `financeCsv`, §5.4; AC-23; TASK-440).
 *
 * Three files, each with the configured header as its first line exactly: the order list (one
 * row per order, paid on then reference), the florist table and the country table. Amounts are
 * unquoted machine decimals from `signedDecimalString` with a currency column beside them; rates
 * are six-decimal strings with their date and source; text cells are neutralised against
 * formula injection (`src/lib/csv.ts`). No buyer, recipient, legal name, email, phone or public
 * token is read, so none can be written. Built in memory; nothing goes to disk or to R2.
 *
 * The download writes one audit row (`audit_record_view('finance_export', kind)`, action
 * `finance_export.viewed`, the range in the reason), in the same admin transaction as the read.
 */
import { sql } from "drizzle-orm";

import { FINANCE_CONFIG, type FinanceConfig } from "@/config/finance";
import {
  type CsvCell,
  csvAmount,
  csvDocument,
  csvEmpty,
  csvRate,
  csvText,
} from "@/lib/csv";

import {
  exponentOf,
  type FinanceGroup,
  type OrderMargin,
  rollUp,
  type RateUse,
} from "./margin";
import { type FinanceRunner, financeOrders, financeRunner } from "./queries";
import type {
  FinanceExportKind,
  FinanceExportQuery,
  FinanceRange,
} from "./range";

/** The audit action of a CSV download (`audit_record_view` needs `.viewed`). */
export const FINANCE_EXPORT_ACTION = "finance_export.viewed";
/** The entity the audit row names; its id is the kind of table. */
export const FINANCE_EXPORT_ENTITY = "finance_export";

/** `management-figures-{kind}-{from}-{to}.csv` (§5.4). */
export function financeCsvFilename(
  kind: FinanceExportKind,
  range: FinanceRange,
): string {
  return `management-figures-${kind}-${range.from}-${range.to}.csv`;
}

const SOURCE_LABEL: Readonly<Record<RateUse["source"], string>> = {
  ecb: "ECB",
  stripe: "Stripe",
};

function reportingCells(
  value: bigint | undefined | null,
  exponent: number,
): CsvCell {
  return value === undefined || value === null
    ? csvEmpty
    : csvAmount(value, exponent);
}

function rateCells(rate: RateUse | null): readonly CsvCell[] {
  return rate === null
    ? [csvEmpty, csvEmpty, csvEmpty]
    : [
        csvRate(rate.ratePpm),
        csvText(rate.asOf),
        csvText(SOURCE_LABEL[rate.source]),
      ];
}

function percentCell(bp: bigint | null): CsvCell {
  return bp === null ? csvEmpty : csvAmount(bp, 2);
}

function countCell(count: number): CsvCell {
  return csvAmount(BigInt(count), 0);
}

/** Paid on, then reference (AC-23). */
function inFileOrder(orders: readonly OrderMargin[]): OrderMargin[] {
  return [...orders].sort((a, b) =>
    a.paidOn === b.paidOn
      ? a.reference < b.reference
        ? -1
        : a.reference > b.reference
          ? 1
          : 0
      : a.paidOn < b.paidOn
        ? -1
        : 1,
  );
}

function orderRecord(order: OrderMargin, config: FinanceConfig): CsvCell[] {
  const expR = exponentOf(config.reportingCurrency);
  const expB = exponentOf(order.buyerCurrency);
  const r = order.reporting;
  return [
    csvText(order.reference),
    csvText(order.mode),
    csvText(order.paidOn),
    csvText(order.deliveryDate),
    csvText(order.countryIso2),
    order.partnerCode === null ? csvEmpty : csvText(order.partnerCode),
    order.partnerCity === null ? csvEmpty : csvText(order.partnerCity),
    csvText(order.final ? "final" : "provisional"),
    order.reasons.length === 0 ? csvEmpty : csvText(order.reasons.join(";")),
    csvText(order.buyerCurrency),
    csvAmount(order.grossMinor, expB),
    ...rateCells(order.saleRate),
    csvText(config.reportingCurrency),
    reportingCells(r?.gross, expR),
    reportingCells(r?.settled, expR),
    reportingCells(r?.fxCost, expR),
    reportingCells(r?.refunds, expR),
    csvAmount(order.vatMinor, expB),
    reportingCells(r?.vat, expR),
    csvText(order.vatIsEstimate ? "true" : "false"),
    reportingCells(r?.net, expR),
    order.floristCurrency === null ? csvEmpty : csvText(order.floristCurrency),
    order.floristCurrency === null
      ? csvEmpty
      : csvAmount(order.floristCostMinor, exponentOf(order.floristCurrency)),
    ...rateCells(order.floristRate),
    reportingCells(r?.floristCost, expR),
    reportingCells(r?.fees, expR),
    reportingCells(r?.disputes, expR),
    reportingCells(r?.margin, expR),
    percentCell(order.marginBp),
  ];
}

function floristRecord(
  group: FinanceGroup,
  city: string | null,
  config: FinanceConfig,
): CsvCell[] {
  const expR = exponentOf(config.reportingCurrency);
  return [
    group.key === "" ? csvEmpty : csvText(group.key),
    city === null ? csvEmpty : csvText(city),
    csvText(config.reportingCurrency),
    countCell(group.orders),
    countCell(group.withFigures),
    csvAmount(group.sums.net, expR),
    csvAmount(group.sums.floristCost, expR),
    csvAmount(group.sums.fees, expR),
    csvAmount(group.sums.margin, expR),
    percentCell(group.marginBp),
  ];
}

function countryRecord(group: FinanceGroup, config: FinanceConfig): CsvCell[] {
  const expR = exponentOf(config.reportingCurrency);
  return [
    csvText(group.key),
    csvText(config.reportingCurrency),
    countCell(group.orders),
    countCell(group.withFigures),
    csvAmount(group.sums.settled, expR),
    csvAmount(group.sums.refunds, expR),
    csvAmount(group.sums.vat, expR),
    csvAmount(group.sums.net, expR),
    csvAmount(group.sums.floristCost, expR),
    csvAmount(group.sums.fees, expR),
    csvAmount(group.sums.disputes, expR),
    csvAmount(group.sums.margin, expR),
    percentCell(group.marginBp),
  ];
}

/** §5.2 `financeCsv`: the file's text for one kind, from the orders `orderMargin` computed. */
export function financeCsv(
  kind: FinanceExportKind,
  orders: readonly OrderMargin[],
  config: FinanceConfig = FINANCE_CONFIG,
): string {
  const sorted = inFileOrder(orders);
  if (kind === "orders") {
    return csvDocument(
      config.csvHeaders.orders,
      sorted.map((order) => orderRecord(order, config)),
    );
  }
  if (kind === "florists") {
    const cities = new Map(
      sorted.map((order) => [order.partnerCode ?? "", order.partnerCity]),
    );
    return csvDocument(
      config.csvHeaders.florists,
      rollUp(sorted, "partner").map((group) =>
        floristRecord(group, cities.get(group.key) ?? null, config),
      ),
    );
  }
  return csvDocument(
    config.csvHeaders.countries,
    rollUp(sorted, "country").map((group) => countryRecord(group, config)),
  );
}

/** The CSV's text and file name. */
export interface FinanceCsvFile {
  readonly filename: string;
  readonly body: string;
}

/**
 * Reads the range, writes the one audit row and returns the file, in one admin transaction.
 * The reason field carries the range (dates, basis, mode and filters: no personal data).
 */
export async function exportFinanceCsv(
  actor: { readonly userId: string; readonly requestId: string },
  query: FinanceExportQuery,
  zone: string,
  now: Date,
  run: FinanceRunner = financeRunner,
  config: FinanceConfig = FINANCE_CONFIG,
): Promise<FinanceCsvFile> {
  const { range, kind } = query;
  const reason = [
    `${range.from}..${range.to}`,
    `basis=${range.basis}`,
    `mode=${range.mode}`,
    ...(range.country === undefined ? [] : [`country=${range.country}`]),
    ...(range.partner === undefined ? [] : [`partner=${range.partner}`]),
  ].join(" ");
  return run(
    { ...actor, action: FINANCE_EXPORT_ACTION, reason },
    async (executor) => {
      const { orders } = await financeOrders(
        executor,
        range,
        zone,
        now,
        config,
      );
      await executor.execute(
        sql`SELECT public.audit_record_view(${FINANCE_EXPORT_ENTITY}, ${kind})`,
      );
      return {
        filename: financeCsvFilename(kind, range),
        body: financeCsv(kind, orders, config),
      };
    },
  );
}
