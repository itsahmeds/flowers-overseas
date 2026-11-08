/**
 * What `issueInvoice` and `issueCreditNote` share (spec 018 §5.2; TASK-341): the options, the
 * refusal guard (savepoint, log line, alert), the gap-free number, and the flag read.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { COMPANY, type Company } from "@/config/company";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { raiseLegacyAlert } from "@/modules/ops";
import type {
  AlertRaiser,
  EngineConnection,
  OrderExecutor,
} from "@/modules/orders";

import { alertsAtOnce, isInvoiceRefusal } from "./errors";
import type { VatRateProvider } from "./vat-rate";

export interface InvoiceOptions extends EngineConnection {
  /** The issuer identity; defaults to `src/config/company.ts`. */
  readonly company?: Company;
  /** The second-VAT-currency rate source; defaults to the configured one (`./vat-rate.ts`). */
  readonly vatRates?: VatRateProvider;
  readonly alert?: AlertRaiser;
  readonly log?: Logger;
}

export interface Resolved {
  readonly company: Company;
  readonly alert: AlertRaiser;
  readonly log: Logger;
}

export function resolve(options: InvoiceOptions): Resolved {
  return {
    company: options.company ?? COMPANY,
    alert: options.alert ?? raiseLegacyAlert,
    log: options.log ?? defaultLogger,
  };
}

/** What an issue returns. `created` is false when the document already existed (idempotent). */
export interface IssueResult {
  readonly invoiceId: string;
  readonly number: string;
  readonly created: boolean;
}

/**
 * Runs `fn` inside a savepoint of the caller's transaction. A refusal (or any error) rolls the
 * savepoint back, so a number taken before the throw is given back, and the caller's transaction
 * stays usable. A refusal is logged (`invoice.refused {code}`) and, per `./errors.ts`, alerted.
 */
export async function guarded<T>(
  executor: OrderExecutor,
  ids: { readonly orderId?: string; readonly refundId?: string },
  resolved: Resolved,
  fn: () => Promise<T>,
): Promise<T> {
  await executor.execute(sql`SAVEPOINT invoice_issue`);
  try {
    const result = await fn();
    await executor.execute(sql`RELEASE SAVEPOINT invoice_issue`);
    return result;
  } catch (error) {
    await executor.execute(sql`ROLLBACK TO SAVEPOINT invoice_issue`);
    await executor.execute(sql`RELEASE SAVEPOINT invoice_issue`);
    if (isInvoiceRefusal(error)) {
      const orderId = error.detail.orderId ?? ids.orderId;
      const refundId = error.detail.refundId ?? ids.refundId;
      const fields = {
        code: error.code,
        ...(orderId === undefined ? {} : { order_id: orderId }),
        ...(refundId === undefined ? {} : { refund_id: refundId }),
      };
      resolved.log.warn(fields, "invoice.refused");
      if (alertsAtOnce(error.code)) resolved.alert("invoice.refused", fields);
    }
    throw error;
  }
}

const SeriesRow = z.object({
  prefix: z.string().min(1),
  year: z.coerce.number().int(),
  next_number: z.coerce.number().int().positive(),
});

/** `FO-PL/2026/000001` (§13 Q4). */
export function formatNumber(
  prefix: string,
  year: number,
  sequence: number,
): string {
  return `${prefix}/${String(year)}/${String(sequence).padStart(6, "0")}`;
}

/**
 * Takes the series' next number under `SELECT … FOR UPDATE` (§5.2): a second issuer in the same
 * series waits on the row lock until the first commits or rolls back, so the numbers are gap-free
 * and never shared. Called last, after every refusal, inside `guarded`'s savepoint.
 */
export async function allocateNumber(
  executor: OrderExecutor,
  seriesKey: string,
): Promise<string> {
  const [row] = await executor.execute(sql`
    SELECT prefix, year, next_number FROM invoice_series WHERE key = ${seriesKey} FOR UPDATE`);
  const series = SeriesRow.parse(row);
  await executor.execute(sql`
    UPDATE invoice_series SET next_number = next_number + 1 WHERE key = ${seriesKey}`);
  return formatNumber(series.prefix, series.year, series.next_number);
}

const FlagRow = z.object({ enabled: z.boolean().nullable() });

/**
 * `invoice.issue` for a destination, read in the issuing transaction (so a flip is seen at once,
 * not after `src/lib/flags.ts`'s 60 s cache): the `country` scope row if there is one, else the
 * flag's default; a missing flag row reads as off. The same resolution as `flags.ts` step 3-4.
 */
export async function invoiceFlagOn(
  executor: OrderExecutor,
  countryIso2: string,
): Promise<boolean> {
  const [row] = await executor.execute(sql`
    SELECT coalesce(
             (SELECT s.enabled FROM feature_flag_scope s
              WHERE s.flag_key = f.key AND s.scope = 'country' AND s.scope_ref = ${countryIso2}),
             f.enabled_default) AS enabled
    FROM feature_flag f WHERE f.key = 'invoice.issue'`);
  return row === undefined ? false : FlagRow.parse(row).enabled === true;
}
